# Crypto World's Fair — Idea Bank

> Companion to [`hackathon.md`](./hackathon.md). Two lists, optimizing for two different goals.
> Part A maximizes **company outcome** (accelerator admission + a business worth running in 2029).
> Part B maximizes **expected prize cash in December 2026**. They are not the same list, and §C
> covers where they overlap — which is where you should probably build.

---

## 0. Ground rules: can we submit multiple projects?

**No.**

- FAQ: *"No. Each builder can submit only one product and be part of only one team."*
- Rules §7: *"Entrant may only be a Member of one (1) Team. A Team may only submit one (1) Project
  Submission at a time."*

**The nuance:** the cap is per *person*, not per *friend group*. N people may register as N solo teams
and submit N different projects — each person is on exactly one team, each team submits one project.
Nothing in the rules prohibits this.

**Why it's usually a bad trade anyway:**
- Judging explicitly scores *Founder + Market Fit* and *Founder Communication*. Solo teams with no
  complementary skills score badly on both. Colosseum says outright: "our hackathons are highly
  competitive, so we recommend teaming up."
- Four half-built projects lose to one polished one. The submission is a pitch to a VC, and four
  simultaneous pitches signal that none is the real one.
- It forfeits the actual prize. The $250k accelerator check goes to teams Colosseum wants to back
  full-time. Nobody funds a founder who hedged across four ideas in four weeks.

**Verdict:** split only if you genuinely have N independent, capable builders who each want their own
company. Otherwise concentrate. The real lever for stacking prizes is **multi-track eligibility**
(one submission, several chains) — see §B.0.

---

# Part A — 20 startup ideas

Optimizing for: venture-scale TAM, a defensible wedge, a real revenue model, and a story that survives
the 15-minute Zoom interview. Each entry: the wedge → why now → how it makes money → track fit.

### Agentic payments & AI infrastructure
*The strongest "why now" on the board. x402, agent wallets, and agent registries all shipped into the
resources page, which tells you where sponsor attention is.*

**A1. Spend controls for AI agents ("Brex for agents")**
Companies are about to give autonomous agents wallets and have no way to bound the blast radius. Per-agent
spend limits, category allowlists, human-approval thresholds, kill switches, full audit log.
→ *Why now:* x402 + agentic wallets make agent spending real this year; the controls layer doesn't exist.
→ *Revenue:* SaaS per agent + interchange on a spend card.
→ *Build:* Swig session keys / Squads policies + Token ACL. **Track:** Solana, Base.

**A2. Metering and billing for agent-facing APIs ("Stripe Billing for x402")**
Every API that wants to sell to agents per-call needs metering, quotas, invoicing, and revenue share.
x402 handles the payment; nothing handles the *business logic* around it.
→ *Revenue:* % of GMV routed. → **Track:** Base, Solana. Picks-and-shovels on a category about to grow.

**A3. Agent reputation and attestation registry**
Before you let an agent transact with you, you need to know it isn't malicious. Staked identity,
verifiable track record, slashing for misbehavior. Metaplex has a registry; nobody has the trust layer.
→ *Revenue:* verification API, enterprise subscriptions. → **Track:** Solana.

**A4. Agent-to-agent escrow and dispute resolution**
Agent commerce needs conditional settlement: pay on delivery, arbitration when the delivered work is wrong.
→ *Revenue:* bps on escrowed volume. → **Track:** Solana, Base.

### Stablecoin & payments infrastructure
*The single largest real-revenue category in crypto right now, and Tempo exists precisely because Stripe
believes this.*

**A5. Stablecoin treasury OS for emerging-market SMBs**
Businesses in Argentina, Nigeria, Turkey, and Vietnam already hold USD stablecoins informally. Give them
the boring software: multi-currency balances, supplier payouts, payroll, FX, accounting export.
→ *Revenue:* FX spread (the real money) + seat-based SaaS. → **Track:** Tempo, Solana. Phantom CASH + Reflect.

**A6. Crypto-native subscription billing**
Recurring payments are genuinely unsolved onchain — there are no pull payments. Solana's subscriptions/
allowances primitives plus payment channels make it possible now.
→ *Revenue:* % of recurring volume. → **Track:** Solana, Tempo. Every onchain SaaS needs this.

