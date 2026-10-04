# Build plan & status

Living document. Update status here every session; decisions go in the log at the bottom.
Deadline: **Oct 12, 2026, 11:59pm PT**. Last five days are reserved for videos + GTM + submission.

## Phase 0 — de-risk (first 3 days)
- [~] Zcash: wallet init + sync via `testnet.zec.rocks:443` works from Rust (zcash-devtool, patched to trust the session CA). Send + viewing-key detection blocked on testnet funds
- [x] Zcash: funding — fauzec.com paid 1 TAZ on Oct 1 (its API now needs `"network":"testnet"`); the jinolabs claim never arrived
- [x] Solana: **confidential transfer end to end from TS ✓** on a local validator (ZK ElGamal native; Token-2022 + SPL Record cloned from devnet). Mint with auditor → accounts → deposit → record-backed transfer (5 txs) with payment-id memo → payee decrypts exact amount; public `amount` stays 0 (`scripts/spike-solana-ct.ts`)
- [x] Tempo: faucet API funded a test key (1M pathUSD). **MPP end to end ✓** — 402 challenge → agent pays 0.01 pathUSD on Moderato → 200 + Payment-Receipt in 1.7s (`scripts/spike-tempo-mpp.ts`)
- [x] x402 v2: `SchemeNetworkClient/Server/Facilitator` interfaces; new schemes `confidential` + `shielded`; `payment-identifier` extension carries the id (see architecture.md)
- [x] Decide: **Tempo via MPP is must-ship** (proven). Base x402 `exact` is the cheap fourth

## Phase 1 — must-ship
- [x] `packages/sdk`: policy engine, signed receipts (memory + JSON-lines file), x402 + MPP adapters for Solana confidential and Zcash shielded, Tempo via mppx, `SottoServer` (dual-protocol 402 middleware) and `SottoClient` (policy-gated paying fetch + receipts). All integration tests green (local validator, fake Zcash settler, live Tempo)
- [x] Backend: Solana confidential — rail (`src/rails/solana-confidential`), x402 scheme `confidential` (`src/x402`), MPP method `solana-confidential` (`src/mpp`); HTTP integration tests green on the local validator
- [x] Backend: Zcash shielded — live on testnet end to end (Oct 1): agent pays shielded (Ironwood), the payee's viewing-key settler matches the memo, the API serves, the receipt lands in the owner view
- [x] Backend: Tempo via mppx `tempo` method, policy-gated in `SottoClient`; live facade test on Moderato
- [x] `packages/mcp-server`: `sotto_fetch`, `sotto_budget`, `sotto_receipts`, `sotto_decisions`, `sotto_set_paused` over stdio; driven end to end by the MCP client SDK in a test
- [x] The same five operations as the `sotto` CLI + an Agent Skill (`skills/sotto/SKILL.md`); budgets and the kill switch persist in `~/.sotto` (`FileDecisionLog`, pause marker) so they hold across one-shot CLI calls and restarts; CLI tested as a subprocess
- [x] `packages/demo`: `setup:solana`, paywalled API + dashboard (observer / owner / auditor with on-chain proof discovery), scripted agent; runs end to end on the local validator
- [x] README rewritten for judges (60-second read, verification section, screenshots); package READMEs; settler `serve` docs. Still to add: devnet deployments with public explorer links
- [x] License, CI, tests for the policy engine and each backend's happy path

## Phase 2 — stretch (only after Phase 1 is green)
- [ ] `contracts/evm`: EIP-7702 spend-policy delegate; deploy to Base, Ethereum Sepolia, Arbitrum, HyperEVM, Robinhood Chain testnets
- [ ] Tempo-specific: fee sponsorship, virtual addresses
- [ ] Auditor dashboard beyond CLI
- [ ] Real usage: publish MCP server, post in x402/MCP communities, collect transactions from strangers

## Phase 2.5 — polish (done Sep 15)
- [x] Dashboard v2 on the project identity: summary strip, three ledger panes with explorer links, policy rail with budget meter + pause/resume, live agent feed; agent runs as a loop with a control endpoint
- [x] `docs/submission.md`: every portal field drafted; `docs/img/logo.svg`; CI workflow
- [x] Capy the capybara mascot; one-command demo (`demo.sh start|stop|reset|mcp|env`); every dependency at its latest release (`pnpm -r outdated` empty)
- [ ] Devnet run for public explorer links (devnet faucet rate-limited on Sep 15 — retry)
- [x] Zcash live send; the shielded row is in the demo (owner view merges every agent's ledger)
- [x] Tempo in the demo: `TEMPO_RECIPIENT` turns on MPP `tempo` next to the Solana and Zcash challenges

## Phase 3 — submission (Oct 7–12)
- [~] `docs/pitch.md` + `slides.html` (4-slide deck, published as an artifact) → 2–3 min pitch video (human)
- [x] Demo video (2:53) recorded from the live system by `packages/demo/video` → `docs/video/sotto-demo.mp4` + `.srt`; on YouTube: https://www.youtube.com/watch?v=4qkV0ExM-Z8
- [ ] GTM + demand validation writeup; logo; submission form; all chains listed explicitly

## Cut without guilt
Burner wallets · Agent Miles · UI polish beyond the demo path · any fourth chain before three work.

## Decisions log
- 2026-10-01 — The demo video is **scripted against the live system**, not screen-captured by hand: Playwright drives a stage page (dashboard, a terminal that really runs the commands, Tempo's explorer), CDP screencast captures frames, narration clips (ElevenLabs, voice Sapphire) start when the event they describe happens. Re-recordable in one command. Only time compression: the Zcash block wait, labelled fast-forward on screen.
- 2026-10-01 — Zcash settler bug: compact blocks carry no memos, and `serve` never ran upstream's enhancement step, so `/received?memo=` never matched a real payment. `serve` now enhances after every sync. Mempool acceptance is still not wired (payee waits one block).
- 2026-10-01 — Solana Explorer sits behind a Vercel bot checkpoint for headless browsers; we don't try to get past it. The dashboard's public pane reads the chain directly; Tempo's explorer renders fine.
- 2026-09-15 — Agent integration ships as **both** an MCP server and an Agent Skill + CLI over one `ops.ts`, sharing one state dir. MCP for agents without a shell (hosted agents, host-mediated permission prompts, keys off the agent's machine); the skill for Claude Code / Codex-style agents. Not either/or.
- 2026-09-15 — `@solana-program/memo` 0.14 defaults to the new Memo v4 program (`Memo4c2…`); the payer pins **Memo v3** (deployed on every cluster) and the verifier accepts both. Found by the test suite after the bump.
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
