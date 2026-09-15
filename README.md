# sotto

**Confidential, budgeted payments for AI agents.** An agent pays for APIs, tools and data over the
standards that already exist — [x402](https://github.com/coinbase/x402) and the
[Machine Payments Protocol](https://mpp.dev) — but the amount is hidden from the public, every payment is
bounded by a policy the owner sets, and the owner (or an auditor holding a viewing key) can prove exactly
what was paid, from the chain alone.

> *sotto voce* — "under the voice". Payments that happen quietly, and can be accounted for loudly when
> someone with the right key asks.

Built solo for Colosseum's [Crypto World's Fair](https://colosseum.com/worldsfair) (Sep 14 – Oct 12, 2026).

## Why

Every agent payment today is a public record of what the agent bought, from whom, how often and for how
much. Point a block explorer at a trading agent's wallet and its whole strategy — which data it buys, when,
at what price — writes itself. And nothing bounds what an agent can spend: a bug or a prompt injection
drains the wallet.

sotto fixes both halves:

| | Public rails (x402 `exact`, plain transfers) | sotto |
|---|---|---|
| Amount visible to anyone | yes | **no** — Token-2022 confidential transfers on Solana, shielded notes on Zcash |
| Sender/receiver visible | yes | Solana: yes · **Zcash: no** |
| Owner can prove the amount later | only by trusting the agent's logs | **from the ledger**, with the payee's key or the mint's auditor key |
| Agent spending bounded | no | **per-payment cap, hourly/daily/monthly budgets, host allow/deny, expiry, kill switch** |
| Works with existing agent stacks | — | **yes**: x402 schemes and MPP methods, an MCP server, one `fetch` |

Confidential, not anonymous: the public sees nothing, the owner sees everything, an auditor sees a scoped
slice — the way a business bank account works.

## What's here

```
packages/sdk            @sotto/sdk — policy engine, signed receipts, rails, x402 schemes, MPP methods,
                        SottoServer (payee) and SottoClient (agent)
packages/mcp-server     sotto-mcp-server — sotto_fetch / sotto_budget / sotto_receipts / sotto_decisions / sotto_set_paused
packages/demo           a paywalled API, a scripted agent, and the observer / owner / auditor dashboard
services/zcash-settler  Rust sidecar (fork of zcash-devtool) holding the Zcash wallet, with an HTTP `serve` API
docs/                   architecture, plan, pitch, demo script
```

## Rails

| Rail | Protocol faces | Amount hidden? | How the payee verifies |
|---|---|---|---|
| **Solana** — Token-2022 confidential transfer, SPL Record-backed range proof, payment id in a Memo | x402 scheme `confidential` · MPP method `solana-confidential` | amount | finds the batched ciphertext-validity proof the transfer references, checks the destination ElGamal key is its own, decrypts `lo + (hi << 16)`. An auditor does the same with the mint's auditor key at index 2. |
| **Zcash** — shielded note, payment id in the encrypted memo | x402 scheme `shielded` · MPP method `zcash-shielded` | amount, sender, receiver | its viewing-key-only settler scans for a received note whose memo is the payment id and whose value covers the price |
| **Tempo** — TIP-20 stablecoin transfer via MPP `tempo` | MPP method `tempo` | no (public) | mppx verifies the transfer receipt on Moderato/mainnet |

Everything is proof-of-payment: the payer settles, then presents `{ txid, paymentId }`. No facilitator ever
holds the agent's keys, and a fresh server can verify an old payment with nothing but its own keys.

## Quick start

```bash
pnpm install && pnpm -r build
```

### Payee: protect a route for both protocols

```ts
import express from "express";
import { SottoServer } from "@sotto/sdk";

const server = SottoServer.create({
  secretKey: process.env.MPP_SECRET_KEY!,                       // ≥ 32 bytes
  solana: { rpcUrl, payee: apiSigner, usdMint: { mint, decimals: 6 }, network: "solana:devnet" },
  zcash:  { settler: new ZcashSettlerClient("http://127.0.0.1:8777"), address: "utest1…", network: "zcash:testnet", zecPriceUsd: 40 },
  tempo:  { recipient: "0x…", testnet: true },
});
const app = express();
app.use(server.protect({ "GET /premium": { price: "$0.25" } }));   // one 402 carries PAYMENT-REQUIRED and WWW-Authenticate: Payment
app.get("/premium", (_req, res) => res.json({ data: "…" }));
```

### Agent: a fetch that pays — within policy — and keeps receipts

```ts
import { SottoClient } from "@sotto/sdk";

const agent = await SottoClient.create({
  agentId: "quote-bot",
  policy: { agentId: "quote-bot", maxPerPayment: 500_000n /* $0.50 */, perDay: 10_000_000n /* $10 */, allowHosts: ["*.example.com"] },
  solana: { client, signer, network: "solana:devnet", mints: [{ mint, decimals: 6 }] },
  zcash:  { settler: new ZcashSettlerClient("http://127.0.0.1:8778"), network: "zcash:testnet", zecPriceUsd: 40 },
});
const res = await agent.fetch("https://api.example.com/premium");   // pays confidentially if asked; throws PolicyViolation if the policy says no
console.log(await agent.listReceipts());                             // signed, owner-private
```

### Any MCP client: `sotto-mcp-server`

```json
{ "mcpServers": { "sotto": { "command": "npx", "args": ["sotto-mcp-server"],
  "env": { "SOTTO_AGENT_ID": "claude", "SOTTO_POLICY": "{\"maxPerPaymentUsd\":0.5,\"perDayUsd\":10}",
           "SOTTO_SOLANA_KEYFILE": "~/.config/solana/id.json", "SOTTO_SOLANA_MINTS": "[{\"mint\":\"…\",\"decimals\":6}]" } } } }
```

Then: *"fetch https://api.example.com/premium"* — the agent pays, confidentially, and can tell you what it
spent (`sotto_receipts`) and what it has left (`sotto_budget`). The owner can stop it (`sotto_set_paused`).

## Running the demo

```bash
# 1. local Solana with the ZK ElGamal program and Token-2022 + SPL Record cloned from devnet
solana-test-validator --reset --quiet --rpc-port 8899 \
  --clone-upgradeable-program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb \
  --clone-upgradeable-program recr1L3PCGKLbckBqMNcJhuuyU1zgo8nBhfLVsJNwr5 --url https://api.devnet.solana.com
# 2. a confidential mint with an auditor, funded agent, configured API
cd packages/demo && SOLANA_PAYER_KEYFILE=agent.json SOLANA_PAYEE_KEYFILE=api.json pnpm setup:solana
# 3. the paywalled API + dashboard, then the agent
SOLANA_PAYEE_KEYFILE=api.json pnpm server        # http://127.0.0.1:4020
SOLANA_PAYER_KEYFILE=agent.json pnpm agent       # buys quotes until the daily budget stops it
```

The dashboard shows the same payments three ways: the observer sees transactions with no amounts, the owner
sees signed receipts, and the auditor decrypts the amount from the ledger — discovering the proof
transactions on-chain, trusting nothing from the agent.

## Tests

```bash
pnpm -r test                       # unit tests + fake-settler protocol tests
SOLANA_PAYER_KEYFILE=… SOLANA_PAYEE_KEYFILE=… pnpm -r test     # + local-validator integration tests
TEMPO_TEST_PK=0x… NODE_USE_ENV_PROXY=1 pnpm -r test            # + live Tempo Moderato
ZCASH_SETTLER_URL=http://127.0.0.1:8777 pnpm -r test           # + live settler
```

## Status and honesty

- Solana confidential rail: end to end on a local validator (mainnet has had the ZK ElGamal program back
  since June 2026; usage is near zero — this is early).
- Zcash: settler and both protocol faces work against a fake settler; the wallet syncs against
  `testnet.zec.rocks`; a funded end-to-end run waits on testnet faucets.
- Tempo: end to end on Moderato.
- Spend policy is enforced client-side before any signature. On-chain enforcement (EIP-7702 delegate,
  session keys) is the next step, not shipped.

## License

Apache-2.0. `services/zcash-settler` is a fork of [zcash-devtool](https://github.com/zcash/zcash-devtool)
(MIT / Apache-2.0) — see its `VENDORED.md`.
