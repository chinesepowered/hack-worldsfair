# sotto demo

A paywalled API, a scripted agent, and a dashboard with three viewpoints. Runs against a local validator
(recipe in the repo README) or devnet.

```bash
SOLANA_PAYER_KEYFILE=agent.json SOLANA_PAYEE_KEYFILE=api.json pnpm setup:solana   # writes demo-solana.json (contains the auditor secret — never commit)
SOLANA_PAYEE_KEYFILE=api.json pnpm server                                          # API + dashboard on :4020
SOLANA_PAYER_KEYFILE=agent.json BUDGET_USD=1 pnpm agent                            # buys $0.25 quotes until denied
```

Optional rails for the server: `ZCASH_SETTLER_URL` + `ZCASH_ADDRESS` (+ `ZEC_PRICE_USD`), `TEMPO_RECIPIENT`.

Routes: `GET /premium/quote` ($0.25), `GET /premium/report` ($1.00). Dashboard: `/`. JSON: `/api/observer`,
`/api/owner`, `/api/auditor?transfer=&paymentId=`, `/api/rails`.
