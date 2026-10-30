"""Explicitly selected, metered Marin speech; credentials stay in macOS Keychain."""
import json
import re
import urllib.request
import urllib.error

from integrations import Keychain
import jobs

PROFESSIONAL = (
    'Speak in German with a professional, calm, confident and courteous delivery. '
    'Use clear articulation, measured natural pacing and restrained warmth. '
    'Sound like a competent personal assistant, without theatrical emphasis. '
    'Read only the supplied text; do not add introductions or change its meaning.'
)


def configure(data):
    vault = Keychain()
    action = data.get('action', 'status')
    if action == 'save':
        key = data.get('key', '')
        if data.get('consent') is not True:
            raise ValueError('Bitte kostenpflichtige Online-Sprachausgabe ausdrücklich freigeben.')
        if not isinstance(key, str) or not re.fullmatch(r'sk-[A-Za-z0-9_-]{16,509}', key.strip()):
            raise ValueError('Bitte einen gültigen OpenAI-API-Schlüssel eingeben.')
        vault.set('openai', {'key': key.strip()})
        return {'configured': True, 'message': 'Schlüssel gespeichert. Erst beim Vorlesen mit Marin wird die API verwendet.'}
    if action == 'delete':
        vault.delete('openai')
        return {'configured': False, 'message': 'OpenAI-Schlüssel aus Jarvis entfernt.'}
    if action != 'status':
        raise ValueError('Unbekannte Stimmeinstellung.')
    _, item = vault.find('openai', read=False)
    configured = item is not None
    if item: vault.cf.CFRelease(item)
    return {'configured': configured}


def open_audio(text, rate):
    value = Keychain().get('openai')
    if not value or not value.get('key'):
        raise ValueError('Bitte zuerst den OpenAI-Schlüssel unter „Marin einrichten“ hinterlegen.')
    payload = {'model': 'gpt-4o-mini-tts', 'voice': 'marin', 'input': text,
               'instructions': PROFESSIONAL, 'response_format': 'pcm', 'speed': rate}
    request = urllib.request.Request('https://api.openai.com/v1/audio/speech',
        data=json.dumps(payload).encode(), headers={
            'Authorization': 'Bearer ' + value['key'], 'Content-Type': 'application/json'})
    try:
        return urllib.request.urlopen(request, timeout=60)
    except urllib.error.HTTPError as error:
        code = error.code
        error.close()
        if code in (401, 403):
            raise ValueError('OpenAI hat den Schlüssel oder die Berechtigung abgelehnt. Bitte im API-Konto prüfen.') from None
        if code == 429:
            raise ValueError('OpenAI-Nutzungslimit erreicht oder API-Guthaben fehlt. Bitte Abrechnung und Limits prüfen.') from None
        raise ValueError('OpenAI konnte die Sprache nicht erzeugen. Bitte später erneut versuchen.') from None
    except (urllib.error.URLError, TimeoutError):
        raise ValueError('OpenAI-Sprachdienst nicht erreichbar oder Zeitlimit überschritten.') from None


def stream_audio(handler, response):
    # HTTP/1.0 close-delimited binary stream; no buffering of the entire audio.
    handler.send_response(200)
    handler.send_header('Content-Type', 'application/octet-stream')
    handler.send_header('Cache-Control', 'no-store')
    handler.send_header('X-Content-Type-Options', 'nosniff')
    handler.send_header('X-Accel-Buffering', 'no')
    handler.send_header('Connection', 'close')
    handler.end_headers()
    handler.close_connection = True
    size = 0
    try:
        while True:
            jobs.check()
            chunk = response.read1(4096)
            if not chunk: break
            size += len(chunk)
            if size > 32 * 1024 * 1024: break
            handler.wfile.write(chunk)
            handler.wfile.flush()
    except (OSError, ValueError):
        # Headers have already been sent: never append a JSON error to PCM.
        return
