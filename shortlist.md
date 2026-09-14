# Winning Shortlist — solo, stacking allowed, .edu in hand, based in SF

> **Superseded:** the final recommendation now lives in [`final.md`](./final.md), which corrects the
> #1 below (multi-chain x402 alone isn't novel — the confidentiality layer is). The ranking logic here still holds.

> Supersedes the ranking in [`ideas.md`](./ideas.md) under three new constraints:
> **(1)** multi-track stacking is assumed allowed, **(2)** University Award is in play via a `.edu`,
> **(3)** solo builder. These three together change the optimal play more than any single idea does.

---

## 0. What the constraints actually do to the math

### Stacking = yes → the prize structure inverts

One submission can win multiple tracks. The board is now:

| Tracks stacked | Track cash |
|---|---|
| Solana + Tempo + Zcash + Hyperliquid (the four $100k pools) | **$40,000** |
| + Base + Arbitrum + Ethereum L1 + Robinhood Chain | **+$20,000** |
| + Public Good | +$5,000 |
| + University | +$5,000 |

**The critical reframe:** you no longer need to win the grand prize. A product that credibly lands on
four thin tracks plus the two low-competition awards is worth **~$50,000** without ever beating 2,800
teams for the $30k top slot. As a solo builder, that path has *both* higher expected value *and* higher
probability than chasing the grand prize. Optimize for stacking, not for winning.

**But stacking only pays if each track's judge sees a real integration.** A shallow multi-chain wrapper
gets zero from all four — each track is judged by that ecosystem's own people, who can tell instantly
whether you actually used their chain or just imported an RPC URL. See §2 for how to make it count.

### Solo → the archetype narrows hard

Solo changes what you can win with, in three ways:

1. **Scope:** ~23 build days after reserving the last 5 for videos and GTM. One core system, three or
   four thin-but-real chain adapters, one killer demo. Not a two-sided marketplace.
2. **Judging exposure:** *Founder + Market Fit* and *Founder Communication* are scored, and solo teams
   usually score badly on the first. **The fix is idea selection, not spin** — if you build developer
   tooling, you *are* the user, and founder-market fit is true by construction. A solo dev building the
   SDK they personally needed is the single most defensible solo pitch available.
3. **Avoid:** anything needing BD, enterprise sales proof, regulatory lift, liquidity bootstrapping, or
   two-sided adoption to demo well.

### `.edu` → confirm before you count on it

`clai74@mail.ccsf.edu` is real enrollment, but CCSF is a **community college** and the award is named the
**University** Prize. Part-time status may also matter. The criteria are published nowhere.
**Email `hackathon@colosseum.com` this week** and ask plainly whether a part-time community college
student qualifies. It's $5,000 and one email. Don't build around it until they answer — but if the answer
is yes, it is the cheapest $5k on the board.

### Based in SF → a genuine, under-used edge

Colosseum's office is in San Francisco. They host in-person builder events (colosseum.com/events), and
the accelerator is 12 weeks on-site in SF. Practically every one of your ~2,800 competitors is remote.

- **Show up in person.** Judges who have met you read your submission differently. This is not a trick;
  it's the oldest advantage in venture.
- **Zero relocation friction** for the accelerator. Say so explicitly in the submission — "I'm in SF and
  can start on day one" removes the single biggest logistical objection to admitting a solo founder.
- The **Sep 16 Tempo workshop** and **Sep 22 Ethereum Foundation workshop** are two days and eight days
  out. If you go anywhere near those tracks, attend live and ask a question — the people answering are
  the people scoring your track.

---

## 1. The ranked shortlist

### 🥇 #1 — x402 Everywhere: a universal agent-payment layer, with a shielded mode

**What it is.** One SDK plus server middleware implementing x402 (the HTTP 402 "Payment Required" flow for
autonomous agents) across **Solana, Base, and Tempo** — plus an MCP server so any AI agent can pay for
anything — and a **shielded settlement mode on Zcash** for agents that shouldn't broadcast what they buy.

