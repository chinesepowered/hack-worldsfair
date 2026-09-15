---
name: sotto
description: Pay for paywalled web resources (HTTP 402 via x402 or the Machine Payments Protocol) confidentially and within the owner's spending policy, using the `sotto` CLI. Use when a request returns 402 Payment Required, when asked to buy data or API access, or to check the remaining budget, list receipts, or pause spending.
---

# sotto — confidential, budgeted payments from the shell

`sotto` lets you pay for a web resource the way you would fetch it with `curl`, except the payment is
**confidential** on-chain (the amount is hidden from the public), **bounded** by a policy the owner set
(per-payment cap, hourly/daily/monthly budgets, host allowlist), and **recorded** as a signed receipt.
You never hold or see a wallet key: the CLI does, and it refuses anything outside the policy.

## Setup (once, by the owner)

- In the sotto repo: `pnpm install && pnpm -r build`, then put `packages/mcp-server/bin` on `PATH`
  (or `npm link` inside `packages/mcp-server`). `sotto help` should print the usage.
- Configure with `SOTTO_*` environment variables — the same ones the MCP server reads
  (`packages/mcp-server/README.md`). The demo prints a working set: `eval "$(packages/demo/demo.sh env)"`.

## Commands

| command | what it does |
|---|---|
| `sotto fetch <url> [-X POST] [-H "Name: value"] [-d BODY] [--json]` | Fetch a URL. If it answers 402 and the policy allows, pay and retry. Body → stdout; one receipt line → stderr. `--json` prints `{status, headers, body, payment}` instead. |
| `sotto budget [--json]` | Per-payment cap, spent and remaining per window, host lists, paused state. |
| `sotto receipts [--limit N] [--json]` | Signed receipts, newest first. |
| `sotto decisions [--limit N] [--json]` | Allow/deny decisions with the reason for each. |
| `sotto pause` / `sotto resume` | The kill switch. Holds until resumed, shared with the MCP server. |

Exit codes: `0` ok · `1` request failed or non-2xx · `2` usage · `3` payment denied by policy.

## How to behave

1. Before buying something new, run `sotto budget` and check the price fits. Prefer the cheapest resource that answers the question.
2. Use `sotto fetch` instead of `curl` for any URL that returned 402, or that you know is paid. Never try to pay another way.
3. Exit code 3 means the owner's policy refused. Report the reason and the remaining budget to the user verbatim and stop: do not retry, split the purchase, or look for a workaround. Only the owner can raise a limit.
4. After a paid fetch, tell the user what it cost and quote the receipt id from the stderr line (or `sotto receipts --limit 1`).
5. If the user asks to stop spending, run `sotto pause` at once and confirm. Run `sotto resume` only when they ask.
6. Free resources still work while paused, so keep using `sotto fetch` for them.

## Example

```
$ sotto fetch http://127.0.0.1:4020/premium/quote
{"symbol":"SOL","price":152.49,"asOf":"2026-09-15T16:11:39.512Z"}
sotto: paid $0.25 confidentially on solana:localnet · receipt rcpt_9f3a… · tx 5FqFUv…

$ sotto fetch http://127.0.0.1:4020/premium/quote     # after the daily budget is spent
sotto: Payment denied by the owner's policy: $0.25 would exceed daily budget $1.5 (spent $1.5). Remaining budget — hour: n/a, day: $0, month: n/a. Ask the owner to raise the limit or use a cheaper resource.
$ echo $?
3
```
