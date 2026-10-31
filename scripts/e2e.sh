#!/usr/bin/env bash
# Runs the browser scripts against a pair of dev servers of their own, on
# spare ports so a `pnpm dev` already running is left alone, and sums up.
#
#   scripts/e2e.sh               every script
#   scripts/e2e.sh solo host     just these
#
# Short rounds, which every script copes with (reconnect picks its own).
# Each script's output and screenshots go to smoke-out/e2e/<name>/.
#
# E2E_JOBS scripts run at once (3 by default), longest first; those that time
# the round clock run alone at the end, as load would skew them. Each script
# is stopped after E2E_TIMEOUT seconds (300 by default).
set -euo pipefail

cd "$(dirname "$0")/.."
export CLIENT_PORT="${CLIENT_PORT:-5180}" PORT="${PORT:-8790}"
jobs_at_once="${E2E_JOBS:-3}"
time_limit="${E2E_TIMEOUT:-300}"
# Longest first, so the slowest is not left running on its own at the end.
LONGEST=(vr vr-multiplayer load-failures flows multiplayer phone score-review deadline reconnect host solo touch)
ALONE=(sound deadline)
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

# Something already listening would answer the health checks in place of the
# servers started here.
for port in "$CLIENT_PORT" "$PORT"; do
  if (exec 3<>"/dev/tcp/localhost/$port") 2>/dev/null; then
    echo "port $port is already in use; stop whatever is on it, or set CLIENT_PORT and PORT"
    exit 1
  fi
done

# Its own process group, so stopping it stops Vite and the game server too.
set -m
ROUND_MS=12000 ROUNDS=2 CONNECTIONS_PER_ADDRESS=1000 pnpm dev >"$out/servers.log" 2>&1 &
servers=$!
set +m
trap 'kill -- "-$servers" 2>/dev/null || true' EXIT

up=false
for _ in $(seq 1 60); do
  kill -0 "$servers" 2>/dev/null || break
  if curl -sf "localhost:$PORT/api/health" >/dev/null && curl -sf "localhost:$CLIENT_PORT" >/dev/null; then
    up=true
    break
  fi
  sleep 1
done
if ! $up || ! kill -0 "$servers" 2>/dev/null; then
  echo "the dev servers did not start; see $out/servers.log"
  exit 1
fi

run() {
  local name=$1 start=$SECONDS status=0
  mkdir -p "$out/$name"
  (cd packages/client && timeout "$time_limit" node --experimental-transform-types --disable-warning=ExperimentalWarning "browser/e2e/$name.ts" "../../$out/$name") >"$out/$name/output.txt" 2>&1 || status=$?
  if [ "$status" -eq 0 ]; then
    printf 'ok    %-16s %3ss\n' "$name" $((SECONDS - start))
    rm -f "$out/$name/failed"
  else
    [ "$status" -eq 124 ] && echo "stopped after ${time_limit}s" >>"$out/$name/output.txt"
    printf 'FAIL  %-16s %3ss  %s\n' "$name" $((SECONDS - start)) "$out/$name/output.txt"
    grep -E '^FAIL|Error|stopped after' "$out/$name/output.txt" | head -5 | sed 's/^/        /'
    touch "$out/$name/failed"
  fi
}
in_list() {
  local x=$1
  shift
  for y in "$@"; do [ "$x" = "$y" ] && return 0; done
  return 1
}
together=()
for name in "${LONGEST[@]}"; do
  in_list "$name" "${scripts[@]}" && ! in_list "$name" "${ALONE[@]}" && together+=("$name")
done
for name in "${scripts[@]}"; do
  in_list "$name" "${together[@]}" "${ALONE[@]}" || together+=("$name")
done
# Waits on the scripts' own jobs: the dev servers run in the background too.
running=()
for name in "${together[@]}"; do
  while :; do
    still=()
    for pid in "${running[@]}"; do kill -0 "$pid" 2>/dev/null && still+=("$pid"); done
    running=("${still[@]}")
    [ "${#running[@]}" -lt "$jobs_at_once" ] && break
    wait -n "${running[@]}" || true
  done
  run "$name" &
  running+=($!)
done
for pid in "${running[@]}"; do wait "$pid" || true; done
for name in "${ALONE[@]}"; do
  in_list "$name" "${scripts[@]}" && run "$name"
done
failed=()
for name in "${scripts[@]}"; do
  [ -e "$out/$name/failed" ] && failed+=("$name")
done
echo
if [ ${#failed[@]} -eq 0 ]; then
  echo "all ${#scripts[@]} passed"
else
  echo "${#failed[@]} of ${#scripts[@]} failed: ${failed[*]}"
  exit 1
fi
