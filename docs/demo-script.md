# Demo video script (≤ 3 minutes, screen recording)

Prep (off camera): local validator running with Token-2022 + SPL Record cloned; `pnpm setup:solana` done;
demo server on :4020; dashboard open; a terminal for the agent; a second terminal with an MCP client
(Claude Code) configured with sotto-mcp-server; explorer tab on the API's token account.

| t | Screen | Say |
|---|---|---|
| 0:00 | Explorer on a *plain* SPL transfer (any devnet tx) | "Normal agent payment: amount, sender, receiver, all public." |
| 0:15 | `curl -i http://127.0.0.1:4020/premium/quote` | "The API says 402. Look at the headers: one response, two protocols — x402 and MPP. Any agent can proceed." |
| 0:35 | `pnpm agent` | "The agent has a policy: 50 cents per payment, a dollar a day. It buys four quotes… about a second and a half each… and the fifth is denied. Nothing was signed." |
| 1:15 | Dashboard — observer | "What the public sees: transactions, a balance of zero, no amounts. The only thing on-chain is a random payment id." |
| 1:35 | Dashboard — owner | "What the owner sees: four signed receipts, 25 cents each." |
| 1:50 | Dashboard — auditor, click decrypt | "What an auditor sees: with the mint's auditor key, the exact amount comes back from the ledger. The proof transactions were found on-chain; the agent contributed nothing." |
| 2:10 | Claude Code + MCP | Ask Claude: *"fetch http://127.0.0.1:4020/premium/report and tell me what it cost."* Claude calls `sotto_fetch`, pays $1 confidentially, quotes the receipt. Then `sotto_set_paused` — and a second fetch is refused. |
| 2:45 | Chain montage (three quick cuts) | "Solana, confidential transfer. Zcash, shielded — amount, sender and receiver hidden. Tempo, Stripe's chain, bounded and receipted." Show one real tx link per chain. |
| 2:58 | README header | "sotto. Confidential, bounded, auditable." |