**The insight that makes it more than a wrapper.** Agent payments leak business intelligence. If your
trading agent's data purchases are public, everyone knows what signal you're buying and when. Private
agent payments are a real, unserved demand — and nobody is building them, because the x402 crowd and the
privacy crowd don't overlap. That intersection is your *Insight* score, and it's true rather than pitched.

**The demo (3 minutes).** An agent hits a paywalled API → gets a 402 → pays autonomously → receives data.
Then the same flow settling on four different chains, one of them fully shielded. Close on a merchant
receipt dashboard. It is legible in fifteen seconds to a judge on submission #300.

**Why each track awards a slot:**
| Track | The judge's reason | Value |
|---|---|---|
| **Base** | x402 is Coinbase's own standard; Base is Coinbase's chain. An implementation that spreads it is exactly what they fund. | $5,000 |
| **Solana** | Agentic payments and x402 are already in their docs and their skills push. | $10,000 |
| **Tempo** | A payments chain whose thesis is machine-speed money; agent payments are the future of payments. | $10,000 |
| **Zcash** | A use of shielded tech that isn't "private money" but real product demand. The most novel thing in their track. | $10,000 |
| **Public Good** | Open-source SDK and MCP server, permissive license. | $5,000 |
| | **Stacked total** | **~$40,000** |

**Solo risk:** medium. Core middleware is straightforward; the Zcash shielded path is the hard part and
the whole differentiator — **spike it in the first three days**. If shielded settlement proves infeasible
solo, you still have a three-chain x402 SDK worth ~$25k and you lost nothing but the Zcash adapter.

**Founder-market fit answer:** "I built the payment layer I needed to ship agents." Unimpeachable, solo.

---

### 🥈 #2 — One link, any chain: universal payment links

**What it is.** Generate a payment link; the recipient pays on whatever chain they already hold funds on.
Solana Blinks/Actions natively, plus Base, Tempo, Arbitrum, and **Robinhood Chain** (thin, cheap to add,
almost nobody will bother deploying there).

**Why it ranks high despite being less novel.** It has the **broadest track surface of anything here**
(five to six tracks, ~$35–40k) and the **fastest demo on the board** — twenty seconds, no setup, instantly
understood. Under-rate neither. It's also the lowest technical risk for a solo builder.

**Weakness, stated honestly:** payment links exist. You will score lower on *Novelty* (rules §8c) and it's
a thinner startup story, so the $300k standout pool and the accelerator are less likely. This is a
prize-collection play, not a company play.

**When to pick this over #1:** if the Zcash spike fails, or if you want the highest-floor option.

---

### 🥉 #3 — Confidential payroll and contractor payouts

**What it is.** Pay a distributed team without publishing the salary table. Token-2022 confidential
balances on Solana, shielded rails on Zcash, viewing keys so an accountant or auditor can still verify.

**Why it's here.** This is the **best real company** on the list and the strongest accelerator pitch — a
true enterprise blocker with obvious SaaS revenue. Privacy is genuinely why enterprises say no to onchain
payroll, and that's an *Insight* that survives scrutiny.

**Tracks:** Solana ($10k) + Zcash ($10k) = ~$20k. Half of #1's stacking surface — that's the trade.

**Solo risk:** low-medium. Small scope, clean demo.
**Weakness:** payroll demos are boring to watch, and you'd be pitching an enterprise product with no
enterprise customers, solo. Great company, harder hackathon.

---

### #4 — Agent buys its own data, then trades on Hyperliquid

**What it is.** #1 extended: an autonomous agent that purchases market data via x402 micropayments and
executes on Hypercore/HyperEVM. Adds the fourth $100k track.

**Why it's tempting:** completes the four-thin-track stack (**~$45–50k**) and the demo is genuinely
exciting — an agent earning and spending in a loop.
**Why it's #4:** trading logic plus x402 plus four chains is a lot for one person in 23 days, and a
trading agent that loses money on camera is a bad demo. **Treat Hyperliquid as a stretch adapter on #1,
not as the core.** Add it in week 3 only if the core is already solid.

---

### #5 — Cross-chain integration test harness (the floor play)

