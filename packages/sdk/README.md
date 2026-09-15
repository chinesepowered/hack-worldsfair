# @sotto/sdk

Confidential, budgeted payments for AI agents. See the [repository README](../../README.md) for the
big picture; this file is the API map.

| Module | What it is |
|---|---|
| `money` | `Usd6` micro-dollars, `PriceSource` / `StaticPriceSource`, stablecoin detection |
| `policy` | `PolicyEngine`, `Policy`, `PolicyViolation`, `DecisionLog` — per-payment caps, rolling budgets, host/network lists, expiry, kill switch |
| `receipts` | `Receipt`, `ReceiptSigner` (Ed25519, canonical JSON), `MemoryReceiptStore`, `FileReceiptStore` |
| `rails/solana-confidential` | `deriveConfidentialKeys`, `payConfidential`, `verifyConfidentialPayment`, `discoverProofSignatures` |
| `rails/zcash-shielded` | `ZcashSettlerClient`, `payShielded`, `verifyShieldedPayment` |
| `x402` | schemes `confidential` (Solana) and `shielded` (Zcash): client, server, facilitator halves; `LocalFacilitatorClient` |
| `mpp` | methods `solana-confidential` and `zcash-shielded`: client and server halves |
| `SottoServer` | payee facade: x402 resource server + self-hosted facilitator + MPP server; `protect(routes)` express middleware |
| `SottoClient` | agent facade: policy-gated paying `fetch` / `fetchDetailed`, signed receipts, `pause()` |

## Verification, precisely

**Solana `confidential`.** The payer submits `{ transferSignature, proofSignatures, paymentId }`. The
verifier fetches the transfer, requires a successful `ConfidentialTransfer` to its own token account plus a
Memo equal to `paymentId`, reads the ciphertext-validity context account the transfer references, finds the
transaction that verified that proof (from the account's own history if the payer didn't say), checks the
context's destination ElGamal key is its own, and decrypts `lo + (hi << 16)` with its secret. An auditor
does the same with the mint's auditor key at index 2. Nothing is trusted from the payer.

**Zcash `shielded`.** The payer's settler sends a shielded note with `paymentId` as the encrypted memo.
The payee's viewing-key settler scans for a received output with that memo and at least the required
value — mempool first, then mined.

## Tests

`pnpm test` runs everything that needs no infrastructure. With `SOLANA_PAYER_KEYFILE` and
`SOLANA_PAYEE_KEYFILE` set (and a local validator — recipe in the repo README) the Solana integration
tests run; `TEMPO_TEST_PK` adds live Tempo; `ZCASH_SETTLER_URL` adds the live settler check.
