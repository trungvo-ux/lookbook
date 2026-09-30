#!/usr/bin/env bash
# Start Lookbook HTTP MCP and open a Cloudflare quick tunnel for Cursor.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT="${PORT:-3847}"
export HOST=0.0.0.0
export PORT

[[ -f dist/http.js ]] || npm run build

echo "Starting Lookbook on http://0.0.0.0:${PORT}/mcp ..."
node dist/http.js &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null && break
  sleep 0.25
done

CLOUDFLARED="${CLOUDFLARED:-cloudflared}"
if ! command -v "$CLOUDFLARED" >/dev/null 2>&1; then
  if [[ -x /tmp/cloudflared ]]; then CLOUDFLARED=/tmp/cloudflared
  else
    echo "Install cloudflared, or set CLOUDFLARED=/path/to/binary"
    echo "Local: http://127.0.0.1:${PORT}/mcp"
    wait "$PID"
    exit 0
  fi
fi

echo "Opening Cloudflare quick tunnel (ephemeral)..."
exec "$CLOUDFLARED" tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate
