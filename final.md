# Round 2 — Twenty More Ideas, Then the Decision

> Supersedes the recommendation in [`shortlist.md`](./shortlist.md). Same constraints: solo builder,
> multi-track stacking assumed allowed, `.edu` in hand (eligibility unconfirmed), based in SF.

---

## 0. Thinking deeper — five things the earlier rounds under-weighted

**1. Grand prizes go to primitives, not apps.**
Look at who has actually won: Ore (a mineable token — a new onchain mechanism), TAPEDRIVE (onchain
storage), Reflect (stablecoin infrastructure), Unruggable, Crowdbrain. Colosseum's judges consistently
reward *new primitives that expand what the chain can do*, not polished consumer apps. A solo builder can
ship a primitive — Ore was essentially one person and very little code. Highest variance, highest ceiling.

**2. EVM is a stacking multiplier.**
One Solidity codebase deploys unchanged to **Ethereum L1, Base, Arbitrum, Robinhood Chain** (an Arbitrum
Orbit chain), **HyperEVM**, and — if Tempo is EVM-compatible as its published design indicates; confirm at
the Sep 16 workshop — **Tempo**. Six tracks, ~$40k of surface, from one deploy script. Per-slot odds on
Ethereum L1 / Base / Arbitrum are poor (5 slots each, hundreds of EVM projects), but the marginal cost is a
chain ID. Free lottery tickets. Real integration *depth* should go where it can't be copied: Solana and Zcash.

**3. Read the judge list as a scoring rubric.**
Two judges from **Arcium** (confidential compute), one each from **Ellipsis** (order books), **Drift**
(perps), **Anza** (Solana core), **Phantom** (wallets), **MetaDAO** (governance), **Base** ventures, and
two from **Ethlabs** (Ethereum ecosystem). Privacy is over-represented on that panel relative to its share
of submissions. Anything confidential-by-design gets read by sympathetic eyes on the Solana track — and
privacy is simultaneously the entire Zcash track and a headline Ethereum Foundation theme in 2026.

**4. Correction: "x402 everywhere" is not novel. Coinbase already ships it.**
The earlier #1 leaned on multi-chain x402 as its differentiator. That's wrong — x402's facilitator model
is already multi-chain (Base, Solana, and others), so "an x402 SDK for more chains" would be judged as a
wrapper and lose on *Novelty* (rules §8c). The genuinely unserved part is **confidentiality plus spend
bounds** for agent payments. Privacy is what the thinnest track rewards and what the over-represented
judges care about. The recommendation in §2 re-centers on that.

**5. Privacy has an optics problem, and there's a clean fix.**
Base and Tempo judges come from Coinbase- and Stripe-culture companies. "Anonymous bot payments" will make
them flinch. Frame everything as **confidential, not anonymous**: private from the public, fully visible
to the owner, scoped to auditors via viewing keys — exactly how a business bank account works. Zcash
viewing keys and Solana Token-2022 auditor keys give you this natively, and it's the framing the Zcash
community itself now uses. It turns the objection into the pitch.

---

## 1. Twenty more ideas

Numbered C1–C20 to continue from `ideas.md` (A/B) and `shortlist.md`. None repeat earlier entries.

### Novel primitives — the grand-prize archetype

**C1. Agent Miles — a proof-of-payment loyalty primitive.**
Every x402 payment mints points to both payer and payee, like card rewards for the agent economy. A
mechanism, not an app: fair-launch, protocol-level, composable with any x402 service. Ore-style viral
potential; almost no code.
→ *Stacks:* Solana, Base, Tempo. → *Solo risk:* low to build, high variance on outcome. → Best as a
viral hook layered on a payments product, not as the whole submission.

**C2. Burner agent wallets — ephemeral, budget-capped, unlinkable.**
Mint a wallet per task with a hard budget, fund it via a shielded route, auto-sweep the remainder, no
linkability between tasks. Solves spend risk and traceability in one primitive.
→ *Stacks:* Zcash, Solana, Base, Tempo. → *Solo risk:* medium (the shielded funding leg). Composes
directly with the final recommendation.

**C3. Per-token inference billing over payment channels.**
Open a channel, stream sub-cent payments per LLM output token, close on completion. Pay-as-you-generate
for AI, using Solana's payment-channel primitives. A real primitive for the agent economy nobody has
shipped cleanly.
→ *Stacks:* Solana, Tempo. → *Solo risk:* medium. Demo is mesmerizing — a counter ticking with the tokens.

### Confidential by design — reading the judge list

**C4. Private DAO voting with confidential compute.**
Votes encrypted via Arcium, tallied without revealing individual ballots. Kills vote-buying and whale
signaling. Two Arcium judges and a MetaDAO judge on the panel.
→ *Stacks:* Solana. → *Solo risk:* medium; Arcium's SDK is usable solo. Narrow track surface, strong fit.

