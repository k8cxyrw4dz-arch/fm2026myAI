#!/usr/bin/env bash

set -u
# Disable history expansion to avoid `event not found` when run from interactive shells.
set +H 2>/dev/null || true

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INTERVAL_SECONDS="${1:-5}"
COMMIT_PREFIX="${AUTO_COMMIT_PREFIX:-auto: update}"
BRANCH="${AUTO_PUSH_BRANCH:-main}"
STATE_DIR="$REPO_ROOT/.autopush"
PID_FILE="$STATE_DIR/autopush.pid"
LOG_FILE="$STATE_DIR/autopush.log"

cd "$REPO_ROOT" || exit 1
mkdir -p "$STATE_DIR"

if [[ -f "$PID_FILE" ]]; then
  if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Auto sync is already running (PID: $(cat "$PID_FILE"))."
    exit 0
  fi
fi

echo "$$" > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Auto sync started (interval: ${INTERVAL_SECONDS}s)" >> "$LOG_FILE"

while true; do
  if ! git add -A >> "$LOG_FILE" 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] git add failed" >> "$LOG_FILE"
    sleep "$INTERVAL_SECONDS"
    continue
  fi

  if ! git diff --cached --quiet; then
    COMMIT_MSG="$COMMIT_PREFIX ($(date '+%Y-%m-%d %H:%M:%S'))"
    if git commit -m "$COMMIT_MSG" >> "$LOG_FILE" 2>&1; then
      git push origin "$BRANCH" >> "$LOG_FILE" 2>&1
    else
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] git commit failed" >> "$LOG_FILE"
    fi
  fi

  sleep "$INTERVAL_SECONDS"
done
