#!/usr/bin/env python3
"""Install/uninstall Jarvis as a macOS login agent, without administrator access."""
import argparse
import json
import os
import plistlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LABEL = 'de.samet.jarvis'


def make_plist(root, python, logs):
    return {
        'Label': LABEL,
        'ProgramArguments': [str(python), str(root / 'auto_update.py')],
        'WorkingDirectory': str(root),
        'RunAtLoad': True,
        'KeepAlive': {'SuccessfulExit': False},
        'ThrottleInterval': 30,
        'ProcessType': 'Background',
        'EnvironmentVariables': {
            'PATH': '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
            'PYTHONDONTWRITEBYTECODE': '1',
        },
        'StandardOutPath': str(logs / 'jarvis.log'),
        'StandardErrorPath': str(logs / 'jarvis.log'),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--uninstall', action='store_true')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        raise SystemExit('Dieser Installer ist für macOS vorgesehen.')
    target = Path.home() / 'Library/LaunchAgents' / (LABEL + '.plist')
    domain = 'gui/' + str(os.getuid())
    if args.uninstall:
        subprocess.run(['/bin/launchctl', 'bootout', domain + '/' + LABEL],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        target.unlink(missing_ok=True)
        print('Automatische Updates und Hintergrundstart sind deaktiviert.')
        return
    from auto_update import EXPECTED, git, port_busy
    if git('remote', 'get-url', 'origin') not in EXPECTED:
        raise SystemExit('Bitte zuerst das richtige GitHub-Repository als origin verbinden.')
    if git('branch', '--show-current') != 'main':
        raise SystemExit('Bitte zuerst zum Branch main wechseln.')
    # Do not replace or stop an already-running instance silently.
    if port_busy():
        raise SystemExit('Port 8765 ist belegt. Codex soll den bisherigen Jarvis-Prozess '
                         'identifizieren und beenden; danach diesen Installer erneut starten.')
    python = ROOT / '.venv/bin/python'
    if not python.exists():
        python = Path(sys.executable)
    subprocess.run([str(python), '-c', 'import sys; assert sys.version_info >= (3,9)'], check=True)
    # ROOT/.venv path is intentionally not resolved: resolving loses the venv context.
    local_config = ROOT / 'config.local.json'
    host = os.environ.get('JARVIS_TAILSCALE_HOST', '').strip()
    if host:
        config = json.loads(local_config.read_text()) if local_config.exists() else {}
        config.setdefault('tailscale_host', host)
        local_config.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    logs = Path.home() / 'Library/Logs/Jarvis'
    logs.mkdir(parents=True, exist_ok=True)
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['/bin/launchctl', 'bootout', domain + '/' + LABEL],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with target.open('wb') as stream:
        plistlib.dump(make_plist(ROOT, python, logs), stream)
    subprocess.run(['/bin/launchctl', 'bootstrap', domain, str(target)], check=True)
    print('Dienst installiert. Er startet Jarvis und prüft jede Minute GitHub/main.')
    print('Status: ~/Library/Application Support/Jarvis/update-status.json')
    print('Log: ~/Library/Logs/Jarvis/jarvis.log')
    print('Bitte Jarvis-Start und privaten iPhone-Zugriff einmal prüfen.')


if __name__ == '__main__':
    main()