**C5. Viewing-key-as-a-service.**
Scoped auditor access across Zcash shielded activity and Solana confidential balances: an accountant sees
totals, a regulator sees one counterparty, the public sees nothing. The compliance layer that makes
privacy adoptable by companies.
→ *Stacks:* Zcash, Solana. → *Solo risk:* medium. Public Good candidate. Boring demo, serious business.

**C6. Zcash as the confidentiality rail for stablecoins.**
Move USDC from Solana/Base/Tempo through the shielded pool and out to a fresh address on any chain, with
viewing keys for the owner. Framed as confidential settlement, not mixing.
→ *Stacks:* Zcash, Solana, Base, Tempo. → *Solo risk:* medium-high (bridging legs). The optics risk in
§0.5 applies most strongly here — the viewing-key framing is mandatory.

**C7. A private stablecoin as a Zcash Shielded Asset — conditional.**
Bridge a dollar stablecoin into the shielded pool as a ZSA. It's the Zcash community's most-wanted
product. **Only viable if ZSAs are live on the network you can demo on — verify before touching it.**
→ *Stacks:* Zcash (+ the source chain). → *Solo risk:* high, dependency-bound.

**C8. A hidden-information onchain game.**
Poker or battleship with encrypted state via Arcium and session keys via MagicBlock, so moves are fast and
secret. The resources page leans heavily into games.
→ *Stacks:* Solana. → *Solo risk:* low-medium. Delightful demo, thin startup story.

### Tokenized equities and perps — the two thinnest EVM fields

**C9. HIP-3 perp launch wizard with tokenized-equity oracles.**
Launch a perp market on anything in sixty seconds, with price feeds sourced from Robinhood Chain
tokenized stocks. Hyperliquid's permissionless-market feature plus the one chain built for equities.
→ *Stacks:* Hyperliquid, Robinhood Chain. → *Solo risk:* medium; mainnet HIP-3 needs a large HYPE stake,
so demo on testnet and say so.

**C10. Stock-collateralized stablecoin loans, auto-hedged on Hyperliquid.**
Borrow against tokenized AAPL; the protocol hedges the collateral with a perp so liquidation risk drops.
A real product with a real spread.
→ *Stacks:* Robinhood Chain, Hyperliquid, Arbitrum. → *Solo risk:* medium-high; keep the lending logic
minimal.

**C11. Get paid in stock.**
Payroll that splits a salary into stablecoin plus tokenized equities, dollar-cost-averaged every pay
period. Simple, visual, and it puts Robinhood Chain's whole reason for existing into a 30-second demo.
→ *Stacks:* Tempo, Robinhood Chain, Solana. → *Solo risk:* low. Regulatory story is hand-wavy — say so.

### Payments infrastructure — Tempo's thesis

**C12. Memo-native B2B invoicing and reconciliation.**
Structured remittance data (invoice number, PO, tax lines) in the payment memo itself, auto-reconciled,
exported to QuickBooks. Tempo's memo design exists precisely for this.
→ *Stacks:* Tempo, plus Base/Arbitrum with calldata memos. → *Solo risk:* low. Real SMB pain, dull demo.

**C13. A cross-chain pull-payment (direct debit) standard.**
Onchain recurring payments genuinely don't exist. Define one interface over EIP-7702 delegations on EVM
and allowances on Solana; ship the SDK.
→ *Stacks:* Ethereum L1, Base, Arbitrum, Tempo, Solana. → *Solo risk:* medium. Public Good candidate.

**C14. Signed cross-chain receipts — a standard plus an explorer.**
Every payment emits a signed, memo-linked receipt in one format across all eight chains; an explorer and
an accounting export sit on top. "The receipt is the API."
→ *Stacks:* everything, cheaply. → *Solo risk:* low. Low ceiling alone; excellent as a module.

### Agent-economy plumbing

**C15. EIP-7702 smart sessions for agents.**
Scoped session keys — spend caps, allowlists, expiry — as a 7702 delegate, so any EOA becomes a bounded
agent wallet. One contract deploys to every EVM track.
→ *Stacks:* Ethereum L1, Base, Arbitrum, Robinhood Chain, HyperEVM, Tempo. → *Solo risk:* low-medium.
The Ethereum Foundation's own favorite primitive. Public Good candidate.

**C16. Pre-flight transaction risk API for agents.**
Simulate and score any transaction before an agent signs it — drains, malicious approvals, honeypots —
across Solana and every EVM chain. Agents are the softest targets in crypto right now.
→ *Stacks:* nearly all, cheaply. → *Solo risk:* medium. Public Good candidate. High utility, moderate novelty.

