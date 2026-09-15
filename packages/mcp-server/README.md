# sotto-mcp-server — and the `sotto` CLI

One package, two doors into the same five operations. An **MCP server** (stdio) for agents that reach tools
through a host, and a **CLI** for agents with a shell, taught by the Agent Skill in [`skills/sotto`](../../skills/sotto/SKILL.md).
Both read the same `SOTTO_*` configuration and share one state directory, so budgets, receipts and the kill
switch are the same whichever door the agent came through.

| operation | MCP tool | CLI |
|---|---|---|
| Fetch a URL; if it answers 402 (x402 or MPP), pay on a supported rail when the policy allows, and return the body plus the receipt. Denials come back as actionable errors with the remaining budget. | `sotto_fetch` | `sotto fetch <url> [-X POST] [-H "k: v"] [-d body] [--json]` |
| Per-payment cap, remaining hourly/daily/monthly budget, host lists, expiry, paused state | `sotto_budget` | `sotto budget [--json]` |
| Signed receipts, newest first | `sotto_receipts` | `sotto receipts [--limit N] [--since ISO] [--json]` |
| Recent allow/deny decisions with reasons | `sotto_decisions` | `sotto decisions [--limit N] [--json]` |
| The kill switch: pause / resume, persisted on disk | `sotto_set_paused` | `sotto pause` · `sotto resume` |

CLI exit codes: `0` ok · `1` request failed or non-2xx · `2` usage · `3` payment denied by policy. In text mode the
body goes to stdout and the one-line receipt to stderr; `--json` prints `{status, headers, body, payment}`.

## Configuration (environment)

```
SOTTO_AGENT_ID=claude
SOTTO_POLICY={"maxPerPaymentUsd":0.5,"perHourUsd":2,"perDayUsd":10,"allowHosts":["*.example.com"]}
SOTTO_STATE_DIR=~/.sotto          # receipts.jsonl, decisions.jsonl and the `paused` marker live here
                                  # (SOTTO_RECEIPTS_FILE / SOTTO_DECISIONS_FILE override the file paths)

# Solana (confidential): a keypair file; mints default to $1 each unless usdPrice is set
SOTTO_SOLANA_RPC_URL=https://api.devnet.solana.com
SOTTO_SOLANA_KEYFILE=~/.config/solana/id.json
SOTTO_SOLANA_NETWORK=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
SOTTO_SOLANA_MINTS=[{"mint":"…","decimals":6}]

# Zcash (shielded): a running `zcash-settler serve` with a spending key
SOTTO_ZCASH_SETTLER_URL=http://127.0.0.1:8777
SOTTO_ZEC_PRICE_USD=40

# Tempo: an EOA private key (testnet: Moderato, chain 42431)
SOTTO_TEMPO_PRIVATE_KEY=0x…
```

The policy engine replays `decisions.jsonl` on start, so a daily budget holds across restarts and across one-shot
CLI calls; a payment that was authorized but never settled is voided and stops counting. The `paused` marker is
a plain file: `touch ~/.sotto/paused` from any shell is a valid emergency stop.

## Claude Code (MCP)

```json
{ "mcpServers": { "sotto": { "command": "node", "args": ["packages/mcp-server/dist/index.js"], "env": { "SOTTO_AGENT_ID": "claude", "SOTTO_POLICY": "{\"maxPerPaymentUsd\":1,\"perDayUsd\":5}", "SOTTO_SOLANA_RPC_URL": "http://127.0.0.1:8899", "SOTTO_SOLANA_KEYFILE": "/path/agent.json", "SOTTO_SOLANA_NETWORK": "solana:localnet", "SOTTO_SOLANA_MINTS": "[{\"mint\":\"…\",\"decimals\":6}]" } } } }
```

`packages/demo/demo.sh mcp` prints this filled in for the running demo.

## Any agent with a shell (CLI + skill)

```bash
export PATH="$PWD/packages/mcp-server/bin:$PATH"     # or `npm link` here; the npm package installs `sotto` as a bin
cp -r skills/sotto ~/.claude/skills/                  # Claude Code personal skills; any Agent Skills runtime works the same
eval "$(packages/demo/demo.sh env)"                   # demo configuration, or export the variables above yourself
sotto budget && sotto fetch http://127.0.0.1:4020/premium/quote
```

## Tests

`npx vitest run` (needs the local validator from `demo.sh`, and `SOLANA_PAYER_KEYFILE` / `SOLANA_PAYEE_KEYFILE`): one
test drives the MCP server over stdio with the MCP client SDK; one runs the CLI as a subprocess and checks that the
budget survives between processes and that the kill switch holds.
