"""Add Bitcoin reports to the current local Jarvis while preserving local changes."""
import ast
from datetime import datetime
import os
from pathlib import Path
import shutil
import subprocess
import sys

root = Path(sys.argv[1]).resolve()
source = Path(__file__).resolve().parent
server_path = root / 'server.py'
index_path = root / 'web/index.html'
server = server_path.read_text()
index = index_path.read_text()
marker = '# Jarvis Bitcoin reports v1'
if marker not in server:
    replacements = [
        ("        files = {'/':", """        # Jarvis Bitcoin reports v1
        if path == '/bitcoin':
            return self.reply(200, (ROOT / 'web/bitcoin.html').read_bytes(), 'text/html; charset=utf-8')
        bitcoin_assets = {
            '/bitcoin.js': 'text/javascript; charset=utf-8',
            '/bitcoin-link.js': 'text/javascript; charset=utf-8',
            '/bitcoin-sw.js': 'text/javascript; charset=utf-8',
            '/bitcoin.css': 'text/css; charset=utf-8',
            '/bitcoin.webmanifest': 'application/manifest+json',
            '/bitcoin-icon.svg': 'image/svg+xml',
        }
        if path in bitcoin_assets:
            return self.reply(200, (ROOT / 'web' / path[1:]).read_bytes(), bitcoin_assets[path])
        files = {'/':"""),
        ("            if self.path == '/api/jobs/cancel':", """            if self.path.startswith('/api/bitcoin/'):
                from bitcoin_reports import handle
                return self.reply(200, handle(self.path, data))
            if self.path == '/api/jobs/cancel':"""),
        ("    server.serve_forever()", """    from bitcoin_reports import start
    start(HOST)
    server.serve_forever()"""),
    ]
    for before, after in replacements:
        if server.count(before) != 1:
            raise SystemExit('Abbruch: server.py wurde verändert. Bitte aktuellen Stand prüfen.')
        server = server.replace(before, after, 1)
if '/bitcoin-link.js' not in index:
    if index.count('</head>') != 1:
        raise SystemExit('Abbruch: index.html konnte nicht sicher ergänzt werden.')
    index = index.replace('</head>', '<link rel="manifest" href="/bitcoin.webmanifest"><script defer src="/bitcoin-link.js"></script></head>')
ast.parse(server)
changes = {server_path:server.encode(), index_path:index.encode()}
for relative in ['bitcoin_reports.py', 'bitcoin_push.py']:
    changes[root / relative] = (source / relative).read_bytes()
for file in (source / 'web').iterdir():
    changes[root / 'web' / file.name] = file.read_bytes()
for target, content in changes.items():
    if target not in (server_path, index_path) and target.exists() and target.read_bytes() != content:
        raise SystemExit('Abbruch: Bereits vorhandene Datei weicht ab: ' + str(target))
directory = Path.home() / 'Library/Application Support/Jarvis/Bitcoin'
directory.mkdir(parents=True, exist_ok=True, mode=0o700)
runtime = directory / 'venv/bin/python'
if not runtime.exists():
    subprocess.run([sys.executable, '-m', 'venv', str(directory / 'venv')], check=True)
subprocess.run([str(runtime), '-m', 'pip', 'install', 'pywebpush==2.0.3'], check=True)
subprocess.run([str(runtime), str(source / 'bitcoin_push.py'), '--init'], check=True)
backup = Path.home() / 'Jarvis-Backups' / ('Bitcoin-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
backup.mkdir(parents=True)
written = []
try:
    for target, content in changes.items():
        relative = target.relative_to(root)
        if target.exists():
            saved = backup / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, saved)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.bitcoin-tmp')
        temporary.write_bytes(content)
        os.replace(temporary, target)
        written.append(target)
except Exception:
    for target in reversed(written):
        saved = backup / target.relative_to(root)
        if saved.exists():
            shutil.copy2(saved, target)
        else:
            target.unlink(missing_ok=True)
    raise
print('Bitcoin-Berichte installiert. Sicherung: ' + str(backup))
print('Jarvis neu starten. Auf dem iPhone anschließend /bitcoin öffnen und Push aktivieren.')
