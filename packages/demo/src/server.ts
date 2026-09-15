/**
 * The demo API + dashboard.
 *   GET /premium/quote      $0.25  — a "market data" resource an agent buys repeatedly
 *   GET /premium/report     $1.00  — a bigger one
 *   /                        the dashboard: observer / owner / auditor / policy views
 *   /api/...                 JSON for the dashboard
 * Env: SOLANA_PAYEE_KEYFILE (the API's key), ZCASH_SETTLER_URL + ZCASH_ADDRESS (optional), TEMPO_RECIPIENT (optional),
 *      SOTTO_SECRET (MPP secret), PORT
 */
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { createKeyPairSignerFromBytes, createSolanaRpc, type Address, type Signature } from "@solana/kit";
import { elgamalSecretFromBytes, FileReceiptStore, SottoServer, verifyConfidentialPayment, ZcashSettlerClient } from "@sotto/sdk";
import express from "express";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(new URL("../demo-solana.json", import.meta.url), "utf8")) as { rpcUrl: string; network: string; explorerTx?: string; mint: Address; decimals: number; agent: Address; api: Address; auditorElgamalPubkey: Address; auditorElgamalSecret: number[] };
const api = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(process.env.SOLANA_PAYEE_KEYFILE!, "utf8"))));
if (api.address !== cfg.api) throw new Error(`SOLANA_PAYEE_KEYFILE is ${api.address}, demo-solana.json expects ${cfg.api}`);
const rpc = createSolanaRpc(cfg.rpcUrl);

const server = SottoServer.create({
  secretKey: process.env.SOTTO_SECRET ?? "demo-secret-key-at-least-32-bytes-long-0000",
  solana: { rpcUrl: cfg.rpcUrl, payee: api, usdMint: { mint: cfg.mint, decimals: cfg.decimals }, network: cfg.network },
  ...(process.env.ZCASH_SETTLER_URL && process.env.ZCASH_ADDRESS ? { zcash: { settler: new ZcashSettlerClient(process.env.ZCASH_SETTLER_URL), address: process.env.ZCASH_ADDRESS, network: "zcash:testnet", zecPriceUsd: Number(process.env.ZEC_PRICE_USD ?? 40), waitMs: 90_000 } } : {}),
  ...(process.env.TEMPO_RECIPIENT ? { tempo: { recipient: process.env.TEMPO_RECIPIENT as `0x${string}`, testnet: true } } : {}),
});

const app = express();
app.use(express.static(new URL("../public", import.meta.url).pathname));
app.use(server.protect({
  "GET /premium/quote": { price: "$0.25", description: "live quote" },
  "GET /premium/report": { price: "$1.00", description: "research report" },
}));
let sold = 0;
app.get("/premium/quote", (_q, res) => { sold++; res.json({ symbol: "SOL/USD", price: (150 + Math.random() * 5).toFixed(2), at: new Date().toISOString(), n: sold }); });
app.get("/premium/report", (_q, res) => { sold++; res.json({ title: "Q3 agent-economy report", pages: 42, at: new Date().toISOString(), n: sold }); });

/** Observer view: what anyone can see on-chain for the API's token account — signatures and a balance of 0. */
app.get("/api/observer", async (_q, res) => {
  const [apiToken] = await findAssociatedTokenPda({ mint: cfg.mint, owner: cfg.api, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
  const sigs = await rpc.getSignaturesForAddress(apiToken, { limit: 20 }).send();
  const acct = await rpc.getTokenAccountBalance(apiToken).send().catch(() => null);
  res.json({ tokenAccount: apiToken, publicBalance: acct?.value.uiAmountString ?? "0", transactions: sigs.map(s => ({ signature: s.signature, slot: Number(s.slot), time: s.blockTime ? new Date(Number(s.blockTime) * 1000).toISOString() : null, amountVisible: null, memo: s.memo })) });
});

/** Owner view: the agent's signed receipts (its private ledger). */
app.get("/api/owner", async (_q, res) => {
  const file = process.env.RECEIPTS_FILE ?? new URL("../receipts.jsonl", import.meta.url).pathname;
  const receipts = await new FileReceiptStore(file).list();
  res.json({ receipts: receipts.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50) });
});

/** Auditor view: decrypt the amount of a transfer from the ledger with the mint's auditor key. Proof transactions are discovered on-chain. */
app.get("/api/auditor", async (req, res) => {
  const transfer = String(req.query.transfer ?? "");
  const paymentId = String(req.query.paymentId ?? "");
  if (!transfer || !paymentId) return res.status(400).json({ error: "transfer and paymentId are required" });
  try {
    const v = await verifyConfidentialPayment({ rpc: cfg.rpcUrl, transferSignature: transfer, paymentId, elgamalSecret: elgamalSecretFromBytes(cfg.auditorElgamalSecret), elgamalPubkey: cfg.auditorElgamalPubkey, role: "auditor", minAmount: 0n });
    res.json({ amount: v.amount.toString(), usd: (Number(v.amount) / 10 ** cfg.decimals).toFixed(2), sourceToken: v.sourceToken, destinationToken: v.destinationToken, slot: v.slot.toString(), validityProofSignature: v.validityProofSignature });
  } catch (e) { res.status(422).json({ error: (e as Error).message }); }
});

/** Sanity: which rails this API accepts, and where transactions can be viewed. */
app.get("/api/rails", (_q, res) => res.json({ solana: cfg.network, zcash: Boolean(process.env.ZCASH_SETTLER_URL), tempo: Boolean(process.env.TEMPO_RECIPIENT), mint: cfg.mint, api: cfg.api, explorerTx: cfg.explorerTx ?? null }));

/** The agent runs as its own process; the dashboard reaches its control endpoint through here. */
const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:4021";
app.get("/api/agent/status", async (_q, res) => {
  try { res.json(await (await fetch(`${AGENT_URL}/status`)).json()); } catch { res.status(503).json({ error: "agent is not running" }); }
});
for (const action of ["pause", "resume"] as const) {
  app.post(`/api/agent/${action}`, async (_q, res) => {
    try { res.json(await (await fetch(`${AGENT_URL}/${action}`, { method: "POST" })).json()); } catch { res.status(503).json({ error: "agent is not running" }); }
  });
}

/** Memo lookup for the observer table: which payment ids appear in these transactions. */
app.get("/api/tx/:sig", async (req, res) => {
  const tx = await rpc.getTransaction(req.params.sig as Signature, { encoding: "json", maxSupportedTransactionVersion: 0 }).send();
  if (!tx) return res.status(404).json({ error: "not found" });
  res.json({ slot: Number(tx.slot), err: tx.meta?.err ?? null, instructions: tx.transaction.message.instructions.length, logs: tx.meta?.logMessages?.slice(0, 40) ?? [] });
});

const port = Number(process.env.PORT ?? 4020);
app.listen(port, () => console.log(`sotto demo API + dashboard on http://127.0.0.1:${port}`));
