# Architecture

One confidential settlement core, two protocol faces, one policy engine. Explainable in two sentences:
**"Agents pay for things over the standards that already exist (x402 and MPP). We add settlement rails
where the amount is hidden from the public, a spend policy that bounds the agent, and receipts that the
owner and an auditor can read but nobody else can."**

```
 AGENT SIDE                                             SERVER SIDE (paid API / MCP tool)
 ─────────                                              ────────────────────────────────
 Claude ──MCP──▶ sotto-mcp ──▶ @sotto/sdk client        @sotto/sdk server middleware
                              │ policy engine           │ protocol faces
                              │  budget · allowlist     │  x402 resource server + self-hosted facilitator
                              │  expiry · per-tx cap    │  MPP server (mppx)
                              │ protocol faces          │ settlement verifiers (payee side)
                              │  x402 client (@x402)    │  solana-confidential: decrypt received amount
                              │  MPP client (mppx)      │    with payee ElGamal key (auditor key also works)
                              │ settlement backends     │  zcash-shielded: viewing-key watcher matches
                              │  (payer side)           │    memo == payment id and amount ≥ required
                              ▼                         │  tempo: TIP-20 TransferWithMemo, memo == id
   solana-confidential  Token-2022 CT, auditor key      │  evm-exact: standard x402 verify/settle
   zcash-shielded       via zcash-settler daemon (Rust) ▼
   tempo-tip20          MPP `tempo` method, memo = id   receipts store ──▶ owner view (everything)
   evm-exact            @x402/evm on Base et al.                        ──▶ auditor view (scoped, viewing keys)
                                                                        ──▶ public view (nothing)
```

## Protocol faces

- **x402 v2** (`@x402/core` 2.x). We register **two new schemes** alongside `exact`:
  - `scheme: "confidential"` on `solana:*` — Token-2022 confidential transfer.
  - `scheme: "shielded"` on `zcash:*` — shielded Zcash payment.
  Both use the existing **`payment-identifier` extension** (server sets `required: true`): the id is
  what the payer writes into the Zcash memo / the Solana memo instruction, and what the verifier matches.
  Network ids: `solana:<genesis>` (CAIP-2 standard), and a proposed `zcash:mainnet` / `zcash:testnet`.
- **MPP** (`mppx` 0.9.x — Tempo/Stripe's Machine Payments Protocol, IETF drafts at paymentauth.org).
  Built-in `tempo` charge method for Tempo; `Method.from(...)` custom methods `solana-confidential` and
  `zcash-shielded` mirror the x402 schemes. MPP's challenge id plays the payment-identifier role.
- Why both: Base's judges own x402; Tempo's judges own MPP. Agents in the wild use either. The settlement
  core doesn't care which face the request came through.

## Proof-of-payment vs. facilitator settlement

x402 `exact` has the **facilitator** settle a signed authorization. Confidential rails can't work that way:
a facilitator cannot build or inspect a confidential transfer without the payer's decryption keys, and we
never want those keys off the agent's machine. So `confidential` and `shielded` use a
**proof-of-payment** model: the payer settles on-chain itself (paying its own fees) and presents
`{ txid, paymentId }`; the payee verifies on-chain with keys only it holds. This is the same model MPP's
"transaction hash" credentials use, so it's not novel per se — the novel part is that verification of the
*amount* is possible only because the payee is the recipient (ElGamal) or holds a viewing key (Zcash).

## Settlement backends

| Backend | Payer does | Payee verifies | Confidential? | Track |
|---|---|---|---|---|
| `solana-confidential` | CT transfer via `getConfidentialTransferInstructionPlan` (+ memo ix with payment id) | fetch tx → find CT transfer to its account → decrypt amount with its ElGamal key → ≥ required | **amount hidden**; parties visible | Solana |
| `zcash-shielded` | `zcash-settler /send {to, amount, memo=id}` | settler watcher (UFVK) sees note with memo == id, amount ≥ required (mempool first, then mined) | **amount, sender, receiver hidden** | Zcash |
| `tempo-tip20` | MPP `tempo` charge (TIP-20 `transferWithMemo`, memo = id) | `TransferWithMemo` event match | no (public), but bounded + receipted | Tempo |
| `evm-exact` | x402 `exact` (EIP-3009) via `@x402/evm` | facilitator verify/settle | no | Base, + free EVM deploys |

## Solana `confidential` scheme — verified design (spike 2026-09-15)

A record-backed confidential transfer lands as 5 transactions. Two matter to the verifier:
- **proof tx** — `zk-elgamal-proof: VerifyBatchedGroupedCiphertext3HandlesValidity` (545 bytes) written into a
  context-state account. Its context holds the grouped ciphertexts `lo`/`hi` encrypted to
  (source, destination, auditor).
- **transfer tx** — `token-2022 ConfidentialTransfer` (disc 27/7) referencing that context account, plus the
  **Memo** carrying the x402 `payment-identifier` id, in the same transaction.

Payer submits `{ transferSignature, proofSignatures[], paymentId }`. Payee verifies statelessly:
1. transfer tx succeeded; contains a ConfidentialTransfer whose destination is *my* token account and a
   Memo equal to `paymentId`;
2. the validity-proof tx creates/verifies the exact context account the transfer references;
3. `second_pubkey` in the proof context equals my ElGamal pubkey; decrypt `lo + (hi << 16)` with my
   secret at index 1 → amount ≥ required.
An auditor does step 3 with the mint's auditor key at index 2. The public can do none of it.
Measured: decryption ≈ 0.8 s in Node (WASM discrete-log lookup); the whole flow < 5 s on a local validator.

## Policy engine (bounded spending)

Local, in the client SDK, enforced before any signature is produced: per-agent budget per period,
per-host/per-resource allowlist, max per payment, expiry, and a kill switch. Every decision is logged to
the receipts store. On-chain enforcement (EIP-7702 delegate on EVM; session keys on Solana) is stretch.

## Receipts and disclosure

Each payment yields a signed receipt `{ chain, txid, paymentId, resource, amount, timestamp }`. Amounts
for confidential rails are stored encrypted to the owner. Three views: **owner** (all), **auditor**
(decrypts with a granted viewing/auditor key, optionally scoped by time or counterparty), **public** (chain
data only — which for confidential rails reveals no amount, and for Zcash reveals nothing at all).

## zcash-settler (Rust sidecar)

`services/zcash-settler`: `zcash_client_sqlite` + lightwalletd (`https://testnet.zec.rocks:443`).
HTTP API: `POST /wallets` (seed or UFVK-only), `GET /wallets/:id/address`, `POST /wallets/:id/send
{to, amount, memo}`, `GET /wallets/:id/received?memo=…`, `POST /wallets/:id/sync`. Payee runs it with a
**viewing key only** — the server that verifies payments never holds spending keys.

## What the demo shows (3 minutes)

1. Public agent wallet → its whole purchasing pattern reconstructed live (the problem).
2. Same agent on sotto: public view empty; owner view complete; auditor view scoped. Policy blocks an
   overspend.
3. Chain montage: Solana confidential, Zcash shielded, Tempo, Base — real tx links.
4. One-line MCP install; an agent pays privately from a fresh session.
