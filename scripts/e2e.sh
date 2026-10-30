#!/usr/bin/env bash
# Runs the browser scripts against a pair of dev servers of their own, on
# spare ports so a `pnpm dev` already running is left alone, and sums up.
#
#   scripts/e2e.sh               every script
#   scripts/e2e.sh solo host     just these
#
# Short rounds, which every script copes with (reconnect picks its own).
# Each script's output and screenshots go to smoke-out/e2e/<name>/.
set -euo pipefail

cd "$(dirname "$0")/.."
export CLIENT_PORT="${CLIENT_PORT:-5180}" PORT="${PORT:-8790}"
out=smoke-out/e2e
mkdir -p "$out"

# prod needs the packaged server; support.ts and sounds.ts are helpers.
if [ $# -gt 0 ]; then
  scripts=("$@")
else
  scripts=()
  for f in packages/client/browser/e2e/*.ts; do
    name=$(basename "$f" .ts)
    case "$name" in prod | support | sounds) ;; *) scripts+=("$name") ;; esac
  done
fi

# Its own process group, so stopping it stops Vite and the game server too.
set -m
ROUND_MS=12000 ROUNDS=2 pnpm dev >"$out/servers.log" 2>&1 &
servers=$!
set +m
trap 'kill -- "-$servers" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  curl -sf "localhost:$PORT/api/health" >/dev/null && curl -sf "localhost:$CLIENT_PORT" >/dev/null && break
  sleep 1
done
curl -sf "localhost:$PORT/api/health" >/dev/null || {
  echo "the dev servers did not start; see $out/servers.log"
  exit 1
}

failed=()
for name in "${scripts[@]}"; do
  mkdir -p "$out/$name"
  start=$SECONDS
  if (cd packages/client && node "browser/e2e/$name.ts" "../../$out/$name") >"$out/$name/output.txt" 2>&1; then
    printf 'ok    %-16s %3ss\n' "$name" $((SECONDS - start))
  else
    printf 'FAIL  %-16s %3ss  %s\n' "$name" $((SECONDS - start)) "$out/$name/output.txt"
    grep -E '^FAIL|Error' "$out/$name/output.txt" | head -5 | sed 's/^/        /'
    failed+=("$name")
  fi
done

echo
if [ ${#failed[@]} -eq 0 ]; then
  echo "all ${#scripts[@]} passed"
else
  echo "${#failed[@]} of ${#scripts[@]} failed: ${failed[*]}"
  exit 1
fi
