/**
 * The demo agent. Two modes:
 *   one-shot (default): buy quotes until the policy stops it, print receipts.
 *   LOOP=1: keep buying one quote every INTERVAL_MS and expose a control endpoint the dashboard uses:
 *     GET /status · POST /pause · POST /resume   (AGENT_PORT, default 4021)
 * Env: SOLANA_PAYER_KEYFILE (agent), DEMO_URL (default http://127.0.0.1:4020), BUDGET_USD (default 1), RECEIPTS_FILE
 */
import { createClient, type KeyPairSigner } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signerFromFile } from "@solana/kit-plugin-signer";
import { FileReceiptStore, formatUsd6, PolicyViolation, SottoClient, usd6FromNumber } from "@sotto/sdk";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const cfg = JSON.parse(readFileSync(new URL("../demo-solana.json", import.meta.url), "utf8")) as { rpcUrl: string; network: string; mint: string; decimals: number };
const base = process.env.DEMO_URL ?? "http://127.0.0.1:4020";
const AGENT_ID = "quote-bot";
const client = await createClient().use(signerFromFile(process.env.SOLANA_PAYER_KEYFILE!)).use(solanaRpc({ rpcUrl: cfg.rpcUrl }));
const agent = await SottoClient.create({
  agentId: AGENT_ID,
  policy: { agentId: AGENT_ID, maxPerPayment: usd6FromNumber(0.5), perDay: usd6FromNumber(Number(process.env.BUDGET_USD ?? 1)), allowHosts: ["127.0.0.1", "localhost"] },
  receipts: new FileReceiptStore(process.env.RECEIPTS_FILE ?? new URL("../receipts.jsonl", import.meta.url).pathname),
  solana: { client, signer: client.payer as unknown as KeyPairSigner, network: cfg.network, mints: [{ mint: cfg.mint, decimals: cfg.decimals }] },
});

type Event = { at: string; kind: "paid" | "denied" | "free" | "error"; text: string; tx?: string; usd?: string };
const events: Event[] = [];
const log = (e: Event) => { events.unshift(e); events.splice(60); console.log(`${e.at.slice(11, 19)} ${e.kind.toUpperCase().padEnd(6)} ${e.text}`); };

async function buyOnce(path = "/premium/quote"): Promise<boolean> {
  const t0 = Date.now();
  try {
    const { response, receipt } = await agent.fetchDetailed(`${base}${path}`);
    const body = (await response.json()) as { price?: string; title?: string };
    const usd = (receipt?.details as { usd?: string } | undefined)?.usd;
    log(receipt
      ? { at: new Date().toISOString(), kind: "paid", text: `${path} → ${body.price ?? body.title} · paid ${usd} confidentially in ${Date.now() - t0}ms`, tx: receipt.transactions[0], usd }
      : { at: new Date().toISOString(), kind: "free", text: `${path} → ${response.status} (no payment)` });
    return true;
  } catch (e) {
    if (e instanceof PolicyViolation) { log({ at: new Date().toISOString(), kind: "denied", text: e.decision.reason }); return false; }
    log({ at: new Date().toISOString(), kind: "error", text: (e as Error).message }); return false;
  }
}

async function status() {
  const { policy, remaining, spent } = await agent.policy.remaining(AGENT_ID);
  return { agentId: AGENT_ID, paused: Boolean(policy?.paused), maxPerPaymentUsd: formatUsd6(policy?.maxPerPayment ?? 0n), dayBudgetUsd: policy?.perDay === undefined ? null : formatUsd6(policy.perDay), spentTodayUsd: formatUsd6(spent.day), remainingTodayUsd: remaining.day === undefined ? null : formatUsd6(remaining.day), receipts: (await agent.listReceipts()).length, events: events.slice(0, 30) };
}

if (process.env.LOOP === "1") {
  const port = Number(process.env.AGENT_PORT ?? 4021);
  createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && (req.url === "/pause" || req.url === "/resume")) { agent.pause(req.url === "/pause"); res.end(JSON.stringify({ paused: req.url === "/pause" })); return; }
    if (req.url === "/status") { res.end(JSON.stringify(await status())); return; }
    res.statusCode = 404; res.end("{}");
  }).listen(port, "127.0.0.1", () => console.log(`agent control on http://127.0.0.1:${port}`));
  const interval = Number(process.env.INTERVAL_MS ?? 4000);
  const backoff = Number(process.env.BACKOFF_MS ?? 30_000);
  for (;;) {
    const ok = await buyOnce();
    // a denied or failed purchase is not worth hammering: wait longer before asking again
    await new Promise(r => setTimeout(r, ok ? interval : backoff));
  }
} else {
  for (let i = 1; i <= 6; i++) if (!(await buyOnce())) break;
  const s = await status();
  console.log(`spent today ${s.spentTodayUsd}, remaining ${s.remainingTodayUsd ?? "∞"}, receipts: ${s.receipts}`);
}
