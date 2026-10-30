#!/usr/bin/env python3
"""Jarvis: lokaler Server, ausschließlich fest definierte Aktionen."""
import os, io, wave, json, secrets, subprocess, threading, urllib.request, urllib.error
from datetime import datetime
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import jobs
import personal
import diagnostics

ROOT = Path(__file__).resolve().parent
LOCAL_CONFIG = json.loads((ROOT / 'config.local.json').read_text()) if (ROOT / 'config.local.json').is_file() else {}
HOST = os.environ.get('JARVIS_TAILSCALE_HOST', LOCAL_CONFIG.get('tailscale_host', '')).strip().rstrip('.')
TOKEN = secrets.token_urlsafe(32)
CHAT_LOCK = threading.Lock()
VOICE_LOCK = threading.Lock()
VOICE = None
CLONE = None
ACTIONS = {'safari': [' /usr/bin/open'.strip(), '-a', 'Safari'], 'rechner': ['/usr/bin/open', '-a', 'Calculator']}

def draft_text(system, text):
    if not CHAT_LOCK.acquire(blocking=False):
        raise ValueError('Jarvis beantwortet gerade eine Nachricht. Bitte kurz warten.')
    try:
        result = ollama('chat', {'model': 'qwen3:1.7b', 'messages': [
            {'role': 'system', 'content': system}, {'role': 'user', 'content': text}],
            'stream': False, 'think': False, 'keep_alive': '15m',
            'options': {'num_ctx': 4096, 'num_predict': 500, 'temperature': 0.2}}, 180)
        return result['message']['content']
    finally:
        CHAT_LOCK.release()

