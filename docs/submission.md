# Submission checklist and drafts

Everything the Colosseum portal asks for (per `hackathon.md`), pre-drafted. Fill the blanks, paste, submit
before **Oct 12, 2026, 11:59pm PT**.

## Product name
**sotto**

## One-line description
Confidential, budgeted, auditable payments for AI agents — x402 and MPP compatible, on Solana, Zcash and Tempo.

## Brief description (portal)
Every agent payment today is a public record of what the agent bought, from whom, how often and for how much —
and nothing bounds what it can spend. sotto is a payment rail for agents that fixes both halves. Amounts are
encrypted on-chain (Token-2022 confidential transfers on Solana; fully shielded notes on Zcash). Spending is
bounded by an owner-set policy enforced before anything is signed: per-payment cap, hourly/daily/monthly
budgets, host allow/deny lists, a kill switch. And every payment is provable after the fact: the owner or an
auditor holding a viewing key recovers the exact amount from the chain alone. It plugs into the standards
agents already use — two new x402 schemes, two new Machine Payments Protocol methods, one MCP server, one Agent Skill — so
adoption is one line of config.

## Blockchains and tools integrated
- **Solana** — Token-2022 confidential transfers (ZK ElGamal proof program), SPL Record, Memo; `@solana/kit`, `@solana-program/token-2022`, `@solana/zk-sdk`
- **Zcash** — shielded payments with memo-carried payment ids; `zcash_client_sqlite` / librustzcash light client via a Rust settler (fork of zcash-devtool), lightwalletd (zec.rocks)
- **Tempo** — TIP-20 stablecoin payments via the Machine Payments Protocol (`mppx`), Moderato testnet
- **Protocols** — x402 v2 (`@x402/core`, `@x402/express`, `@x402/fetch`, `@x402/extensions` payment-identifier), MPP (`mppx`), Model Context Protocol (`@modelcontextprotocol/sdk`)
- **Tracks claimed:** Solana, Zcash, Tempo. Compatible with Base/EVM x402 `exact` (not a claimed track).

## Team
Solo founder — [name], San Francisco. Part-time student, City College of San Francisco. [2–3 lines: background, why agents, why payments.]

## Location
San Francisco, CA, USA

## Logo
`docs/img/logo-square.png` (2048 × 2048, Capy + wordmark) for the portal; `docs/img/logo-icon.png` (Capy only) for
avatars; `docs/img/cover.png` (3200 × 1800) as a banner or thumbnail.

## Repository
https://github.com/chinesepowered/hack-worldsfair — **make it public before submitting** (rules §8(e) scores
open-source directly; the Public Goods award requires it). If it must stay private, grant read access to
`hackathon@colosseum.com`.

## Pre-existing code disclosure (required, rules §9 / FAQ)
All application code was written during the contest window (first commit Sep 14, 2026). Third-party
open-source dependencies are used as-is: x402, mppx, Solana program clients, MCP SDK. `services/zcash-settler`
is a fork of zcash/zcash-devtool (MIT/Apache-2.0) with a new `serve` HTTP command and a TLS trust patch —
documented in `services/zcash-settler/VENDORED.md`. AI coding tools (Claude Code) were used throughout.

## Videos
- Presentation / founder video (2–3 min): `docs/video/sotto-founder.mp4` (2:27, Chinese male AI voice, captions in `sotto-founder.srt`), script in
  `docs/pitch.md` — upload it and paste the link here
- Demo (≤ 3 min): https://www.youtube.com/watch?v=4qkV0ExM-Z8 (2:53; source file and captions in `docs/video/`). Scene list: `docs/demo-script.md`

