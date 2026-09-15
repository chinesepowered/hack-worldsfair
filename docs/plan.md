# Build plan & status

Living document. Update status here every session; decisions go in the log at the bottom.
Deadline: **Oct 12, 2026, 11:59pm PT**. Last five days are reserved for videos + GTM + submission.

## Phase 0 — de-risk (first 3 days)
- [ ] Zcash: shielded send with memo on testnet from Rust; detect it via viewing key (settler prototype)
- [ ] Zcash: testnet funding path (faucet claim automated or manual)
- [ ] Solana: Token-2022 confidential transfer end to end on devnet from TypeScript
- [ ] Tempo: testnet RPC + faucet + one TIP-20 transfer with memo; read MPP spec (human: workshop Sep 16)
- [ ] x402 v2: understand scheme/network extension points; decide how confidential settlement plugs in
- [ ] Decide: Base vs Tempo as the third must-ship backend (Tempo if MPP integration is tractable)

## Phase 1 — must-ship
- [ ] `packages/sdk`: x402 v2 client + server middleware, policy engine (budget/allowlist/expiry)
- [ ] Backend: Solana confidential (`@solana-program/token-2022/confidential`) + auditor key
- [ ] Backend: Zcash shielded via `services/zcash-settler` (payment ID in memo, viewing-key watcher)
- [ ] Backend: Tempo (MPP + TIP-20 memo) — or Base x402 `exact` if Tempo slips
- [ ] `packages/mcp-server`: `pay`, `fetch_paid`, `budget_status` tools
- [ ] `packages/demo`: paywalled API + agent + observer/owner/auditor views (the demo path)
- [ ] README per chain, written for that ecosystem's developers; live tx links on each chain
- [ ] License, CI, tests for the policy engine and each backend's happy path

## Phase 2 — stretch (only after Phase 1 is green)
- [ ] `contracts/evm`: EIP-7702 spend-policy delegate; deploy to Base, Ethereum Sepolia, Arbitrum, HyperEVM, Robinhood Chain testnets
- [ ] Tempo-specific: fee sponsorship, virtual addresses
- [ ] Auditor dashboard beyond CLI
- [ ] Real usage: publish MCP server, post in x402/MCP communities, collect transactions from strangers

## Phase 3 — submission (Oct 7–12)
- [ ] `docs/pitch.md` → 2–3 min pitch video (human)
- [ ] `docs/demo-script.md` → ≤3 min demo video (human)
- [ ] GTM + demand validation writeup; logo; submission form; all chains listed explicitly

## Cut without guilt
Burner wallets · Agent Miles · UI polish beyond the demo path · any fourth chain before three work.

## Decisions log
- 2026-09-15 — Working name **sotto** (sotto voce). Trivial to rename.
- 2026-09-15 — Build on x402 **v2** (`@x402/*` 2.x), not legacy `x402` 1.x. Confidential settlement as
  extensions of the standard, not a fork.
- 2026-09-15 — Solana CT in **TypeScript** (`@solana-program/token-2022/confidential`); Rust only for Zcash.
- 2026-09-15 — Tempo speaks **MPP** natively (Tempo's own agent-payment protocol) alongside x402.
- 2026-09-15 — Zcash lightwalletd endpoint: `https://testnet.zec.rocks:443` (only 443 reachable here).
