# sotto-mcp-server

An MCP server that lets any agent pay for web resources — confidentially where the rail allows — inside a
policy its owner set. Transport: stdio.

## Tools

| Tool | Purpose |
|---|---|
| `sotto_fetch` | Fetch a URL; if it answers 402 (x402 or MPP), pay on a supported rail if the policy allows, and return the body plus the receipt. Denials come back as actionable errors with the remaining budget. |
| `sotto_budget` | Per-payment cap, remaining hourly/daily/monthly budget, host lists, expiry, paused state. |
| `sotto_receipts` | Signed receipts, newest first. |
| `sotto_decisions` | Recent allow/deny decisions with reasons. |
| `sotto_set_paused` | The kill switch. |

## Configuration (environment)

```
SOTTO_AGENT_ID=claude
SOTTO_POLICY={"maxPerPaymentUsd":0.5,"perHourUsd":2,"perDayUsd":10,"allowHosts":["*.example.com"]}
SOTTO_RECEIPTS_FILE=~/.sotto/receipts.jsonl

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

## Claude Code

```json
{ "mcpServers": { "sotto": { "command": "node", "args": ["packages/mcp-server/dist/index.js"], "env": { "SOTTO_AGENT_ID": "claude", "SOTTO_POLICY": "{\"maxPerPaymentUsd\":1,\"perDayUsd\":5}", "SOTTO_SOLANA_RPC_URL": "http://127.0.0.1:8899", "SOTTO_SOLANA_KEYFILE": "/path/agent.json", "SOTTO_SOLANA_NETWORK": "solana:localnet", "SOTTO_SOLANA_MINTS": "[{\"mint\":\"…\",\"decimals\":6}]" } } } }
```
