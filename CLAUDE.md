# sotto — confidential, budgeted payments for AI agents

Hackathon build for Colosseum's **Crypto World's Fair** (Sep 14 – Oct 12, 2026; submissions due
**Oct 12, 2026, 11:59pm PT**). Before doing anything, read `final.md` (thesis + decision) and
`docs/plan.md` (live status + decisions log). `hackathon.md` has the rules, prizes, and judging criteria.

## What this is
An x402-compatible payment rail for AI agents where payments are **confidential by default** (amounts
hidden from the public), **bounded by policy** (per-agent budgets/allowlists), and **auditable on demand**
(owner sees everything; auditors get scoped viewing keys). Framing is always *confidential, not anonymous*.

Settlement backends, each a first-class integration (these are the hackathon tracks we're stacking):
- **Solana** — Token-2022 confidential transfers with an auditor key (TypeScript: `@solana-program/token-2022/confidential`).
  ZK ElGamal proof program re-enabled on mainnet June 2026; usage near zero → true "why now".
- **Zcash** — shielded payment; the payment ID rides in the encrypted memo; the server detects settlement
  via its own viewing key. Rust settler daemon (`services/zcash-settler`) on librustzcash light-client crates.
- **Tempo** — EVM-compatible, fees in stablecoins, TIP-20 tokens with 32-byte memos, and its own
  **Machine Payments Protocol (MPP)** for agent payments. On Tempo we speak MPP natively, not just x402.
- **Base / other EVM** — standard x402 v2 `exact` scheme; the spend-policy contract deploys to every EVM
  track (Ethereum L1, Arbitrum, Robinhood Chain, HyperEVM) for free.
- **MCP server** so any agent adopts it in one line. **Open source** (Apache-2.0), public repo.

## Repo layout
- `packages/sdk` — TypeScript: x402 v2 client/server extensions, policy engine, Solana CT + EVM + Tempo backends
- `packages/mcp-server` — MCP server exposing pay/fetch tools
- `packages/demo` — demo paywalled API + agent + owner/auditor dashboard (the 3-minute demo path)
- `services/zcash-settler` — Rust: shielded send + viewing-key watcher, HTTP API for the SDK
- `contracts/evm` — Solidity: spend-policy delegate (EIP-7702) + deploy scripts
- `docs/` — `plan.md` (status), `architecture.md`, `pitch.md`, `demo-script.md`

## Ground rules
- One solo human founder pitches, registers, and submits; Claude writes the code. **Keep the architecture
  explainable in 15 minutes** — the founder must defend it in a finalist interview. No cleverness that
  can't be explained in two sentences.
- **Testnets/devnets only.** NEVER commit keys, seeds, wallet DBs, or `.env` — not even testnet ones.
- **The container is ephemeral.** Commit and push to `claude/gracious-pasteur-pnnva7` early and often.
  Anything unpushed is lost when the session ends.
- Commit history inside the contest window is part of the submission — small, descriptive commits.
- All content in English (rules §12). Apache-2.0 license.
- Must-ship before stretch. Never add a fourth chain before the first three work end to end.

## Environment quirks (Claude Code remote container)
- Outbound HTTPS only via proxy, **port 443 only**. `lightwalletd…:9067` is blocked → use
  `https://testnet.zec.rocks:443` (gRPC over h2 to it worked with curl; Rust tonic may need a local
  CONNECT bridge — see `services/zcash-settler/README.md` once written).
- `cargo`, `git clone`, `npm`, `pnpm` all work through the proxy. Raw `curl` to github.com is 403 — use git.
- Node's built-in fetch ignores the proxy: run scripts with `NODE_USE_ENV_PROXY=1` when they call out.
- Chromium + Playwright are preinstalled (`/opt/pw-browsers`) — usable for browser-PoW faucets.
- Reference clones live in the scratchpad (`coinbase/x402`, `zcash/zcash-devtool`) — re-clone if gone.

## Commands & local infra
- Solana local validator (needed for confidential transfers; public devnet faucets are unreliable):
  `solana-test-validator --ledger <dir> --reset --quiet --rpc-port 8899 --bind-address 127.0.0.1 \
   --clone-upgradeable-program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb \
   --clone-upgradeable-program recr1L3PCGKLbckBqMNcJhuuyU1zgo8nBhfLVsJNwr5 --url https://api.devnet.solana.com`
  Stop it with `pkill -x solana-test-validator`-style exact matching — **never `pkill -f`** (it kills the calling shell).
  Solana CLI lives at `~/.local/share/solana/install/active_release/bin` (re-install: `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`).
- Build everything: `pnpm install && pnpm -r build` (sdk first; mcp-server and demo consume `@sotto/sdk` from `dist`).
- Tests: `cd packages/sdk && SOLANA_PAYER_KEYFILE=… SOLANA_PAYEE_KEYFILE=… npx vitest run` (needs the local validator);
  `cd packages/mcp-server && … npx vitest run` (spawns the built server over stdio). Add `TEMPO_TEST_PK` + `NODE_USE_ENV_PROXY=1` for live Tempo.
- Demo: see `packages/demo/README.md`. Start long-running servers with `nohup … & echo $! > <pidfile>` and stop them via the pidfile.
- Zcash settler: `services/zcash-settler` builds with `CARGO_TARGET_DIR=<scratch>/zcash-devtool/target cargo build --release` (shares the warm cache);
  binary at `<that target>/release/zcash-settler`; `wallet -w <dir> serve --listen 127.0.0.1:8777 -i <identity> -s zecrocks`.
- Spikes: `cd packages/sdk && SOLANA_PAYER_KEYFILE=… SOLANA_PAYEE_KEYFILE=… pnpm spike:solana`;
  `TEMPO_TEST_PK=… NODE_USE_ENV_PROXY=1 pnpm exec tsx scripts/spike-tempo-mpp.ts`.
- Tempo faucet: `curl -X POST https://tempo.xyz/developers/api/faucet -H 'content-type: application/json' -d '{"address":"0x…"}'` (1M of each test stablecoin).
- Zcash testnet: `zcash-devtool wallet -w <dir> init --name sotto -i <age-identity> -n test -s zecrocks`, then `sync`, `list-addresses`, `balance`, `send`. Faucets: fauzec.com API (`POST /api/v1/claim`), zcashfaucet.jinolabs.xyz (browser PoW).

## Human to-dos (Claude cannot do these)
- [ ] Register: https://colosseum.com/arena/hackathon/register?entry=worldsfair (accept rules)
- [ ] Email hackathon@colosseum.com: (1) does a part-time CCSF student qualify for the University Award?
      (2) can one submission win multiple ecosystem tracks?
- [ ] Tempo workshop **Sep 16, 10am PT** and EF workshop **Sep 22, 10am PT** on Discord — ask what the judges want
- [ ] ~10 demand-validation conversations with people shipping agents in SF; get quotes for the pitch video
- [ ] Weekly 1-minute update videos (optional, recommended)
- [ ] Final week: 2–3 min pitch video, ≤3 min demo video, GTM writeup, logo, submission form