**What it is.** One open-source framework for testing against Solana (LiteSVM/Surfpool), HyperEVM, Tempo,
and Base — fixtures, CI templates, the boring plumbing every multi-chain team rebuilds.

**Why it's here:** the **highest-probability, lowest-ceiling** option. Near-lock on Public Good, plausible
track credit from every chain it supports, maximal criterion-(e) score, and new chains' actual bottleneck
is developer onboarding — the exact pain their judges feel.
**Weakness:** it's a tool, not a company. Weak on *Potential Market Size* and *Viability*, so the $300k
pool and accelerator are largely out. Pick this if you want ~$20–30k with high confidence and don't care
about the accelerator.

---

### #6 — Zcash checkout SDK ("Stripe for shielded payments")

**Highest EV per hour on the board, lowest ceiling.** Single thinnest track, most obviously missing piece,
maybe $15k with Public Good. Small enough that a solo builder can make it genuinely excellent rather than
merely working. **Best use of this: fold it into #1 as the Zcash adapter** rather than shipping it alone.

---

## 2. How to actually collect four track prizes

Stacking pays only if each ecosystem's judges see a first-class integration. Most teams that try this
collect one prize instead of four, because they treat chains two through four as afterthoughts. Do this:

- **Ship a real deployment on every chain you claim.** Live contract or program addresses, real
  transaction hashes on each, linked in the README. Not testnet screenshots.
- **One README section per chain**, written for that ecosystem's developer — their idioms, their tooling,
  their install path. A Zcash dev should not have to read Solana docs to use your Zcash adapter.
- **One demo-video segment per chain.** In a 3-minute demo, roughly 30 seconds each for four chains, with
  the chain named on screen. Judges skim; make their chain impossible to miss.
- **Name every chain explicitly** in the "blockchains and tools integrated" submission field.
- **Depth beats breadth per chain:** one genuine, idiomatic integration per chain beats eight shallow ones.
  Four real adapters is the target; six shallow ones scores worse than three deep.
- **Use each sponsor's own stack where it fits** — Phantom Connect for onboarding, CASH for settlement,
  Squads for treasury. Criterion (e) scores composability directly, and sponsor judges notice their logo.

---

## 3. Solo-specific scoring defense

You will be read against teams of four. Neutralize it deliberately:

- **Pick a category where solo is a feature.** Developer tooling: you are the customer, so founder-market
  fit is structural rather than claimed. This is the single strongest argument for #1, #5, and #6.
- **Say it out loud in the pitch video.** "I'm solo, here's what I shipped in 28 days" reframes a weakness
  as a demonstration of throughput. Hiding it reads worse than owning it.
- **Ship visibly.** Post the optional weekly update videos — they're explicitly recommended, nearly
  free, and they prove sustained velocity, which is exactly the doubt a solo submission raises.
- **Lead with SF and availability.** "Based in SF, can start the accelerator on day one" removes the
  logistical objection to a solo admit.
- **Let AI tooling show.** Colosseum has stated they've backed non-technical founders whose MVPs were
  built entirely with AI coding tools. Solo velocity via AI is a story they already believe.

---

## 4. Recommendation

**Build #1 — x402 Everywhere with a shielded Zcash mode.**

It has the best stacking surface (~$40k across four tracks plus Public Good), the strongest *Insight*
score of anything here, a demo that reads instantly, a solo-proof founder-market-fit story, and a real
company underneath if it works. Its one serious risk — Zcash shielded settlement — is knowable in three
days, and failing it degrades gracefully to a still-valuable three-chain SDK.

Fall back to **#2** if you want the highest floor, or **#3** if you care more about the accelerator than
the prize cash.

**Three things to do this week, before writing much code:**
1. Email `hackathon@colosseum.com` about community-college eligibility for the University Award.
2. Attend the **Sep 16 Tempo workshop** — two days out, and it tells you what Tempo's judges want *and*
   answers the open questions about Tempo's execution environment before you commit to an adapter.
3. **Spike the Zcash shielded payment path first.** It's the differentiator and the only real risk.
