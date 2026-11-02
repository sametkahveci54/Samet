"""Install this update only onto the supplied, verified local source snapshot."""
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

root = Path(sys.argv[1]).resolve()
source = Path(__file__).resolve().parent
expected = json.loads((source/'expected.json').read_text())
files = [p for p in (source/'payload').rglob('*') if p.is_file()]
changes = []
for file in files:
    relative = file.relative_to(source/'payload')
    target = root/relative
    if target.exists() and target.read_bytes() == file.read_bytes():
        continue
    if str(relative) in expected:
        if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != expected[str(relative)]:
            raise SystemExit('Abbruch: '+str(relative)+' wurde seit der ZIP geändert. Bitte aktuellen Stand prüfen. Es wurde nichts überschrieben.')
    elif target.exists():
        raise SystemExit('Abbruch: Zusätzliche Datei existiert bereits: '+str(relative))
    changes.append((file,target,relative))
if not changes:
    print('Dieses Update ist bereits installiert.')
    sys.exit(0)
backup = Path.home()/'Jarvis-Backups'/('Komfort-'+datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
backup.mkdir(parents=True)
for _,target,relative in changes:
    if target.exists():
        saved=backup/relative;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
written=[]
try:
    for file,target,relative in changes:
        target.parent.mkdir(parents=True,exist_ok=True)
        temporary=target.with_name(target.name+'.comfort-tmp')
        shutil.copyfile(file,temporary)
        os.replace(temporary,target)
        written.append((target,relative))
except Exception:
    for target,relative in reversed(written):
        saved=backup/relative
        if saved.exists():shutil.copy2(saved,target)
        else:target.unlink(missing_ok=True)
    raise
print('Yahoo-Lesestatus, Terminfenster und warme Farben installiert.')
print('Sicherung: '+str(backup))
print('Jarvis-Dienst neu starten und Browserseite neu laden.')
