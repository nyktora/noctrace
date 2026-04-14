#!/bin/sh
# Noctrace Docker Watcher — injected into containers to stream JSONL to host.
# Usage: docker-watcher.sh <claude_dir> <noctrace_url> <container_name>
# Streams JSONL lines via curl POST to the noctrace /api/docker/stream endpoint.
# Sends heartbeats every 10 seconds to /api/docker/heartbeat.

CLAUDE_DIR="$1"
NOCTRACE_URL="$2"
CONTAINER_NAME="$3"
PROJECTS_DIR="$CLAUDE_DIR/projects"

if [ -z "$CLAUDE_DIR" ] || [ -z "$NOCTRACE_URL" ] || [ -z "$CONTAINER_NAME" ]; then
  echo "Usage: docker-watcher.sh <claude_dir> <noctrace_url> <container_name>" >&2
  exit 1
fi

# Track watched files to avoid duplicate tail processes
WATCHED="/tmp/.noctrace-watched-$$"
PIDS="/tmp/.noctrace-pids-$$"
touch "$WATCHED" "$PIDS"

cleanup() {
  # Kill all tail processes we started
  while IFS= read -r pid; do
    kill "$pid" 2>/dev/null
  done < "$PIDS"
  rm -f "$WATCHED" "$PIDS"
  exit 0
}

trap cleanup TERM INT

# Detect HTTP client
if command -v curl >/dev/null 2>&1; then
  HTTP_CMD="curl"
elif command -v wget >/dev/null 2>&1; then
  HTTP_CMD="wget"
else
  echo "[noctrace-watcher] Neither curl nor wget found in container" >&2
  exit 1
fi

post_stream() {
  file="$1"
  if [ "$HTTP_CMD" = "curl" ]; then
    curl -s -X POST "$NOCTRACE_URL/api/docker/stream" \
      -H "Content-Type: text/plain" \
      -H "X-Container-Name: $CONTAINER_NAME" \
      -H "X-Container-Path: $file" \
      --data-binary @- || true
  else
    wget -q -O /dev/null --post-file=- \
      --header="Content-Type: text/plain" \
      --header="X-Container-Name: $CONTAINER_NAME" \
      --header="X-Container-Path: $file" \
      "$NOCTRACE_URL/api/docker/stream" 2>/dev/null || true
  fi
}

post_heartbeat() {
  if [ "$HTTP_CMD" = "curl" ]; then
    curl -s -X POST "$NOCTRACE_URL/api/docker/heartbeat" \
      -H "X-Container-Name: $CONTAINER_NAME" || true
  else
    wget -q -O /dev/null --post-data="" \
      --header="X-Container-Name: $CONTAINER_NAME" \
      "$NOCTRACE_URL/api/docker/heartbeat" 2>/dev/null || true
  fi
}

watch_file() {
  file="$1"
  # Send full file content then follow new lines
  tail -f -n +1 "$file" 2>/dev/null | while IFS= read -r line; do
    printf '%s\n' "$line" | post_stream "$file"
  done &
  echo $! >> "$PIDS"
  echo "$file" >> "$WATCHED"
}

# Initial scan — watch all existing JSONL files
if [ -d "$PROJECTS_DIR" ]; then
  find "$PROJECTS_DIR" -name "*.jsonl" -type f 2>/dev/null | while IFS= read -r f; do
    watch_file "$f"
  done
fi

# Main loop: scan for new files + send heartbeat
HEARTBEAT_COUNTER=0
while true; do
  sleep 3

  # Scan for new JSONL files (including subagents)
  if [ -d "$PROJECTS_DIR" ]; then
    find "$PROJECTS_DIR" -name "*.jsonl" -type f 2>/dev/null | while IFS= read -r f; do
      if ! grep -qxF "$f" "$WATCHED" 2>/dev/null; then
        watch_file "$f"
      fi
    done
  fi

  # Heartbeat every ~10 seconds (3s sleep * 3 iterations)
  HEARTBEAT_COUNTER=$((HEARTBEAT_COUNTER + 1))
  if [ "$HEARTBEAT_COUNTER" -ge 3 ]; then
    post_heartbeat
    HEARTBEAT_COUNTER=0
  fi
done