def ollama(path, data=None, timeout=10):
    streaming = path == 'chat' and data is not None and jobs.current() is not None
    if streaming: data = {**data, 'stream': True}
    jobs.check()
    req = urllib.request.Request('http://127.0.0.1:11434/api/' + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        if streaming:
            parts = []
            size = 0
            for line in r:
                jobs.check()
                if not line.strip(): continue
                chunk = json.loads(line)
                if 'error' in chunk: raise ValueError('Das lokale Modell konnte die Anfrage nicht beenden.')
                text = chunk.get('message', {}).get('content', '')
                size += len(text)
                if size > 20000: raise ValueError('Modellantwort ist zu lang.')
                parts.append(text)
                if chunk.get('done'): break
            jobs.check()
            return {'message': {'content': ''.join(parts)}}
        return json.load(r)

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, data, mime='application/json; charset=utf-8'):
        body = json.dumps(data, ensure_ascii=False).encode() if not isinstance(data, bytes) else data
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(body)

    def valid_host(self):
        return self.headers.get('Host', '') in ('127.0.0.1:8765', 'localhost:8765', HOST, HOST + ':443')

    def do_GET(self):
        if not self.valid_host(): return self.reply(403, {'error': 'Ungültiger Host.'})
        path = self.path.split('?')[0]
        if path == '/api/session': return self.reply(200, {'token': TOKEN})
        if path == '/api/maintenance': return self.reply(200, {'busy': jobs.is_busy()})
        if path == '/api/status':
            try:
                names = [m['name'] for m in ollama('tags')['models']]
                return self.reply(200, {'online': 'qwen3:1.7b' in names, 'model': 'qwen3:1.7b', **diagnostics.status()})
            except Exception:
                return self.reply(200, {'online': False, 'model': 'qwen3:1.7b', **diagnostics.status()})
        files = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'), '/style.css': ('style.css', 'text/css; charset=utf-8')}
        if path == '/organizer.js': files[path] = ('organizer.js', 'text/javascript; charset=utf-8')
        if path == '/daily.js': files[path] = ('daily.js', 'text/javascript; charset=utf-8')
        if path == '/daily.css': files[path] = ('daily.css', 'text/css; charset=utf-8')
        if path == '/online-voice.js': files[path] = ('online-voice.js', 'text/javascript; charset=utf-8')
        if path == '/dashboard.js': files[path] = ('dashboard.js', 'text/javascript; charset=utf-8')
        for asset, mime in [('appearance.js', 'text/javascript; charset=utf-8'), ('studio.js', 'text/javascript; charset=utf-8'), ('studio.css', 'text/css; charset=utf-8'), ('presence.js', 'text/javascript; charset=utf-8'), ('presence.css', 'text/css; charset=utf-8')]:
            if path == '/' + asset: files[path] = (asset, mime)
        if path not in files: return self.reply(404, {'error': 'Nicht gefunden.'})
        name, mime = files[path]
        self.reply(200, (ROOT / 'web' / name).read_bytes(), mime)

    def do_POST(self):
        global VOICE, CLONE
        if not self.valid_host() or self.headers.get('X-Jarvis-Token') != TOKEN:
            return self.reply(403, {'error': 'Bitte Seite neu laden.'})
        origin = self.headers.get('Origin')
        if origin and origin not in ('http://localhost:8765', 'http://127.0.0.1:8765', 'https://' + HOST):
            return self.reply(403, {'error': 'Ungültiger Ursprung.'})
        job = None
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 65536: return self.reply(400, {'error': 'Anfrage zu groß oder leer.'})
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict): raise ValueError('Ungültige Anfrage.')
            if self.path == '/api/jobs/cancel': return self.reply(200, jobs.cancel(data.get('id')))
            job = jobs.begin(data.get('_job'))
            if self.path == '/api/voice/config':
                from online_voice import configure
                return self.reply(200, configure(data))
            if self.path.startswith('/api/personal/'):
                return self.reply(200, personal.handle(self.path, data))
            if self.path.startswith('/api/assistant/'):
                from assistant_actions import handle
                return self.reply(200, handle(self.path, data, draft_text))
            if self.path.startswith(('/api/connections/', '/api/mail/', '/api/calendar/')):
                from integrations import handle
                return self.reply(200, handle(self.path, data, draft_text))
            if self.path == '/api/action':
                action = data.get('action')
                if action in ACTIONS:
                    subprocess.run(ACTIONS[action], check=True, timeout=15)
                    return self.reply(200, {'message': ('Safari' if action == 'safari' else 'Rechner') + ' auf dem Mac geöffnet.'})
                if action == 'notiz':
                    content = data.get('text', '')
                    if not isinstance(content, str) or not content.strip() or len(content) > 20000: raise ValueError('Bitte eine Notiz mit höchstens 20.000 Zeichen eingeben.')
                    folder = ROOT / 'Notizen'
                    folder.mkdir(exist_ok=True)
                    name = datetime.now().strftime('%Y-%m-%d_%H-%M-%S_') + secrets.token_hex(3) + '.txt'
                    (folder / name).write_text(content.strip() + '\n', encoding='utf-8')
                    return self.reply(200, {'message': 'Notiz gespeichert: ' + name})
                raise ValueError('Diese Aktion ist nicht erlaubt.')
            if self.path == '/api/speech':
                text = data.get('text', '')
                if not isinstance(text, str) or not text.strip() or len(text) > 8000:
                    raise ValueError('Sprachtext fehlt oder ist zu lang.')
                rate = float(data.get('rate', 1))
                if not 0.8 <= rate <= 1.15: raise ValueError('Ungültiges Sprechtempo.')
                if not VOICE_LOCK.acquire(blocking=False):
                    return self.reply(429, {'error': 'Stimme wird gerade erzeugt. Bitte kurz warten.'})
                try:
                    if data.get('voice') == 'marin':
                        from online_voice import open_audio, stream_audio
                        with open_audio(text, rate) as response:
                            stream_audio(self, response)
                        return
                    if data.get('voice', 'neural') == 'clone':
                        if len(text) > 2400: raise ValueError('Für die eigene Stimme bitte maximal 2.400 Zeichen auf einmal vorlesen.')
                        from clone_client import CloneClient
                        if CLONE is None: CLONE = CloneClient()
                        audio = CLONE.wav(text, rate)
                        with wave.open(io.BytesIO(audio)) as wav:
                            if wav.getnframes() < 2400: raise ValueError('Die Sprachdatei ist leer.')
                        return self.reply(200, audio, 'audio/wav')
                    from speech import Victoria
                    if VOICE is None:
                        VOICE = Victoria(ROOT)
                    return self.reply(200, VOICE.wav(text, rate), 'audio/wav')
                finally: VOICE_LOCK.release()
            if self.path == '/api/chat':
                messages = data.get('messages')
                if not isinstance(messages, list) or not messages: raise ValueError('Nachricht fehlt.')
                clean = []
                for m in messages[-16:]:
                    if not isinstance(m, dict) or m.get('role') not in ('user', 'assistant') or not isinstance(m.get('content'), str) or len(m['content']) > 8000: raise ValueError('Ungültige Nachricht oder zu langer Text (max. 8.000 Zeichen).')
                    clean.append({'role': m['role'], 'content': m['content']})
                if not CHAT_LOCK.acquire(blocking=False): return self.reply(429, {'error': 'Jarvis beantwortet gerade eine Nachricht. Bitte kurz warten.'})
                try:
                    result = ollama('chat', {'model': 'qwen3:1.7b', 'messages': [{'role': 'system', 'content': 'Du bist Jarvis. Antworte auf Deutsch. Beantworte die letzte Frage konkret und direkt; liefere die erbetene Information oder den gewünschten Text. Nutze den Gesprächsverlauf für Anschlussfragen. Nur wenn eine wesentliche Angabe fehlt, stelle eine gezielte Rückfrage. Antworte niemals nur mit einer Bestätigung oder mit "Wie kann ich helfen?", wenn bereits eine Frage gestellt wurde. Halte die Antwort normalerweise auf zwei bis fünf Sätze begrenzt. Du hast keine Werkzeuge und kannst im Chat keine Apps öffnen oder Notizen speichern.' + '\n' + personal.context()}] + clean, 'stream': False, 'think': False, 'keep_alive': '15m', 'options': {'num_ctx': 4096, 'num_predict': 350, 'temperature': 0.35, 'repeat_penalty': 1.1}}, 180)
                    return self.reply(200, {'message': result['message']['content']})
                finally: CHAT_LOCK.release()
            self.reply(404, {'error': 'Nicht gefunden.'})
        except (BrokenPipeError, ConnectionResetError):
            return
        except ValueError as e: self.reply(400, {'error': str(e)})
        except (urllib.error.URLError, TimeoutError): self.reply(503, {'error': 'Ollama nicht erreichbar oder Zeitlimit überschritten. Bitte Ollama auf dem Mac prüfen.'})
        except Exception as e:
            print(type(e).__name__, str(e), flush=True)
            self.reply(500, {'error': 'Aktion fehlgeschlagen. Details stehen in jarvis.log.'})
        finally:
            jobs.finish(job)

if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 8765), Handler)
    print('Jarvis läuft auf http://127.0.0.1:8765', flush=True)
    server.serve_forever()


