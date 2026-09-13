#!/usr/bin/env bash
# Next dev server that survives Cursor agent shell abort (own process group).
# Usage: scripts/sticky-dev-server.sh [port]
# State: /tmp/nodnotes-dev.{pid,log}

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-3031}"
PIDFILE="/tmp/nodnotes-dev.pid"
LOGFILE="/tmp/nodnotes-dev.log"
MATCH="next dev -p ${PORT}"

stop_dev() {
  if [[ -f "$PIDFILE" ]]; then
    OLD_PID="$(cat "$PIDFILE" 2>/dev/null || true)"
    if [[ -n "${OLD_PID}" ]]; then
      kill -TERM -- "-${OLD_PID}" 2>/dev/null || kill -TERM "$OLD_PID" 2>/dev/null || true
    fi
  fi
  pkill -TERM -f "$MATCH" 2>/dev/null || true

  for _ in $(seq 1 10); do
    pgrep -f "$MATCH" >/dev/null 2>&1 || break
    sleep 0.5
  done
  if pgrep -f "$MATCH" >/dev/null 2>&1; then
    pkill -KILL -f "$MATCH" 2>/dev/null || true
    sleep 0.3
  fi

  rm -f "$PIDFILE"
}

stop_dev

: >"$LOGFILE"

python3 - "$ROOT" "$PORT" "$PIDFILE" "$LOGFILE" <<'PY'
import subprocess
import sys
import time
from pathlib import Path

root, port, pidfile, logfile = sys.argv[1:5]
log = open(logfile, "a", buffering=1)
proc = subprocess.Popen(
    ["npm", "run", "dev", "--", "-p", port],
    cwd=root,
    stdout=log,
    stderr=subprocess.STDOUT,
    start_new_session=True,
)
Path(pidfile).write_text(str(proc.pid))

url = f"http://localhost:{port}"
for _ in range(60):
    time.sleep(0.5)
    text = Path(logfile).read_text(errors="replace")
    if "Ready in" in text or "started server" in text.lower():
        print(url)
        break
else:
    print(f"Dev server starting (check {logfile}): {url}", file=sys.stderr)
    print(url)
PY
