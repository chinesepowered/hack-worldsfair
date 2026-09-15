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
agents already use — two new x402 schemes, two new Machine Payments Protocol methods, one MCP server — so
adoption is one line of config.

## Blockchains and tools integrated
- **Solana** — Token-2022 confidential transfers (ZK ElGamal proof program), SPL Record, Memo; `@solana/kit`, `@solana-program/token-2022`, `@solana/zk-sdk`
- **Zcash** — shielded (Orchard) payments with memo-carried payment ids; `zcash_client_sqlite` / librustzcash light client via a Rust settler (fork of zcash-devtool), lightwalletd (zec.rocks)
- **Tempo** — TIP-20 stablecoin payments via the Machine Payments Protocol (`mppx`), Moderato testnet
- **Protocols** — x402 v2 (`@x402/core`, `@x402/express`, `@x402/fetch`, `@x402/extensions` payment-identifier), MPP (`mppx`), Model Context Protocol (`@modelcontextprotocol/sdk`)
- **Tracks claimed:** Solana, Zcash, Tempo. Compatible with Base/EVM x402 `exact` (not a claimed track).

## Team
Solo founder — [name], San Francisco. Part-time student, City College of San Francisco. [2–3 lines: background, why agents, why payments.]

## Location
San Francisco, CA, USA

## Logo
`docs/img/logo.svg` (wordmark) — export a PNG for the portal.

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
- Presentation (2–3 min): script in `docs/pitch.md` — [link]
- Demo (≤ 3 min): script in `docs/demo-script.md` — [link]

## Go-to-market, demand validation, distribution (draft — replace bracketed claims with real quotes)
**Who buys first.** Teams running agents that purchase data or tools on a schedule — trading and research
agents, procurement agents, monitoring agents — whose purchase pattern is itself sensitive. [Quote 1: an agent
builder on why they won't put spend on a public chain.] [Quote 2.] [Quote 3.]

**Wedge.** The SDK is free and open source. Revenue comes from (1) basis points on settled volume through a
hosted settlement/verification service, and (2) seats for the owner/auditor dashboard — policy management,
receipts, scoped viewing-key disclosure for finance and compliance teams.

**Distribution.** Where agents already pay: the x402 ecosystem (schemes register like any other), MPP's method
registry, and the MCP server listed in MCP directories. Each rail's ecosystem (Solana, Zcash, Tempo) has an
incentive to promote a working confidential-payments integration.

**Demand validation done so far.** [N conversations with agent builders in SF; what they said; who agreed to
pilot.] Signals from the ecosystem: Solana's confidential transfers returned to mainnet in June 2026 with
near-zero usage; Coinbase reports 100M+ x402 payments, all public; Tempo launched mainnet in March 2026 with
agent payments as a stated target.

## Weekly updates (optional, recommended)
1-minute videos: what shipped, what's next. Week 1: rails proven. Week 2: devnet deployments + polish.
Week 3: on-chain policy contract / pilots. Week 4: videos, submission.
