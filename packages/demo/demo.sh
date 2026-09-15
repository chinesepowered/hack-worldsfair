#!/usr/bin/env bash
# sotto demo — one command from nothing to a running demo:
#   validator (Token-2022 + SPL Record cloned from devnet) → keys → confidential mint → API + dashboard → Capy (the agent)
#
#   ./demo.sh          start everything (idempotent — safe to re-run)
#   ./demo.sh stop     stop the API, the agent and the validator
#   ./demo.sh reset    stop, wipe the local chain and demo state, start fresh
#   ./demo.sh mcp      print the Claude Code MCP config for the sotto server (agent keys, local chain)
#
# State lives in $DEMO_DIR (default ~/.sotto-demo): keys, ledger, logs, pids. Nothing is written to the repo
# except packages/demo/demo-solana.json and receipts.jsonl, both gitignored.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DEMO_DIR="${DEMO_DIR:-$HOME/.sotto-demo}"
RPC="${SOLANA_RPC_URL:-http://127.0.0.1:8899}"
PORT="${PORT:-4020}"
BUDGET_USD="${BUDGET_USD:-1.5}"
mkdir -p "$DEMO_DIR"

say()  { printf '\033[1m▸ %s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1 — $2"; exit 1; }; }
healthy() { curl -s -m 2 "$RPC" -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q '"ok"'; }
# detached start: setsid (Linux) puts the child in its own session so it outlives this shell; macOS lacks setsid, nohup is enough there
bg() { local name=$1; shift
  if command -v setsid >/dev/null 2>&1; then setsid nohup "$@" > "$DEMO_DIR/$name.log" 2>&1 & else nohup "$@" > "$DEMO_DIR/$name.log" 2>&1 & fi
  echo $! > "$DEMO_DIR/$name.pid"; disown 2>/dev/null || true; }
stop_one() { [ -f "$DEMO_DIR/$1.pid" ] && kill "$(cat "$DEMO_DIR/$1.pid")" 2>/dev/null && rm -f "$DEMO_DIR/$1.pid" && echo "  stopped $1" || true; }

case "${1:-start}" in
  stop)
    for p in agent server validator; do stop_one $p; done; exit 0 ;;
  reset)
    for p in agent server validator; do stop_one $p; done
    rm -rf "$DEMO_DIR/ledger" "$HERE/demo-solana.json" "$HERE/receipts.jsonl"; say "state wiped"; exec "$0" start ;;
  mcp)
    [ -f "$HERE/demo-solana.json" ] || { echo "run ./demo.sh first"; exit 1; }
    MINT=$(node -p "require('$HERE/demo-solana.json').mint"); DEC=$(node -p "require('$HERE/demo-solana.json').decimals"); NET=$(node -p "require('$HERE/demo-solana.json').network")
    cat <<JSON
{ "mcpServers": { "sotto": { "command": "node", "args": ["$ROOT/packages/mcp-server/dist/index.js"],
  "env": { "SOTTO_AGENT_ID": "claude", "SOTTO_POLICY": "{\\"maxPerPaymentUsd\\":1,\\"perDayUsd\\":5,\\"allowHosts\\":[\\"127.0.0.1\\",\\"localhost\\"]}",
           "SOTTO_RECEIPTS_FILE": "$DEMO_DIR/claude-receipts.jsonl",
           "SOTTO_SOLANA_RPC_URL": "$RPC", "SOTTO_SOLANA_KEYFILE": "$DEMO_DIR/agent.json",
           "SOTTO_SOLANA_NETWORK": "$NET", "SOTTO_SOLANA_MINTS": "[{\\"mint\\":\\"$MINT\\",\\"decimals\\":$DEC}]" } } } }
JSON
    echo; echo "# Claude Code: claude mcp add-json sotto '<the sotto object above>'   — or save as .mcp.json in the repo root"; exit 0 ;;
  start) ;;
  *) echo "usage: $0 [start|stop|reset|mcp]"; exit 1 ;;
esac

need pnpm "https://pnpm.io/installation"
need solana "install the Solana CLI: sh -c \"\$(curl -sSfL https://release.anza.xyz/stable/install)\""
need solana-keygen "comes with the Solana CLI"
need solana-test-validator "comes with the Solana CLI"

