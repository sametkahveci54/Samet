"""Execute explicit, deterministically parsed calendar orders; never ask the LLM to write."""
import hashlib
import json
import os
import re
import threading
from pathlib import Path
from datetime import datetime

import integrations as accounts
import personal

FILE = Path.home() / 'Library/Application Support/Jarvis/calendar-actions.json'
LOCK = threading.RLock()


def read_receipts():
    if not FILE.exists(): return {}
    if FILE.stat().st_size > 600000: raise ValueError('Kalenderprotokoll ist zu groß. Es wurde kein neuer Termin gespeichert.')
    try: value = json.loads(FILE.read_text(encoding='utf-8'))
    except (OSError, ValueError): raise ValueError('Kalenderprotokoll konnte nicht gelesen werden. Es wurde nichts neu eingetragen.') from None
    if not isinstance(value, dict): raise ValueError('Kalenderprotokoll konnte nicht gelesen werden.')
    return value


def store_receipts(value):
    FILE.parent.mkdir(parents=True, exist_ok=True)
    temp = FILE.with_suffix('.tmp')
    fd = os.open(str(temp), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream: json.dump(value, stream, ensure_ascii=False)
    os.chmod(temp, 0o600);temp.replace(FILE)


def choice(fields, hint, message):
    return {'kind': 'event', 'fields': fields, 'calendar_hint': hint,
            'source': 'Aus deinem Kalenderauftrag.', 'message': message}


def execute(text, fields, hint, request_id, implicit_duration=True):
    if not isinstance(request_id, str) or not re.fullmatch('[a-f0-9]{32}', request_id):
        raise ValueError('Kalenderauftrag konnte nicht eindeutig zugeordnet werden. Bitte die Seite neu laden.')
    request_hash = hashlib.sha256(text.strip().encode()).hexdigest()
    with accounts.ICLOUD_LOCK, LOCK:
        receipts = read_receipts()
        existing = receipts.get(request_id)
        if existing:
            if existing['request_hash'] != request_hash: raise ValueError('Kalenderauftrag wurde verändert. Bitte neu eingeben.')
            return existing['result']
        credentials = accounts.Keychain().get('icloud')
        if not credentials:
            return {'kind': 'calendar_setup', 'message': 'Dein iCloud-Kalender ist in Jarvis noch nicht verbunden. Bitte unter Einstellungen → Konten iCloud mit deinem App-Passwort verbinden. Es wurde nichts eingetragen.'}
        cloud = accounts.ICloud(credentials)
        try: calendars = cloud.calendars()
        except accounts.ConnectionError as error:
            return {'kind': 'calendar_unavailable', 'message': str(error) + ' Es wurde kein neuer Termin eingetragen.'}
        writable = [c for c in calendars if c['writable']]
        # Samet's standing instruction: all assistant orders go to Arbeit,
        # without a second confirmation, even when another default is saved.
        matches = [c for c in writable if c['name'].strip().casefold() == 'arbeit']
        selected = matches[0] if len(matches) == 1 else None
        if selected is None:
            return {'kind':'calendar_unavailable','message':'Der beschreibbare iCloud-Kalender „Arbeit“ fehlt oder ist nicht eindeutig. Es wurde nichts eingetragen. Bitte den Kalender in iCloud prüfen.'}
        event = accounts.event_preview({**fields, 'calendar_id': selected['id']}, calendars)
        fingerprint = hashlib.sha256(json.dumps([credentials['email'],event['calendar_id'],event['title'],event['start'],event['end']],ensure_ascii=False).encode()).hexdigest()
        # A network interruption must not lead to a second, possibly duplicate PUT.
        previous = next((r for r in receipts.values() if r.get('fingerprint') == fingerprint), None)
        if previous: return previous['result']
        event.update(accounts.conflict_check(cloud, event, calendars))
        if len(receipts) >= 100:
            completed = [key for key, value in receipts.items() if value['result']['kind'] == 'calendar_saved']
            if not completed: raise ValueError('Bitte zuerst offene Kalenderaufträge prüfen. Es wurde nichts neu eingetragen.')
            del receipts[completed[0]]
        event['uid'] = request_id + '@jarvis.local'
        start = datetime.fromisoformat(event['start']);end = datetime.fromisoformat(event['end'])
        summary = event['title'] + ' · ' + start.strftime('%d.%m.%Y, %H:%M') + '–' + end.strftime('%H:%M') + ' Uhr · Kalender ' + selected['name']
        uncertain = {'kind': 'calendar_uncertain', 'event': event,
            'message': 'Speicherstatus unklar für '+summary+'. Bitte zuerst in deinem iCloud-Kalender nachsehen. Dieser Auftrag wird nicht automatisch noch einmal gespeichert.'}
        receipts[request_id] = {'request_hash':request_hash,'fingerprint':fingerprint,'result':uncertain}
        try: store_receipts(receipts)
        except OSError: raise ValueError('Kalenderauftrag konnte lokal nicht abgesichert werden. Es wurde nichts eingetragen.') from None
        try: cloud.create(event)
        except accounts.ConnectionError:
            # Keep the durable uncertain receipt: the server might have accepted it.
            return uncertain
        result = {'kind':'calendar_saved','event':event,
            'message':'In iCloud eingetragen: '+summary+'. '+('Ohne genannte Dauer sind 60 Minuten vorgesehen. ' if implicit_duration else '')+'Auf deinem iPhone erscheint der Termin, wenn dieser iCloud-Kalender dort synchronisiert wird.'}
        if event['conflicts']:
            result['message'] += ' Hinweis: Der Termin überschneidet sich mit einem bestehenden Termin.'
        if event['conflict_warnings']:
            result['message'] += ' Hinweis: Die Prüfung auf Überschneidungen war unvollständig.'
        receipts[request_id]['result'] = result
        try: store_receipts(receipts)
        except OSError:
            result = {**result, 'message':result['message']+' Der lokale Nachweis konnte nicht aktualisiert werden; bitte keinen zweiten Auftrag senden.'}
        accounts.CONNECTION_TESTS['icloud'] = {'ok':True,'message':'Termin erfolgreich in iCloud gespeichert.','checked_at':accounts.time.time()}
        return result
