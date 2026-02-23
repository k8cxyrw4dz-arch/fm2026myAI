#!/usr/bin/env bash

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="$REPO_ROOT/.autopush"
PID_FILE="$STATE_DIR/autopush.pid"

cd "$REPO_ROOT"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Auto push is not running."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  sleep 1
fi

rm -f "$PID_FILE"
echo "Auto push stopped."
