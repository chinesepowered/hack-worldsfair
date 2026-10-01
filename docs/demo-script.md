# Demo video — what is on screen, and what is said

The video (`docs/video/sotto-demo.mp4`, 2:53, captions in `sotto-demo.srt`) is recorded from the running system
by `packages/demo/video` — see its README to re-record. Narration: ElevenLabs, voice *Sapphire*. Nothing on
screen is mocked; the only time compression is the wait for a Zcash block, labelled fast-forward.

| t | Chapter · screen | Narration |
|---|---|---|
| 0:00 | Title card: Capy, *sotto* | "This is sotto: confidential, budgeted, auditable payments for AI agents." |
| 0:07 | 01 the problem · slide 1 of the deck | "Today, every x402 payment an agent makes is public: what it bought, from whom, and for how much. Its strategy is readable on-chain — and nothing caps what it can spend." |
| 0:20 | 02 one 402, two protocols · terminal: `curl -si localhost:4020/premium/quote`, then the MPP methods and the decoded x402 `accepts` | "Here's a paid API. It answers 402 with both kinds of challenge in one response — x402, and the Machine Payments Protocol — offering three rails: Solana confidential transfers, shielded Zcash, and Tempo." |
| 0:38 | 03 Capy pays · dashboard; Capy starts and buys a quote every ~3 s | "Meet Capy, our demo agent. Its owner set a policy: at most fifty cents a payment, a dollar fifty a day. Each quote costs twenty-five cents, and settles as a Solana confidential transfer in under two seconds." |
| 0:58 | the seventh purchase is refused; budget meter full | "Six quotes in, the budget is spent — and the seventh is refused before anything is signed." |
| 1:06 | 04 three viewpoints · public pane | "Here are the same payments, three ways. The public sees the transactions, but every amount is encrypted, and the API's public balance reads zero." |
| 1:17 | owner pane | "The owner sees everything: a signed receipt per payment, with the policy decision behind it." |
| 1:25 | auditor pane · two live decrypts | "And an auditor with the mint's auditor key decrypts the exact amount from the ledger itself. The proofs are found on-chain; nothing is taken on the agent's word." |
| 1:37 | 05 any agent · `claude -p "Buy the research report…" --mcp-config sotto-mcp.json` | "Any agent can plug in. This is Claude Code with the sotto MCP server, asked to buy a one-dollar research report." |
| 1:51 | Claude's answer: cost and receipt id | "It paid confidentially, and it quotes its receipt." |
| 1:55 | 06 one kill switch · `sotto pause`, then `sotto fetch …/premium/report` → refused | "Agents with a shell get the same tools as an Agent Skill, and every door shares one kill switch: pause, and the next payment is refused." |
| 2:06 | 07 Tempo · `sotto fetch` as tempo-bot | "The same policy runs on Tempo, over its native Machine Payments Protocol: twenty-five cents, paid on the Moderato testnet —" |
| 2:17 | Tempo's public explorer on that transaction | "and there it is, on Tempo's public explorer." |
| 2:24 | 08 Zcash · `sotto fetch` as zec-bot; fast-forward through the block | "On Zcash, the payment is fully shielded. The API finds it with a viewing key, by the payment ID in the encrypted memo." |
| 2:41 | 09 one owner, one ledger · owner pane: capy, claude, tempo-bot, zec-bot | "One owner, one ledger, three chains." |
| 2:45 | Closing card | "sotto: confidential, not anonymous. Open source, and ready for any agent." |

## Presenting it live (finalist interview)

Everything above runs from `packages/demo`:

```bash
TEMPO_RECIPIENT=0x… ZCASH_SETTLER_URL=http://127.0.0.1:8778 ZCASH_ADDRESS=utest1… WAIT_FOR_START=1 ./demo.sh reset
curl -X POST localhost:4021/start                 # Capy starts buying; open http://127.0.0.1:4020
./demo.sh mcp                                      # config for Claude Code
eval "$(./demo.sh env)" && sotto fetch http://localhost:4020/premium/report
```

Zcash needs both settlers running (payer with testnet funds on `:8777`, payee viewing wallet on `:8778`). If
the testnet is slow, say so and skip it: the video shows the shielded payment end to end.