## Go-to-market, demand validation, distribution (draft — replace bracketed claims with real quotes)
**Who buys first.** Teams running agents that purchase data or tools on a schedule — trading and research
agents, procurement agents, monitoring agents — whose purchase pattern is itself sensitive. [Quote 1: an agent
builder on why they won't put spend on a public chain.] [Quote 2.] [Quote 3.]

**Wedge.** The SDK is free and open source. Revenue comes from (1) basis points on settled volume through a
hosted settlement/verification service, and (2) seats for the owner/auditor dashboard — policy management,
receipts, scoped viewing-key disclosure for finance and compliance teams.

**Distribution.** Where agents already pay: the x402 ecosystem (schemes register like any other), MPP's method
registry, and the MCP server listed in MCP directories, the skill in skills registries. Each rail's ecosystem (Solana, Zcash, Tempo) has an
incentive to promote a working confidential-payments integration.

**Demand validation done so far.** [N conversations with agent builders in SF; what they said; who agreed to
pilot.] Signals from the ecosystem: Solana's confidential transfers returned to mainnet in June 2026 with
near-zero usage; Coinbase reports 100M+ x402 payments, all public; Tempo launched mainnet in March 2026 with
agent payments as a stated target.

## Weekly updates (optional, recommended)
1-minute videos: what shipped, what's next. Week 1: rails proven. Week 2: devnet deployments + polish.
Week 3: on-chain policy contract / pilots. Week 4: videos, submission.

## Portal form answers (October 4 version of the form)

Pasted into the Colosseum form; each fits its character limit.

### What are you building, and who is it for?
*966/1000 characters*

sotto is a payment rail for AI agents that keeps their purchases private while keeping their spending bounded and provable. Today an agent that pays with x402 leaves a public record of every purchase: what it bought, from whom, how often and for how much. Anyone can read a trading agent's strategy off the chain, and nothing stops one bad prompt from draining its wallet.

With sotto, payments are confidential by default: amounts are encrypted on Solana and fully shielded on Zcash. Before anything is signed, an owner-set policy decides: per-payment cap, budgets, allowed hosts, expiry, kill switch. The owner gets a signed receipt for every payment, and an auditor with a viewing key can verify exact amounts from the chain alone. Confidential, not anonymous.

It's for teams whose agents buy data, APIs and tools on their own, such as trading, research and procurement agents, and for API sellers who want to get paid by agents without exposing their customers.

### Why did you decide to build this, and why build it now?
*894/1000 characters*

Agents are starting to pay for their own data, APIs and tools, and the standards they use, x402 and Tempo's Machine Payments Protocol, settle on public ledgers. That's fine for a demo but not for a business. No company wants competitors reading its agents' purchases, and no owner wants an agent with an unbounded wallet. Privacy and spending limits are what turn agent payments from a novelty into something a finance team will approve.

Why now: the pieces finally exist. Solana's ZK ElGamal proof program, which powers confidential transfers, came back on mainnet in June 2026, and almost nobody uses it yet. Zcash's shielded payments and viewing keys are mature. x402 and MPP are becoming how agents pay, and MCP servers and Agent Skills let any agent adopt a new payment method with one line of config. sotto plugs into those standards instead of inventing new ones, so it grows with them.

### What technologies are you using or integrating with?
*789/1000 characters*

Solana: Token-2022 confidential transfers with an auditor key, the ZK ElGamal proof program, SPL Record, Memo; @solana/kit, @solana-program/token-2022, @solana/zk-sdk.
Zcash: shielded payments with the payment ID in the encrypted memo; a Rust settler on librustzcash's NU7 pre-releases (fork of zcash-devtool), lightwalletd.
Tempo: TIP-20 stablecoin payments over the Machine Payments Protocol (mppx), Moderato testnet.
Protocols: x402 v2 (@x402/core, payment-identifier extension), MPP, Model Context Protocol (@modelcontextprotocol/sdk), Agent Skills.
Stack: TypeScript, Node 22, Express, Rust (tokio, axum), pnpm, Vitest.
Developer tools: solana-test-validator, Playwright (scripted demo recording), ffmpeg, GitHub.
AI tools: Claude Code (main coding tool), ElevenLabs (demo narration).

### How does your product use these chains?
*471/500 characters*

Solana: agents pay with Token-2022 confidential transfers. Amounts are encrypted; the API and an auditor decrypt them from the chain with their own keys. Zcash: fully shielded payments, already on the NU7 testnet upgrade (v6 transactions); the payment ID rides in the encrypted memo and the API verifies with a viewing key. Tempo: stablecoin payments over Tempo's Machine Payments Protocol, gated by the same spend policy and receipted. One 402 response offers all three.

### Did anyone not listed on the team do meaningful work?
*394/600 characters*

No other people worked on it; I'm a solo founder. I built it with Claude Code as my AI coding tool (listed under technologies). Third-party code is used as unmodified open-source dependencies, except the Zcash settler, a fork of zcash-devtool (MIT/Apache-2.0) with a new HTTP serve command, credited in services/zcash-settler/VENDORED.md. All project code was written during the contest window.

### Anything else judges should know?
*485/500 characters*

The demo video is live, recorded from the running system: Zcash and Tempo on their public testnets, Solana confidential transfers on a local validator with mainnet's program set. Our Zcash service already sends NU7 (v6) transactions on testnet; we ported it to librustzcash's NU7 pre-releases ourselves. The spend policy is enforced by the agent's SDK before signing; on-chain enforcement is next. Demo: youtube.com/watch?v=4qkV0ExM-Z8 · Code: github.com/chinesepowered/hack-worldsfair

### The other fields
- **Chains:** select **Solana, Tempo and Zcash**. Zcash is not ticked yet.
- **Category:** FinTech fits. If there is a Payments or Infrastructure option, either is a closer match.
- **Mobile-focused dApp:** No.
- **Based in:** United States.
- **Telegram:** your own handle.
- **Before submitting:** make the GitHub repo public. Both the README and the demo point to it.
