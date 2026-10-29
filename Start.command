#!/bin/zsh
cd "${0:A:h}"
if /usr/bin/curl -fsS http://127.0.0.1:8765/api/session >/dev/null 2>&1; then
  /usr/bin/open http://127.0.0.1:8765
else
  /usr/bin/nohup "$PWD/.venv/bin/python" "$PWD/server.py" >> "$PWD/jarvis.log" 2>&1 &
  /bin/sleep 1
  /usr/bin/open http://127.0.0.1:8765
fi
