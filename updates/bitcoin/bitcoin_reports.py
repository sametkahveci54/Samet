"""Twice-daily BTC/EUR reports with durable per-device push delivery."""
import base64
import json
import math
import os
from pathlib import Path
import sqlite3
import subprocess
import threading
import time
import urllib.request
from urllib.parse import urlsplit
from datetime import datetime
from zoneinfo import ZoneInfo

DIRECTORY = Path.home() / 'Library/Application Support/Jarvis/Bitcoin'
BERLIN = ZoneInfo('Europe/Berlin')
LOCK = threading.RLock()
SOURCE = 'https://api.exchange.coinbase.com/products/BTC-EUR/stats'
HOST = ''


def database():
    DIRECTORY.mkdir(parents=True, exist_ok=True, mode=0o700)
    conn = sqlite3.connect(DIRECTORY / 'reports.sqlite')
    conn.row_factory = sqlite3.Row
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS reports(slot TEXT PRIMARY KEY, created TEXT, body TEXT);
        CREATE TABLE IF NOT EXISTS devices(endpoint TEXT PRIMARY KEY, subscription TEXT, since TEXT);
        CREATE TABLE IF NOT EXISTS deliveries(slot TEXT, endpoint TEXT, state TEXT, PRIMARY KEY(slot,endpoint));
    ''')
    os.chmod(DIRECTORY / 'reports.sqlite', 0o600)
    return conn


def validate_subscription(value):
    if not isinstance(value, dict):
        raise ValueError('Push-Anmeldung fehlt.')
    endpoint = value.get('endpoint', '')
    parsed = urlsplit(endpoint)
    allowed = parsed.hostname in {'web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com'}
    if not allowed or parsed.scheme != 'https' or parsed.port not in (None, 443) or parsed.username or parsed.password or parsed.fragment or len(endpoint) > 4096:
        raise ValueError('Push-Dienst wird nicht unterstützt.')
    keys = value.get('keys', {})
    for key, size in [('auth', 16), ('p256dh', 65)]:
        try:
            decoded = base64.urlsafe_b64decode(keys[key] + '=' * (-len(keys[key]) % 4))
            if len(decoded) != size:
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise ValueError('Push-Schlüssel ungültig.') from None
    return {'endpoint': endpoint, 'keys': keys}


def push(subscription, title, body, tag):
    result = subprocess.run([str(DIRECTORY / 'venv/bin/python'), str(Path(__file__).with_name('bitcoin_push.py'))],
        input=json.dumps({'subscription': subscription, 'title': title, 'body': body, 'tag': tag, 'host': HOST}),
        text=True, capture_output=True, timeout=25)
    if result.returncode:
        return 'retry'
    return json.loads(result.stdout)['status']


def market_report():
    request = urllib.request.Request(SOURCE, headers={'User-Agent': 'Jarvis-Bitcoin/1.0', 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=15) as response:
        data = json.loads(response.read(65536))
    values = {key: float(data[key]) for key in ('last', 'open', 'high', 'low')}
    if any(not math.isfinite(n) or n <= 0 for n in values.values()):
        raise ValueError('Kursquelle liefert ungültige Werte.')
    def euro(number):
        return f'{number:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.') + ' €'
    change = (values['last'] / values['open'] - 1) * 100
    stamp = datetime.now(BERLIN).strftime('%d.%m.%Y %H:%M')
    return (f"Bitcoin {euro(values['last'])} · 24h {change:+.2f}%\n"
            f"24h Tief/Hoch: {euro(values['low'])} / {euro(values['high'])}\n"
            f'Quelle: Coinbase Exchange · Abgerufen {stamp} (Berlin)')


def due_slot(now):
    # Catch up only within two hours, with a fresh quote rather than a stale report.
    for hour in (18, 9):
        target = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if 0 <= (now - target).total_seconds() < 7200:
            return target.isoformat()
    return None


def tick(now=None):
    now = now or datetime.now(BERLIN)
    slot = due_slot(now)
    if not slot:
        return
    with LOCK, database() as conn:
        report = conn.execute('SELECT * FROM reports WHERE slot=?', (slot,)).fetchone()
    if report is None:
        body = market_report()
        with LOCK, database() as conn:
            conn.execute('INSERT OR IGNORE INTO reports VALUES(?,?,?)', (slot, now.isoformat(), body))
    with LOCK, database() as conn:
        report = conn.execute('SELECT * FROM reports WHERE slot=?', (slot,)).fetchone()
        devices = conn.execute('SELECT * FROM devices WHERE since<=?', (slot,)).fetchall()
    for device in devices:
        with LOCK, database() as conn:
            delivery = conn.execute('SELECT state FROM deliveries WHERE slot=? AND endpoint=?', (slot, device['endpoint'])).fetchone()
            if delivery and delivery['state'] in ('accepted', 'pending', 'expired'):
                continue
            # Persist before sending. An interrupted send remains uncertain and is not duplicated.
            conn.execute('INSERT OR REPLACE INTO deliveries VALUES(?,?,?)', (slot, device['endpoint'], 'pending'))
        try:
            status = push(json.loads(device['subscription']), 'Jarvis · Bitcoin ' + datetime.fromisoformat(slot).strftime('%H:%M'), report['body'], slot)
        except (OSError, ValueError, subprocess.TimeoutExpired):
            status = 'uncertain'
        with LOCK, database() as conn:
            conn.execute('UPDATE deliveries SET state=? WHERE slot=? AND endpoint=?', ('pending' if status == 'uncertain' else status, slot, device['endpoint']))
            if status == 'expired':
                conn.execute('DELETE FROM devices WHERE endpoint=?', (device['endpoint'],))
    with LOCK, database() as conn:
        conn.execute('DELETE FROM deliveries WHERE slot NOT IN (SELECT slot FROM reports ORDER BY slot DESC LIMIT 60)')
        conn.execute('DELETE FROM reports WHERE slot NOT IN (SELECT slot FROM reports ORDER BY slot DESC LIMIT 60)')


def handle(path, data):
    with LOCK, database() as conn:
        if path == '/api/bitcoin/status':
            reports = [dict(row) for row in conn.execute('SELECT * FROM reports ORDER BY slot DESC LIMIT 14')]
            key = DIRECTORY / 'public-key.txt'
            endpoint = data.get('endpoint', '')
            device = conn.execute('SELECT endpoint FROM devices WHERE endpoint=?', (endpoint,)).fetchone()
            delivery = conn.execute('SELECT state FROM deliveries WHERE endpoint=? ORDER BY slot DESC LIMIT 1', (endpoint,)).fetchone()
            return {'reports': reports, 'public_key': key.read_text().strip() if key.exists() else '',
                    'enabled': bool(device), 'delivery': delivery['state'] if delivery else None}
        if path == '/api/bitcoin/subscribe':
            subscription = validate_subscription(data.get('subscription'))
            conn.execute('INSERT INTO devices VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET subscription=excluded.subscription',
                         (subscription['endpoint'], json.dumps(subscription), datetime.now(BERLIN).isoformat()))
            return {'message': 'Bitcoin-Push um 09:00 und 18:00 Uhr aktiviert.'}
        if path == '/api/bitcoin/unsubscribe':
            conn.execute('DELETE FROM devices WHERE endpoint=?', (data.get('endpoint', ''),))
            return {'message': 'Bitcoin-Push für dieses Gerät ausgeschaltet.'}
        if path == '/api/bitcoin/test':
            device = conn.execute('SELECT subscription FROM devices WHERE endpoint=?', (data.get('endpoint', ''),)).fetchone()
            if not device:
                raise ValueError('Bitte zuerst Push aktivieren.')
        else:
            raise ValueError('Unbekannte Bitcoin-Aktion.')
    status = push(json.loads(device['subscription']), 'Jarvis · Push-Test', 'Die Bitcoin-Berichte kommen täglich um 09:00 und 18:00 Uhr (Berlin).', 'bitcoin-test')
    if status != 'accepted':
        raise ValueError('Push-Test konnte nicht übergeben werden. Bitte Push erneut aktivieren.')
    return {'message': 'Test an Push-Dienst übergeben. Bitte auf dem iPhone prüfen.'}


def start(host):
    global HOST
    HOST = host
    def run():
        while True:
            try:
                tick()
            except Exception as error:
                print('Bitcoin-Bericht fehlgeschlagen:', type(error).__name__, flush=True)
            time.sleep(60)
    threading.Thread(target=run, daemon=True, name='bitcoin-reports').start()