**C17. An agent credit bureau.**
Underwrite agent wallets from their payment history and issue small credit lines. Novel, business-shaped,
and it's the natural next layer once agents have payment histories.
→ *Stacks:* Solana, Base, Tempo. → *Solo risk:* medium; demo on synthetic history.

**C18. Paid-API discovery and reputation registry.**
The package registry for x402 services: find APIs, see uptime and price, read reviews, pay in one call.
Composes with Metaplex's agent registry.
→ *Stacks:* Solana, Base, Tempo. → *Solo risk:* low-medium. The app layer that makes a payments rail sticky.

**C19. Squads for agents.**
A multi-agent treasury: agents propose spends, a human or a quorum approves, everything logged. Built on
Squads (a sponsor), aimed at teams running many agents.
→ *Stacks:* Solana, Base, Tempo. → *Solo risk:* medium. Direct sponsor composability.

### Public good / onboarding

**C20. A browser Playground for the thin chains.**
Solana Playground, but for Zcash, Tempo, and HyperEVM: in-browser IDE, one-click testnet deploy, guided
first transaction. New chains' real bottleneck is developer onboarding, and the judges are the people who
feel that pain.
→ *Stacks:* Zcash, Tempo, Hyperliquid + Public Good. → *Solo risk:* medium (three toolchains). Highest
floor of anything in this round; near-zero accelerator ceiling.

---

## 2. Final recommendation

### Build: a confidential, budgeted payment rail for AI agents

**Thesis, in one line:** every agent payment today leaks what was bought, from whom, for how much, and
how often — and nothing bounds what an agent can spend. Make agent payments **confidential by default,
bounded by policy, and auditable on demand.**

**Why this and not the earlier #1:** the x402 breadth was never the differentiator (§0.4). Privacy is —
it's the thinnest track's entire reason to exist, it's what the over-represented judges reward, it's
unserved, and it's the thing Coinbase's own tooling will not build. Bounded spending is the second
unserved half. Together they're a product; either alone is a feature.

**What it is, concretely:**
- **Speaks x402.** Drop-in client and server middleware, plus an MCP server so any agent uses it in one
  line. You're compatible with the ecosystem on day one; you don't compete with it.
