# Pitch video script (2–3 minutes)

Judges watch this first. One founder, on camera, screen where noted. Speak plainly; no slides needed.

## 0:00 — The problem, in one picture (30s)
*Screen: a block explorer on an agent's wallet.*
"This is an AI agent's wallet. It buys market data every few minutes. From here I can read its whole
business: which APIs it pays, how often, and exactly how much. If I'm its competitor, I've just copied its
strategy. And if this agent has a bug — or someone slips it a bad prompt — nothing stops it from spending
everything in the wallet."

## 0:30 — What sotto is (30s)
*Screen: the README's comparison table.*
"sotto is a payment rail for agents that fixes both halves. Payments are confidential: on Solana the amount
is encrypted with Token-2022 confidential transfers; on Zcash the whole payment is shielded. Payments are
bounded: the owner sets a per-payment cap, hourly and daily budgets, which hosts the agent may pay, and a
kill switch. And every payment is provable: the owner or an auditor holding a viewing key can recover the
exact amount from the chain alone — no trust in the agent's logs."

## 1:00 — It works with what agents already use (25s)
*Screen: `SottoServer.create(...)` and `agent.fetch(...)` snippets.*
"It isn't a new protocol. sotto plugs into x402 — Coinbase's standard, as two new schemes — and into the
Machine Payments Protocol, Tempo's standard, as two new methods. One `fetch` on the agent side; one
middleware on the API side, whose 402 speaks both. Any MCP client can use it through sotto-mcp-server."

## 1:25 — Live proof (50s)
*Screen: the demo dashboard.*
"Here's an agent buying quotes at 25 cents each. Observer view: anyone on-chain sees the transactions —
and a balance of zero. No amounts. Owner view: the agent's operator sees every payment, signed. Auditor
view: with the mint's auditor key, I click one transaction and the amount comes back from the ledger —
25 cents — with the proof transactions discovered on-chain. Now the fifth purchase: denied. The daily
budget was one dollar. The agent asked for more and the policy said no before anything was signed."

## 2:15 — Why now, why me (30s)
"Solana's confidential transfers came back to mainnet in June 2026 and almost nobody has built on them.
Agent payments are the fastest-growing use of stablecoins, and every one of them is public. I build
agents; I needed this; nobody was shipping it, so I did — solo, in four weeks, on Solana, Zcash and Tempo.
I'm in San Francisco and can start tomorrow."

## 2:45 — Ask (10s)
"sotto: confidential, bounded, auditable payments for the agent economy. Thanks."
