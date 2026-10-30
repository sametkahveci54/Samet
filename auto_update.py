#!/usr/bin/env python3
"""User-level Jarvis supervisor. No sudo, shell commands, or dependency installs."""
import ast
import fcntl
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATE = Path.home() / 'Library/Application Support/Jarvis'
EXPECTED = {'https://github.com/sametkahveci54/Samet.git',
            'https://github.com/sametkahveci54/Samet',
            'git@github.com:sametkahveci54/Samet.git'}
ENV = dict(os.environ, GIT_TERMINAL_PROMPT='0', PYTHONDONTWRITEBYTECODE='1')
STOP = False


def git(*args, root=ROOT):
    result = subprocess.run(['/usr/bin/git', '-C', str(root), *args],
                            env=ENV, capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError('Git-Schritt fehlgeschlagen: ' + args[0])
    return result.stdout.strip()


def status(message, **details):
    print(time.strftime('%Y-%m-%d %H:%M:%S'), message, flush=True)
    STATE.mkdir(parents=True, exist_ok=True)
    target = STATE / 'update-status.json'
    temp = target.with_suffix('.tmp')
    temp.write_text(json.dumps({'message': message, 'time': time.time(), **details},
                               ensure_ascii=False), encoding='utf-8')
    temp.replace(target)


def clean(root=ROOT):
    return not git('status', '--porcelain', '--untracked-files=normal', root=root)


def candidate(root=ROOT):
    """Fetch explicitly selected repository/branch. Never stash or force a merge."""
    if git('remote', 'get-url', 'origin', root=root) not in EXPECTED:
        raise RuntimeError('Origin ist nicht das freigegebene Jarvis-Repository.')
    if git('branch', '--show-current', root=root) != 'main':
        raise RuntimeError('Automatische Updates pausiert: Bitte main verwenden.')
    if not clean(root):
        raise RuntimeError('Automatische Updates pausiert: lokale Änderungen vorhanden.')
    old = git('rev-parse', 'HEAD', root=root)
    git('fetch', '--no-tags', 'origin', 'refs/heads/main', root=root)
    new = git('rev-parse', 'FETCH_HEAD', root=root)
    if old == new:
        return old, new
    git('merge-base', '--is-ancestor', old, new, root=root)
    paths = git('diff', '--name-only', old, new, root=root).splitlines()
    # Changes needing installation are deliberately left for local Codex.
    if any(Path(p).name.startswith('requirements') or
           Path(p).name in {'pyproject.toml', 'package.json', 'package-lock.json'}
           for p in paths):
        raise RuntimeError('Update braucht neue Abhängigkeiten; einmal lokal prüfen lassen.')
    entries = git('ls-tree', '-r', '--name-only', new, root=root).splitlines()
    if 'server.py' not in entries or 'auto_update.py' not in entries:
        raise RuntimeError('Update enthält nicht alle erforderlichen Startdateien.')
    for name in entries:
        if name.endswith('.py'):
            ast.parse(git('show', new + ':' + name, root=root), filename=name)
    # A second check catches edits made while the network request was running.
    if git('rev-parse', 'HEAD', root=root) != old or not clean(root):
        raise RuntimeError('Projekt wurde während der Update-Prüfung geändert.')
    return old, new


def healthy():
    try:
        with urllib.request.urlopen('http://127.0.0.1:8765/api/session', timeout=2) as r:
            return r.status == 200 and isinstance(json.load(r).get('token'), str)
    except Exception:
        return False


def runtime_busy():
    try:
        with urllib.request.urlopen('http://127.0.0.1:8765/api/maintenance', timeout=2) as response:
            return json.load(response).get('busy') is not False
    except Exception:
        return True


def port_busy(port=8765):
    import socket
    with socket.socket() as sock:
        # Match HTTPServer.allow_reuse_address: recently closed HTTP sockets
        # may remain in TIME_WAIT after our child exits or we exec ourselves.
        # A live listener still prevents binding; never terminate it here.
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(('127.0.0.1', port))
            return False
        except OSError:
            return True


def start_server():
    return subprocess.Popen([sys.executable, str(ROOT / 'server.py')],
                            cwd=ROOT, env=ENV, start_new_session=True)


def stop_server(proc):
    if proc is not None and proc.poll() is None:
        # Only terminate our own child, never a process discovered on a port.
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()


def wait_healthy(proc):
    for _ in range(40):
        if STOP or proc.poll() is not None:
            return False
        if healthy():
            return True
        time.sleep(0.5)
    return False


def restore(old, new, root=ROOT):
    """Rollback only our exact, clean update. Never reset someone else's edits."""
    if git('rev-parse', 'HEAD', root=root) != new or not clean(root):
        raise RuntimeError('Rückkehr blockiert: lokale Änderungen zuerst prüfen.')
    git('reset', '--keep', old, root=root)


def main():
    global STOP
    STATE.mkdir(parents=True, exist_ok=True)
    lock = (STATE / 'supervisor.lock').open('w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return
    def shutdown(*_):
        global STOP
        STOP = True
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    proc = None
    rejected = None
    try:
        if port_busy():
            status('Port 8765 ist belegt. Bisherigen Jarvis-Server einmal beenden.')
            return
        proc = start_server()
        if not wait_healthy(proc):
            raise RuntimeError('Jarvis konnte nicht gestartet werden. Log prüfen.')
        status('Jarvis läuft. Automatische Updates sind aktiv.')
        next_check = time.monotonic() + 60
        while not STOP:
            if proc.poll() is not None:
                status('Jarvis wurde beendet; Neustart wird versucht.')
                time.sleep(3)
                if STOP:
                    break
                if port_busy():
                    raise RuntimeError('Port ist durch einen anderen Prozess belegt.')
                proc = start_server()
                if not wait_healthy(proc):
                    raise RuntimeError('Jarvis-Neustart fehlgeschlagen.')
            if time.monotonic() >= next_check:
                next_check = time.monotonic() + 60
                try:
                    if runtime_busy():
                        status('Updates warten auf laufende Jarvis-Anfragen.')
                        continue
                    old, new = candidate()
                    if new == old:
                        status('Automatische Updates aktiv. Keine neue Version.', version=old)
                    elif new == rejected:
                        status('Automatische Updates aktiv. Fehlerhafte Version wird übersprungen.', version=old, rejected=new)
                    if new != old and new != rejected:
                        if runtime_busy():
                            status('Neue Version gefunden; warte auf laufende Jarvis-Anfragen.')
                            continue
                        git('merge', '--ff-only', new)
                        stop_server(proc)
                        proc = start_server()
                        if wait_healthy(proc):
                            status('Update übernommen.', version=new)
                            # Reload this supervisor too if its implementation changed.
                            changed = git('diff', '--name-only', old, new).splitlines()
                            if 'auto_update.py' in changed:
                                stop_server(proc)
                                proc = None
                                lock.close()
                                os.execv(sys.executable, [sys.executable, str(ROOT / 'auto_update.py')])
                        else:
                            stop_server(proc)
                            restore(old, new)
                            rejected = new
                            proc = start_server()
                            if not wait_healthy(proc):
                                raise RuntimeError('Auch die vorherige Version startet nicht.')
                            status('Fehlerhaftes Update zurückgenommen.', rejected=new)
                except Exception as error:
                    status(str(error))
            time.sleep(1)
    except Exception as error:
        status(str(error))
    finally:
        stop_server(proc)
        lock.close()


if __name__ == '__main__':
    main()