- **Three settlement backends, each a first-class integration:**
  - **Solana** — Token-2022 confidential transfers with an auditor key. Amounts hidden, auditor can
    decrypt. (Verify the ZK ElGamal proof program's current mainnet status; devnet is fine for the demo.)
  - **Zcash** — shielded payments where the x402 payment ID rides in the encrypted memo, and the server
    detects settlement through its own viewing key. Clean design: Zcash's memo field was practically made
    for this.
  - **Tempo** — the standard flow using stablecoin-denominated fees and Tempo's payment memos; add
    Base with the same EVM code.
- **Spend policy:** per-agent budgets, allowlists, expiry. On EVM, an EIP-7702 delegate (C15); on Solana,
  session keys via Swig. One policy contract deploys to every EVM track for free (§0.2).
- **Selective disclosure:** owner dashboard sees everything; an auditor with a viewing key sees a scoped
  slice; the public sees nothing. This is the compliance answer, and it's the pitch (§0.5).
- **Open source, permissive license, public repo from commit one** — criterion (e) and the Public Good award.

**Prize surface:**

| Track | Why that judge awards it | Value |
|---|---|---|
| **Zcash** | The most novel shielded use case in their track, built the way their community advocates (viewing keys). | $10,000 |
| **Solana** | Real Token-2022 confidential-transfer integration; two Arcium judges read privacy sympathetically. | $10,000 |
| **Tempo** | Agent payments are Tempo's stated target market; memos and stablecoin fees used natively. | $10,000 |
| **Base** | x402 is Coinbase's standard; you extend it rather than fork it. | $5,000 |
| Ethereum L1 / Arbitrum / Robinhood / HyperEVM | Same policy contract, free deploys. Low odds, zero cost. | up to $25,000 |
| **Public Good** | Open-source rail and MCP server. | $5,000 |
| **University** | If CCSF part-time qualifies — confirm this week. | $5,000 |

**$40k is the ceiling if every stacked track hits — not the expectation.** Honest calibration, if executed
well: roughly a coin flip to win *at least one* prize, expected cash **~$6–8k**, grand prize under 1%. See §3.

**The demo, in three minutes:**
1. *0:00–0:30 — the problem, made visceral.* Pull up a public agent's wallet and, live, reconstruct its
   entire business: which APIs it buys, how often, at what price. Thirty seconds of a competitor's
   dashboard writing itself.
2. *0:30–1:30 — the same agent on your rail.* Observer view: nothing. Owner view: everything. Auditor
   view with a viewing key: just the scoped slice. Then an agent overspends and the policy stops it.
3. *1:30–2:30 — chain montage.* Solana confidential, Zcash shielded, Tempo, Base — thirty seconds each,
   chain named on screen, real transaction links.
4. *2:30–3:00 — one-line MCP install.* An agent pays for something, privately, from a fresh session.

**Business model, stated plainly in the pitch:** basis points on settled volume, plus enterprise seats
for the audit and policy dashboard. Agent payments are a category venture funds are actively chasing;
the confidentiality layer is the defensible slice.

**Founder-market fit, solo-proof:** "I build agents. I needed this. Nobody would ship it, so I did."

### Scope for one person in 23 build days

*Must ship:* x402 client + middleware · Solana confidential transfers · Zcash shielded with memo IDs ·
one EVM chain (Base or Tempo) · a simple budget policy · MCP server · the demo app · the two videos.
*Ship if time:* the 7702 policy contract on all EVM chains · Tempo-specific memo/fee features · the
auditor dashboard beyond a CLI.
*Cut without guilt:* burner wallets (C2), Agent Miles (C1), any UI polish beyond the demo path.

### De-risk in this order — the first three days decide everything

1. **Zcash shielded send + memo detection via viewing key, on testnet.** The differentiator and the only
   real technical risk. If it works in three days, the plan holds. If it doesn't, drop Zcash and you still
   have a confidential-agent-payments product on Solana + EVM worth ~$25–30k of surface.
2. **Solana Token-2022 confidential transfer end to end on devnet.**
3. **Attend the Tempo workshop on Sep 16** and ask two questions: EVM compatibility, and what the judges
   most want to see built. Decide Tempo vs. Base as the third backend that afternoon.
4. **Email `hackathon@colosseum.com`** about community-college eligibility for the University Award.

### The honest risks

- **Zcash tooling is unfamiliar and light-client sync can be slow.** Budget real time; use testnet.
- **The ZK ElGamal proof program on Solana has been toggled before.** Check status; demo on devnet regardless.
- **"Private bot payments" can read badly** to Coinbase- and Stripe-culture judges. Lead every sentence with
  *confidential*, *bounded*, *auditable* — never *anonymous*. Show the auditor view before the private view.
- **Scope creep is the solo killer.** The must-ship list above is the product. Everything else is v2.

### Fallback

If Zcash fails the three-day spike *and* Token-2022 confidential transfers fight you, pivot to **C15 +
C16**: bounded agent wallets with pre-flight risk scoring, one EVM codebase on six tracks plus Solana.
Lower ceiling, very high floor, and it reuses everything you'd already built.

---

## 3. Calibration — is this as good as it gets?

**No.** It's the best *risk-adjusted* bet constructible from public information, not a lock. Estimates,
conditional on good execution (3+ chains working, strong demo, clean repo):

| Outcome | Estimate |
|---|---|
| Zcash track ($10k) | 15–35% |
| Tempo track ($10k) | 10–25% |
| Solana track ($10k) | 2–5% |
| Public Good ($5k) | 10–20% |
| University ($5k) | unknown until eligibility is confirmed |
| **At least one prize** | **~50–60%** |
| $15k standout / grand prize | ~2% / <1% |
| **Expected cash** | **~$6–8k** (unconditional, after solo execution risk: ~$4–5k) |
| Accelerator | low single digits, solo |

**Least certain points:**
1. **Demand is anticipatory.** Nobody is losing money today because their agent's payments are public. A
   judge can fairly ask "who asked for this?" and Traction will be zero.
2. **Stacking dilutes depth — and stacking is an unverified assumption.** Each track's judges compare you
   to projects that are all-in on their chain. If stacking is disallowed, collapse to one hero chain
   (Zcash); a Zcash-only product may carry a higher single-track probability (~30–45%) than the stack.
3. **The sponsors' own judges for Zcash, Tempo, and Hyperliquid are not on the published panel.** I don't
   know who scores those tracks or what they prefer.
4. **Grand prizes go to things people used during the window.** Infra for agents will have ~zero real
   users by Oct 12.

**Highest-leverage improvements, more than any idea swap:**
- **Validate demand in week 1, in person.** Ten conversations with people shipping agents in SF; quotes in
  the pitch video. Directly repairs *Insight* and *Founder + Market Fit*, the two criteria where solo
  submissions bleed.
- **Ship the MCP server by week 2 and get real usage** from the x402 and MCP communities. Fifty real
  transactions from strangers is traction almost no solo dev tool brings.

**Alternatives by risk profile:** higher ceiling → a mechanism primitive (C1-style; ~5% at something big,
~80% at nothing). Higher floor → C20 or C15+C16 (likelier to win *something*, near-zero accelerator
ceiling). The recommendation sits between them on purpose.
