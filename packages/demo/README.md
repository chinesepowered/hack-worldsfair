# sotto demo

One command from nothing to a running demo:

```bash
./demo.sh            # validator → keys → confidential mint → API + dashboard → Capy, the agent
./demo.sh mcp        # Claude Code config so Claude pays through sotto too
./demo.sh stop       # or: reset
```

Needs `pnpm` and the Solana CLI (`sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`). State lives in
`~/.sotto-demo` (keys, ledger, logs); the repo only gets the gitignored `demo-solana.json` and `receipts.jsonl`.

Then open **http://127.0.0.1:4020**:

- **Public** column: every transaction, amounts redacted, public balance 0.
- **Owner** column: Capy's signed receipts as they happen (a $0.25 quote every 5 s).
- **Auditor** column: click *decrypt* — the exact amount comes back from the ledger.
- **Policy** rail: the budget meter fills to $1.50/day, then the feed shows *denied*. **Pause spending** refuses
  everything before it is signed; **Resume** lets it continue.

Routes: `GET /premium/quote` ($0.25), `GET /premium/report` ($1.00). JSON: `/api/observer`, `/api/owner`,
`/api/auditor?transfer=&paymentId=`, `/api/agent/status`, `/api/rails`.

Optional rails for the API server: `ZCASH_SETTLER_URL` + `ZCASH_ADDRESS` (+ `ZEC_PRICE_USD`), `TEMPO_RECIPIENT`.
Manual pieces, if you prefer them to the script: `pnpm setup:solana`, `pnpm server`, `LOOP=1 pnpm agent`.
