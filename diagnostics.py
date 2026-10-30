"""Read-only runtime status. Does not expose paths, credentials or logs."""
import json
import subprocess
import time
from pathlib import Path
from release import VERSION

ROOT = Path(__file__).resolve().parent
UPDATE_STATE = Path.home() / 'Library/Application Support/Jarvis/update-status.json'


def revision():
    try:
        result = subprocess.run(['/usr/bin/git', '-C', str(ROOT), 'rev-parse', '--short=8', 'HEAD'],
                                capture_output=True, text=True, timeout=2)
        return result.stdout.strip() if result.returncode == 0 else ''
    except (OSError, subprocess.TimeoutExpired): return ''


RUNNING_REVISION = revision()


def status():
    from integrations import CONNECTION_TESTS
    updater = {'fresh': False, 'message': 'Noch kein Update-Status verfügbar.', 'checked_at': None}
    try:
        if UPDATE_STATE.stat().st_size < 20000:
            data = json.loads(UPDATE_STATE.read_text())
            stamp = float(data['time'])
            updater.update(fresh=0 <= time.time()-stamp < 180,
                           message=str(data.get('message', ''))[:500], checked_at=stamp)
    except (OSError, ValueError, KeyError, TypeError): pass
    return {'version': VERSION, 'revision': RUNNING_REVISION, 'updater': updater,
            'connections': dict(CONNECTION_TESTS)}