**A7. Merchant checkout for fee-crushed verticals**
2.9% card fees destroy margins in ticketing, freelance marketplaces, gaming top-ups, and cross-border B2B.
Instant stablecoin settlement at 0.5%.
→ *Revenue:* take rate. → **Track:** Tempo (this is literally Tempo's thesis), Base.

**A8. Corridor-specific remittance with email-login wallets**
Pick one corridor (US→Philippines, US→Mexico) and win it on UX. Phantom Connect means no seed phrases.
→ *Revenue:* FX spread. → **Track:** Solana, Tempo. Crowded, but the TAM justifies it and execution wins.

**A9. Onchain invoice factoring**
SMBs wait 60–90 days for receivables. Tokenize the invoice, let stablecoin LPs finance it, repay on
collection. A ~$3T global market with genuinely bad software.
→ *Revenue:* origination fee + rate spread. → **Track:** Base, Arbitrum.

**A10. Parametric stablecoin depeg insurance**
Treasuries holding eight figures of stablecoins have no clean hedge. Parametric cover, oracle-triggered.
→ *Revenue:* premium spread. → **Track:** Solana, Hyperliquid (hedge via perps).

### Privacy as an enterprise unlock
*The most underrated category here: Zcash and Arcium both have tracks, and privacy is the actual blocker
to enterprise adoption. Almost nobody will build this well.*

**A11. Confidential payroll**
No company will put its salary table on a public ledger. Token-2022 confidential balances (or Arcium) hide
amounts while keeping auditor-accessible viewing keys.
→ *Why now:* confidential balances are production-ready; this is the reason enterprises say no.
→ *Revenue:* per-employee-per-month SaaS. → **Track:** Solana, Zcash.

**A12. Shielded treasury with selective disclosure**
Funds and DAOs need positions private from competitors but provable to auditors and LPs. Viewing keys give
you both. → *Revenue:* SaaS + AUM bps. → **Track:** Zcash, Solana.

**A13. Private DeFi strategy vaults**
Any public onchain strategy gets copied and front-run within days, which is why serious capital stays off.
Encrypted execution via MPC fixes the leak. → *Revenue:* management + performance fees. → **Track:** Solana (Arcium).

**A14. Confidential onchain cap tables**
Startups want tokenized equity and vesting, but not a public list of who owns what. Carta, but private and
programmable. → *Revenue:* SaaS per company. → **Track:** Solana, Zcash.

### Tokenization & markets

**A15. Compliance layer for permissioned tokens**
Every RWA issuer needs KYC gating, jurisdiction rules, transfer restrictions, and lockups. Token ACL makes
this enforceable at the token level.
→ *Why now:* Robinhood Chain existing at all signals tokenized equities are arriving.
→ *Revenue:* SaaS per issuer + bps on assets. → **Track:** Robinhood Chain, Solana, Base.

**A16. Liquidity-as-a-service for Hyperliquid markets**
Apps launching markets on Hypercore need market making. Sell vault-based LaaS with builder codes.
→ *Revenue:* performance fee + builder-code revenue share. → **Track:** Hyperliquid.

**A17. Tokenized private credit marketplace**
Match stablecoin yield-seekers with real-world private credit, with underwriting and servicing built in.
→ *Revenue:* origination + servicing fees. → **Track:** Base, Arbitrum.

**A18. Stablecoin-specialized intent router**
Generic bridges optimize for everything; nothing optimizes specifically for stablecoin movement across
Tempo/Solana/Base/Arbitrum on cost and finality.
→ *Revenue:* routing fee. → **Track:** stacks across many (see §B.0).

### Operations & governance

**A19. Institutional validator & key operations**
Staking operators manage validator keys, upgrade authorities, and reporting on spreadsheets. Squads
multisig plus real ops software, slashing protection, and LP reporting.
→ *Revenue:* SaaS + bps on stake. → **Track:** Solana.

**A20. Decision markets for company metrics (futarchy, productized)**
MetaDAO's mechanism aimed at ordinary companies forecasting internal metrics — launch dates, churn,
hiring. Internal prediction markets, minus the crypto exposure.
→ *Revenue:* SaaS. → **Track:** Solana. Higher-variance, genuinely novel, scores well on *Insight*.

---

# Part B — 20 ideas to maximize expected prize cash

## B.0 The model first — ideas without the math are useless

Three structural facts drive everything:

**1. Track slots are wildly unevenly priced.**

| Track | Pool | Slots | Per project | My *estimated* field | Est. hit rate |
|---|---|---|---|---|---|
| **Zcash** | $100k | 10 | **$10,000** | ~30–80 | **~15–30%** |
| **Tempo** | $100k | 10 | **$10,000** | ~60–150 | **~8–15%** |
| **Hyperliquid** | $100k | 10 | **$10,000** | ~100–250 | ~5–10% |
| Robinhood Chain | $25k | 5 | $5,000 | ~40–100 | ~6–12% |
| Arbitrum | $25k | 5 | $5,000 | ~150–300 | ~2–3% |
| Base | $25k | 5 | $5,000 | ~400–700 | ~<1% |
| Ethereum L1 | $25k | 5 | $5,000 | ~400–700 | ~<1% |
| **Solana** | $100k | 10 | $10,000 | ~1,000–1,500 | **~<1%** |

> ⚠️ Field sizes are **my estimates**, not published data. Colosseum publishes total submissions
> (2,858 in Spring 2026) but not per-track counts. The *ranking* is what matters and is robust: Zcash
> and Tempo are new, tooling-poor, and outside most builders' comfort zone, while Solana is Colosseum's
> home ecosystem and will absorb the bulk of the field. Sanity-check this in Discord in week 1 —
> if 400 people announce Zcash projects, re-plan.

**The headline:** a Zcash slot and a Solana slot both pay $10,000. One is plausibly 20× easier to win.
Building on Solana for the Solana track is the single most common −EV decision available this hackathon.

**2. Multi-track stacking is the biggest unconfirmed lever.**
The rules describe each track independently and never prohibit one submission from winning several.
If stacking is allowed, a genuinely multi-chain product could draw Zcash + Tempo + Hyperliquid + Solana =
**$40,000** in track prizes alone, on top of any overall award. **Confirm this in Discord on day one** —
it is worth more than any single idea below, and it makes cross-chain architectures dominant if true.

**3. Two prizes have almost no competition.**
- **Public Good Prize ($5k):** open-source infrastructure with no business model. Most teams are pitching
  startups, so the qualifying pool is small.
- **University Prize ($5k):** you just have to qualify. If any of you is currently enrolled — a
  `uwaterloo.ca` address suggests this may apply — this is close to free money and you should confirm the
  eligibility definition with `hackathon@colosseum.com` early (see `hackathon.md` §16).

**4. Criterion (e) scores open-source directly.** Rules §8(e): *"Is this Project Submission open-source?
How well does the Project Submission compose with other primitives?"* Public repo, permissive license,
and composing with sponsor protocols is free score. Do it regardless of idea.

**The EV-max archetype:** a *well-executed, obviously-working, open-source developer tool or reference
implementation on a thin chain*, demoed flawlessly. Sponsor judges evaluate their own tracks, and what a
new chain's team most wants is proof their chain is usable plus tooling that pulls in more builders. That
is a far easier bar than beating 1,200 Solana consumer apps.

---

## Zcash track — thinnest field, $10k/slot
*Few crypto devs have touched Zcash tooling. Competent + working beats ambitious + broken here.*

**B1. Zcash checkout SDK — "Stripe for shielded payments."** Drop-in merchant button, payment-request URIs,
webhook on confirmation, viewing-key receipts for accounting. The single most obviously missing thing.
*Also strong for Public Good.*

**B2. Shielded donation platform for NGOs and journalists.** Private giving for donors in hostile
jurisdictions, with optional disclosure for tax receipts. **Hits Zcash + Public Good at once** — a real
story, not a contrived one.

**B3. Proof-of-solvency with selective disclosure.** Prove reserves ≥ liabilities, or that a wallet is
above a threshold, without revealing balances or counterparties. Viewing keys + attestations.

**B4. Zcash ↔ Solana private settlement path.** Move value between transparent and shielded rails with
a sane UX. Naturally **stacks Zcash + Solana tracks** if stacking is permitted.

**B5. Shielded payroll for distributed teams.** Pay contractors across borders without publishing the
salary table. Small scope, clean demo, self-evidently useful.

**B6. Zcash developer tooling: local devnet, test harness, TypeScript client.** Explicitly boring and
explicitly high-EV — the Zcash team's actual bottleneck is developer onboarding, and the judges are the
people who feel that pain. **Strong Public Good candidate.**

## Tempo track — new chain, payments thesis, $10k/slot
*Tempo's team wants proof their chain does payments well. Build the thing they'd demo on stage.*

**B7. Merchant payments reference app + SDK on Tempo.** Full loop: checkout, refunds, settlement,
reconciliation export. The canonical "here's how you accept payments on Tempo."

**B8. Payroll and contractor payouts on Tempo.** Batch payouts, scheduling, CSV import, receipts.
High utility, low technical risk, demos in 60 seconds.

**B9. Subscription and metered billing on Tempo.** Recurring charges with allowances. Solves a real
unsolved primitive and directly serves the chain's positioning.

**B10. Tempo block explorer / analytics for payment flows.** New chains lack observability. Payment-
specific views: merchant volume, settlement latency, failure rates. **Public Good candidate.**

**B11. Fiat on/off-ramp orchestration into Tempo.** Coinbase Onramp in, stablecoin out, with a clean
merchant dashboard. Unglamorous, immediately useful.

## Hyperliquid track — $10k/slot
*Sophisticated user base; tooling gaps are real and the demos are inherently exciting.*

**B12. Hypercore ↔ HyperEVM composability kit.** Reference contracts + SDK for EVM apps reading and
trading against the native order book. The integration everyone needs and few will write well.

**B13. Strategy vault framework with builder codes.** Let anyone launch a vault, with transparent
performance and fee splits.

**B14. Portfolio risk dashboard.** Cross-margin exposure, liquidation distance, scenario stress tests.
Visually impressive in a 3-minute demo, which matters more than it should.

**B15. Copy-trading / social trading layer.** Follow a trader with position sizing and risk caps. Strong
demo, clear user pull.

## Robinhood Chain — $5k/slot but a likely-thin field
**B16. Tokenized-equity compliance and transfer-restriction toolkit.** Precisely the problem this chain
exists to have. Low competition because few builders will bother to deploy there at all.

## Cross-cutting / multi-track stacking plays
*Only pursue if stacking is confirmed — but if it is, these dominate everything else on this page.*

**B17. Universal stablecoin payment router.** One SDK, one API, settles across Tempo + Solana + Base +
Arbitrum, routing on cost and finality. Plausibly qualifies for **four tracks**. Open-source the SDK for
criterion (e) and the Public Good prize.

**B18. Cross-chain agent payment layer (x402 everywhere).** Implement x402 across Solana, Base, and Tempo
with one interface, plus a shielded Zcash settlement mode. **Stacks up to four tracks**, and rides the
single hottest sponsor theme in the resources page.

**B19. Multi-chain payment-link generator ("Blinks for every chain").** Create a payable link on any
supported chain; recipient picks the rail. Genuinely broad track surface, and it demos in 20 seconds,
which is disproportionately valuable when a judge is on submission #300.

## Pure Public Good play — $5k, low competition, high certainty
**B20. Open-source cross-chain integration test harness.** One framework for writing tests against
Solana (LiteSVM/Surfpool), HyperEVM, Tempo, and Base, with fixtures and CI templates. No business model,
obviously useful, maximal criterion-(e) score, and near-zero competition for the Public Good award.
Pair it with any track-specific build above.

---

# Part C — where the two lists overlap

The best single move is an idea that is *both* a real company *and* sits on a thin track, because it
collects track cash, competes for the $300k standout pool, and still earns the accelerator interview.

**Top three overlaps:**

| # | Idea | Why it wins twice |
|---|---|---|
| 1 | **Confidential payroll** (A11 / B5) | Real enterprise SaaS with obvious revenue, *and* it lands on Zcash — the thinnest track. Privacy is the actual blocker to enterprise adoption, which is a genuine *Insight* score, not a pitch-deck claim. |
| 2 | **Stablecoin treasury / payments OS on Tempo** (A5, A7 / B7–B9) | Enormous real TAM, sponsor thesis alignment as direct as it gets, and a thin track. Tempo's judges want exactly this to exist. |
| 3 | **Agent spend controls + x402 rails** (A1, A2 / B18) | The strongest "why now" available, picks-and-shovels economics, and multi-track surface if stacking is allowed. |

**Recommended plan regardless of which you pick:**
1. **Day 1 (Discord):** confirm multi-track stacking, University Award eligibility, and max team size.
   These three answers can swing the plan by tens of thousands of dollars.
2. **Pick one thin track as primary** (Zcash or Tempo), then add a second chain only if stacking is confirmed.
3. **Open-source from commit one**, permissive license, public repo dated inside the window.
4. **Compose with sponsor protocols** — Phantom Connect for onboarding, CASH for settlement, Squads for
   treasury. Free points on criterion (e), and sponsor judges notice their own stack.
5. **Budget the last 5 days entirely for the two videos and the GTM writeup.** They are judged, they are
   the first thing reviewed, and they are where most technically strong teams lose.
6. **Post the weekly update videos.** Optional, explicitly recommended, and nearly free differentiation.
