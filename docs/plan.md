# Build plan & status

Living document. Update status here every session; decisions go in the log at the bottom.
Deadline: **Oct 12, 2026, 11:59pm PT**. Last five days are reserved for videos + GTM + submission.

## Phase 0 — de-risk (first 3 days)
- [~] Zcash: wallet init + sync via `testnet.zec.rocks:443` works from Rust (zcash-devtool, patched to trust the session CA). Send + viewing-key detection blocked on testnet funds
- [~] Zcash: funding — fauzec.com API down (`runtime_unavailable`); jinolabs faucet claim **queued** for our address, auto-sends when their node catches up
- [x] Solana: **confidential transfer end to end from TS ✓** on a local validator (ZK ElGamal native; Token-2022 + SPL Record cloned from devnet). Mint with auditor → accounts → deposit → record-backed transfer (5 txs) with payment-id memo → payee decrypts exact amount; public `amount` stays 0 (`scripts/spike-solana-ct.ts`)
- [x] Tempo: faucet API funded a test key (1M pathUSD). **MPP end to end ✓** — 402 challenge → agent pays 0.01 pathUSD on Moderato → 200 + Payment-Receipt in 1.7s (`scripts/spike-tempo-mpp.ts`)
- [x] x402 v2: `SchemeNetworkClient/Server/Facilitator` interfaces; new schemes `confidential` + `shielded`; `payment-identifier` extension carries the id (see architecture.md)
- [x] Decide: **Tempo via MPP is must-ship** (proven). Base x402 `exact` is the cheap fourth

## Phase 1 — must-ship
- [x] `packages/sdk`: policy engine, signed receipts (memory + JSON-lines file), x402 + MPP adapters for Solana confidential and Zcash shielded, Tempo via mppx, `SottoServer` (dual-protocol 402 middleware) and `SottoClient` (policy-gated paying fetch + receipts). All integration tests green (local validator, fake Zcash settler, live Tempo)
- [x] Backend: Solana confidential — rail (`src/rails/solana-confidential`), x402 scheme `confidential` (`src/x402`), MPP method `solana-confidential` (`src/mpp`); HTTP integration tests green on the local validator
- [~] Backend: Zcash shielded — `services/zcash-settler serve` works (/health /address /balance /sync /send /received); TS rail + x402/MPP adapters in progress; end-to-end blocked on testnet funds (faucets down/queued)
- [x] Backend: Tempo via mppx `tempo` method, policy-gated in `SottoClient`; live facade test on Moderato
- [x] `packages/mcp-server`: `sotto_fetch`, `sotto_budget`, `sotto_receipts`, `sotto_decisions`, `sotto_set_paused` over stdio; driven end to end by the MCP client SDK in a test
- [x] `packages/demo`: `setup:solana`, paywalled API + dashboard (observer / owner / auditor with on-chain proof discovery), scripted agent; runs end to end on the local validator
- [~] README: root + sdk + mcp-server + demo + settler `serve` docs done; per-chain developer sections and live tx links still to add (devnet/testnet deployments)
- [ ] License, CI, tests for the policy engine and each backend's happy path

## Phase 2 — stretch (only after Phase 1 is green)
- [ ] `contracts/evm`: EIP-7702 spend-policy delegate; deploy to Base, Ethereum Sepolia, Arbitrum, HyperEVM, Robinhood Chain testnets
- [ ] Tempo-specific: fee sponsorship, virtual addresses
- [ ] Auditor dashboard beyond CLI
- [ ] Real usage: publish MCP server, post in x402/MCP communities, collect transactions from strangers

## Phase 3 — submission (Oct 7–12)
- [~] `docs/pitch.md` written → 2–3 min pitch video (human)
- [~] `docs/demo-script.md` written → ≤3 min demo video (human)
- [ ] GTM + demand validation writeup; logo; submission form; all chains listed explicitly

## Cut without guilt
Burner wallets · Agent Miles · UI polish beyond the demo path · any fourth chain before three work.

## Decisions log
- 2026-09-15 — Auditor verification discovers proof transactions from the proof context account's own signature history; nothing is trusted from the payer.
- 2026-09-15 — Never `pkill -f <pattern>` from a Claude shell: the pattern matches the calling shell's own command line. Use pidfiles.
- 2026-09-15 — Solana dev loop runs on a **local test validator** (`solana-test-validator --clone-upgradeable-program` for Token-2022 + SPL Record from devnet); public devnet faucets were dry.
- 2026-09-15 — token-2022 **0.17** API: `getCreateMintInstructionPlan(client, input)` (async); helpers take `Token` data (`account.data`), not the `Account` wrapper; multi-tx plans go through `client.sendTransactions`.
- 2026-09-15 — zcash-devtool patched (`with_extra_ca`) to trust `SSL_CERT_FILE`; the sandbox proxy re-terminates TLS. Not needed on a normal machine.
- 2026-09-15 — Working name **sotto** (sotto voce). Trivial to rename.
- 2026-09-15 — Build on x402 **v2** (`@x402/*` 2.x), not legacy `x402` 1.x. Confidential settlement as
  extensions of the standard, not a fork.
- 2026-09-15 — Solana CT in **TypeScript** (`@solana-program/token-2022/confidential`); Rust only for Zcash.
- 2026-09-15 — Tempo speaks **MPP** natively (Tempo's own agent-payment protocol) alongside x402.
- 2026-09-15 — Zcash lightwalletd endpoint: `https://testnet.zec.rocks:443` (only 443 reachable here).
