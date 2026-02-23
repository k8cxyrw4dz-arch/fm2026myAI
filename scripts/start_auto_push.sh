#!/usr/bin/env bash

set -eu
# Disable history expansion to avoid `event not found` when run from interactive shells.
set +H 2>/dev/null || true

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="$REPO_ROOT/.autopush"
PID_FILE="$STATE_DIR/autopush.pid"
LOG_FILE="$STATE_DIR/autopush.log"
INTERVAL_SECONDS="${1:-5}"

cd "$REPO_ROOT"
mkdir -p "$STATE_DIR"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Auto push already running (PID: $(cat "$PID_FILE"))."
  exit 0
fi

nohup "$REPO_ROOT/scripts/auto_git_sync.sh" "$INTERVAL_SECONDS" >/dev/null 2>&1 &
sleep 1

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Auto push started."
  echo "PID: $(cat "$PID_FILE")"
  echo "Log: $LOG_FILE"
else
  echo "Failed to start auto push. Check: $LOG_FILE"
  exit 1
fi
