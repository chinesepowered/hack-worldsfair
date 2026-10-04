<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/img/capy-dark.svg">
    <img src="docs/img/capy.svg" width="200" alt="Capy, the sotto capybara, resting on a redacted ledger row">
  </picture>
</p>
<h1 align="center">sotto</h1>

sotto lets AI agents pay for APIs and data on-chain without broadcasting what they buy. Payments are **confidential**
by default (encrypted amounts on Solana, fully shielded on Zcash), **bounded** by a spend policy the owner sets, and
**auditable** on demand with viewing keys. It speaks x402 and the Machine Payments Protocol, and any agent can use it
through an MCP server or an Agent Skill. **[▶ Watch the 3-minute demo](https://www.youtube.com/watch?v=4qkV0ExM-Z8)**

## Problem and solution

**The problem.** An agent that pays with x402 today leaves a public record of every purchase: what it bought, from
whom, how often and for how much. Point an explorer at a trading agent's wallet and its strategy reads itself. And
nothing bounds what an agent spends, so one bug or one bad prompt can drain the wallet.

**The solution.** sotto gives every payment three audiences, and a gatekeeper in front of all of them.

| Who | What they see |
|---|---|
| **The public** | That a payment happened. On Solana the amount is ciphertext; on Zcash the sender, receiver and amount are all hidden. |
| **The owner** | Every payment as a signed receipt, with the policy decision that allowed it. |
| **An auditor** | The exact amounts, decrypted from the chain with a viewing key, without trusting anything the agent reports. |

Before anything is signed, the owner's policy decides: a per-payment cap, hourly, daily and monthly budgets, allowed
and blocked hosts, an expiry date, and a kill switch. Confidential, not anonymous.

<p align="center"><img src="docs/img/slide-2.png" width="880" alt="Slide 2: sotto, paid quietly, proven loudly: the public, the owner and an auditor see the same payment differently"></p>

## How it works

1. **Ask.** An agent requests a paid resource through the SDK, the MCP server, or the `sotto` CLI.
2. **Challenge.** The API answers `402 Payment Required` with both protocols in one response: an x402
   `PAYMENT-REQUIRED` header (schemes `confidential` and `shielded`) and MPP `WWW-Authenticate: Payment` challenges
   (`solana-confidential`, `zcash-shielded`, `tempo`).
3. **Decide.** The agent's policy engine prices the request in dollars and checks the owner's rules. A refusal happens
   here, before any key signs anything.
4. **Pay.** The agent pays on a rail it is set up for and ties a unique payment ID to the payment: a memo on the
   Solana transfer, the encrypted memo of the Zcash note, the MPP credential on Tempo.
5. **Verify.** The API checks the chain itself. On Solana it decrypts the transferred amount with its own key; on
   Zcash its viewing-key wallet finds the note by memo; on Tempo, MPP's `tempo` method confirms the transfer.
6. **Receipt.** The API serves the resource. The agent keeps a signed receipt of the payment ID, the transactions and
   the dollar amount, and logs the policy decision that allowed it.
7. **Audit.** The mint's auditor key on Solana, or a viewing key on Zcash, recovers exact amounts from the ledger
   alone. The proof transactions are found on-chain, so nothing rests on the agent's word.

The pieces: `packages/sdk` holds the policy engine, receipts, rails, x402 schemes, MPP methods, `SottoServer` and
`SottoClient`. `packages/mcp-server` is the MCP server plus the `sotto` CLI, and `skills/sotto` is the Agent Skill
that teaches an agent to use it. `services/zcash-settler` is a Rust service that holds the Zcash wallet. `packages/demo`
is a paid API, the owner and auditor dashboard, and Capy, the demo agent; `demo.sh` starts all of it.

<p align="center"><img src="docs/img/dashboard.png" width="920" alt="The demo dashboard: Capy, Claude Code and a Tempo agent paying one API, as the public, the owner and an auditor see it"></p>
<p align="center"><em>The demo dashboard, live: Capy, Claude Code and a Tempo agent paying one API. The public sees redacted
amounts, the owner sees every receipt, the auditor decrypts from the chain, and the policy refuses Capy once its budget is spent.</em></p>

## Sponsors at a glance

| Sponsor | What sotto builds on | How agents pay | Verified on |
|---|---|---|---|
| **Solana** | Token-2022 confidential transfers with an auditor key, ZK ElGamal proofs | x402 `confidential` · MPP `solana-confidential` | Local validator with mainnet's program set |
| **Zcash** | Shielded payments, payment ID in the encrypted memo, viewing-key verification | x402 `shielded` · MPP `zcash-shielded` | Zcash testnet, after the NU7 upgrade |
| **Tempo** | TIP-20 stablecoin payments over Tempo's Machine Payments Protocol | MPP `tempo` | Moderato testnet |

## Sponsor details

### Solana

- **Confidential transfers.** The mint uses Token-2022's confidential transfer extension with an auditor ElGamal key.
  A payment is a confidential transfer whose range proof is staged in an SPL Record account, five transactions in
  all, with the payment ID in a Memo on the transfer. It settles in about two seconds.
- **Why now.** The ZK ElGamal proof program came back to mainnet in June 2026 and is still barely used. Agent payments
  are a natural first workload for it.
- **Verification without trust.** The API decrypts the amount with its own ElGamal key from the proof data, with no
  indexer and no input from the payer. An auditor decrypts the same ciphertext with the mint's auditor key, finding
  the proof transactions through the proof account's own signature history. The API's public balance stays at zero.
- **Where.** `packages/sdk/src/rails/solana-confidential`, `packages/sdk/src/x402/solana-confidential.ts` and
  `packages/sdk/src/mpp/solana-confidential.ts`. The demo runs on a local validator that clones Token-2022 and SPL
  Record from devnet; the same code targets devnet or mainnet by RPC URL.

### Zcash

- **Fully shielded payments.** The payment ID rides in the note's encrypted memo, so the sender, receiver, amount and
  the ID itself never appear on-chain.
- **Verification by viewing key.** The API runs a settler that holds only a viewing key: it sees incoming payments
  and cannot spend. It accepts the note whose memo matches the payment ID and whose value covers the price.
- **The settler.** Rust, a fork of zcash-devtool on the librustzcash light-client crates, syncing through lightwalletd.
  sotto adds a `serve` HTTP API (`/address`, `/sync`, `/balance`, `/send`, `/received`); the payer runs one with a
  spending key. It runs on librustzcash's NU7 pre-releases, so it sends the new v6 transactions.
- **Already on NU7.** NU7 activated on Zcash testnet at block 4,465,026. Upstream zcash-devtool hadn't moved yet, so
  we ported the settler ourselves; sotto's first shielded payment after the upgrade,
  `e4485faaf569444cdb4274ae07d0eac5a2fc4cb1165301336bd78ac1fa9fad94`, is a v6 transaction (consensus branch
  `0x77190AD9`) mined at block 4,465,375.
- **Settlement.** The API accepts a payment once it is mined, one block, about a minute in our runs. The demo video
  shows an earlier payment from before NU7, `99e91cbac3f5e9e8b0e5ec10bbdf0ad12673d65a8becf709cdf66ffbd4f8cb1c`.
- **Where.** `services/zcash-settler`, `packages/sdk/src/rails/zcash-shielded`, `packages/sdk/src/x402/zcash-shielded.ts`
  and `packages/sdk/src/mpp/zcash-shielded.ts`.

### Tempo

- **Native MPP.** The API issues an MPP `tempo` challenge next to the Solana and Zcash ones, and the agent pays a
  TIP-20 stablecoin (pathUSD) through `mppx`, with fees paid in the stablecoin.
- **What sotto adds.** The owner's policy checks every Tempo payment before it is signed, and each payment gets a
  signed receipt in the same ledger as the Solana and Zcash ones. Tempo transfers are public on-chain, so here sotto
  brings the budgets and the audit trail.
- **Live on Moderato.** About two seconds per payment, for example
  [this $0.25 payment on Tempo's explorer](https://explore.testnet.tempo.xyz/tx/0x9f09061288efdc98126a299b71cc957f8cb709992756e10ba4f8d864eb4e63b9).
- **Where.** The `tempo` rail in `packages/sdk/src/client.ts` and `packages/sdk/src/server.ts`; the demo turns it on
  with `TEMPO_RECIPIENT`.

## Repository map

```
packages/sdk            @sotto/sdk: policy engine, signed receipts, rails, x402 schemes, MPP methods,
                        SottoServer (payee) and SottoClient (agent)
packages/mcp-server     sotto-mcp-server and the `sotto` CLI: fetch, budget, receipts, decisions, pause,
                        as MCP tools and as shell commands
skills/sotto            the Agent Skill (SKILL.md) that teaches an agent with a shell to pay through the CLI
packages/demo           the paid API, Capy the demo agent, the three-viewpoint dashboard, demo.sh
packages/demo/video     the script that records the demo video from the live system
services/zcash-settler  Rust service (fork of zcash-devtool) holding the Zcash wallet behind an HTTP API
docs/                   architecture, plan and decisions log, pitch, demo script, the demo video source
slides.html             the 4-slide pitch (← → keys)
```

## Run it

### The demo

```bash
pnpm install && pnpm -r build
packages/demo/demo.sh          # local Solana (ZK ElGamal + Token-2022 + SPL Record), keys, confidential mint, API + dashboard, Capy
```

Open http://127.0.0.1:4020: watch the public column stay redacted while the owner column fills, click **decrypt**
in the auditor column, then hit **Pause spending** and watch the next purchase get refused before it is signed.
To accept Tempo too, set `TEMPO_RECIPIENT=0x…`; for Zcash, set `ZCASH_SETTLER_URL` and `ZCASH_ADDRESS` with a payee
settler running (see `packages/demo/demo.sh`).

Then let your own agent in, on the same chain and mint:

```bash
packages/demo/demo.sh mcp                                   # Claude Code / any MCP client: the config to paste
eval "$(packages/demo/demo.sh env)" && sotto fetch http://127.0.0.1:4020/premium/quote    # the CLI + Agent Skill door
```

`demo.sh stop` stops everything; `demo.sh reset` wipes the chain and starts fresh. Needs Node 22, pnpm and the Solana CLI
(`sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`). The manual, step-by-step path is in
[`packages/demo/README.md`](packages/demo/README.md).

### In your own code

**Payee: protect a route for both protocols**

```ts
import express from "express";
import { SottoServer, ZcashSettlerClient } from "@sotto/sdk";

const server = SottoServer.create({
  secretKey: process.env.MPP_SECRET_KEY!,                       // ≥ 32 bytes
  solana: { rpcUrl, payee: apiSigner, usdMint: { mint, decimals: 6 }, network: "solana:devnet" },
  zcash:  { settler: new ZcashSettlerClient("http://127.0.0.1:8778"), address: "utest1…", network: "zcash:testnet", zecPriceUsd: 40 },
  tempo:  { recipient: "0x…", testnet: true },
});
const app = express();
app.use(server.protect({ "GET /premium": { price: "$0.25" } }));
app.get("/premium", (_req, res) => res.json({ data: "…" }));
```

**Agent: a fetch that pays within policy and keeps receipts**

```ts
import { SottoClient } from "@sotto/sdk";

const agent = await SottoClient.create({
  agentId: "quote-bot",
  policy: { agentId: "quote-bot", maxPerPayment: 500_000n /* $0.50 */, perDay: 10_000_000n /* $10 */, allowHosts: ["*.example.com"] },
  solana: { client, signer, network: "solana:devnet", mints: [{ mint, decimals: 6 }] },
});
const res = await agent.fetch("https://api.example.com/premium");   // pays confidentially if asked; throws PolicyViolation if the policy says no
```

**Any MCP client**

```json
{ "mcpServers": { "sotto": { "command": "node", "args": ["packages/mcp-server/dist/index.js"],
  "env": { "SOTTO_AGENT_ID": "claude", "SOTTO_POLICY": "{\"maxPerPaymentUsd\":0.5,\"perDayUsd\":10}",
           "SOTTO_SOLANA_KEYFILE": "~/.config/solana/id.json", "SOTTO_SOLANA_MINTS": "[{\"mint\":\"…\",\"decimals\":6}]" } } } }
```

**Any agent with a shell: the Agent Skill**

```bash
cp -r skills/sotto ~/.claude/skills/            # or any Agent Skills-compatible runtime
export PATH="$PWD/packages/mcp-server/bin:$PATH" SOTTO_AGENT_ID=claude SOTTO_POLICY='{"maxPerPaymentUsd":0.5,"perDayUsd":10}' \
       SOTTO_SOLANA_KEYFILE=~/.config/solana/id.json SOTTO_SOLANA_MINTS='[{"mint":"…","decimals":6}]'
sotto fetch https://api.example.com/premium     # pays if asked and allowed; exit code 3 means the policy said no
```

The MCP server and the CLI read the same `SOTTO_*` variables and share one state directory (`~/.sotto`), so budgets,
receipts and the kill switch are the same whichever door the agent came through.