# 1. local chain
if healthy; then say "validator already running at $RPC"; else
  say "starting the local validator (first start clones Token-2022 and SPL Record from devnet — ~30s)"
  bg validator solana-test-validator --ledger "$DEMO_DIR/ledger" --reset --quiet --rpc-port 8899 --bind-address 127.0.0.1 \
    --clone-upgradeable-program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb \
    --clone-upgradeable-program recr1L3PCGKLbckBqMNcJhuuyU1zgo8nBhfLVsJNwr5 --url https://api.devnet.solana.com
  for i in $(seq 1 45); do healthy && break; sleep 2; done
  healthy || { echo "validator did not come up — see $DEMO_DIR/validator.log"; exit 1; }
fi

# 2. keys + SOL
for k in agent api; do
  [ -f "$DEMO_DIR/$k.json" ] || solana-keygen new --no-bip39-passphrase -s -o "$DEMO_DIR/$k.json" >/dev/null
done
AGENT_PK=$(solana-keygen pubkey "$DEMO_DIR/agent.json"); API_PK=$(solana-keygen pubkey "$DEMO_DIR/api.json")
[ "$(solana balance "$AGENT_PK" --url "$RPC" | cut -d' ' -f1 | cut -d. -f1)" -ge 5 ] 2>/dev/null || solana airdrop 100 "$AGENT_PK" --url "$RPC" >/dev/null
[ "$(solana balance "$API_PK" --url "$RPC" | cut -d' ' -f1 | cut -d. -f1)" -ge 2 ] 2>/dev/null || solana airdrop 10 "$API_PK" --url "$RPC" >/dev/null
say "agent $AGENT_PK · api $API_PK"

# 3. build once
[ -f "$ROOT/packages/sdk/dist/index.js" ] && [ -f "$ROOT/packages/mcp-server/dist/index.js" ] || { say "building packages"; (cd "$ROOT" && pnpm install --silent && pnpm -r build >/dev/null); }

# 4. confidential mint (re-created if the chain no longer has it)
NEED_SETUP=1
if [ -f "$HERE/demo-solana.json" ]; then
  MINT=$(node -p "require('$HERE/demo-solana.json').mint")
  curl -s -m 5 "$RPC" -X POST -H 'content-type: application/json' -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"$MINT\",{\"encoding\":\"base64\"}]}" | grep -q '"owner"' && NEED_SETUP=0
fi
if [ "$NEED_SETUP" = 1 ]; then
  say "creating the confidential mint, the auditor key, and Capy's funded balance"
  rm -f "$HERE/receipts.jsonl"
  (cd "$HERE" && SOLANA_RPC_URL="$RPC" SOLANA_PAYER_KEYFILE="$DEMO_DIR/agent.json" SOLANA_PAYEE_KEYFILE="$DEMO_DIR/api.json" pnpm exec tsx src/setup-solana.ts | tail -1)
fi

# 5. API + dashboard, then Capy
stop_one server >/dev/null; stop_one agent >/dev/null
(cd "$HERE" && SOLANA_PAYEE_KEYFILE="$DEMO_DIR/api.json" PORT="$PORT" bg server pnpm exec tsx src/server.ts)
for i in $(seq 1 20); do curl -s -m 2 "http://127.0.0.1:$PORT/api/rails" >/dev/null 2>&1 && break; sleep 1; done
(cd "$HERE" && LOOP=1 INTERVAL_MS="${INTERVAL_MS:-5000}" BUDGET_USD="$BUDGET_USD" DEMO_URL="http://127.0.0.1:$PORT" SOLANA_PAYER_KEYFILE="$DEMO_DIR/agent.json" bg agent pnpm exec tsx src/agent.ts)

cat <<TXT

  dashboard   http://127.0.0.1:$PORT
  paid route  curl -i http://127.0.0.1:$PORT/premium/quote      (402 with both protocols' challenges)
  agent       Capy buys a \$0.25 quote every ${INTERVAL_MS:-5000}ms until the \$$BUDGET_USD/day budget stops it
  pause       curl -X POST http://127.0.0.1:$PORT/api/agent/pause     (or the button on the dashboard)
  logs        $DEMO_DIR/{validator,server,agent}.log
  mcp         ./demo.sh mcp   →  Claude Code config so Claude can pay through sotto too
  stop        ./demo.sh stop

TXT
