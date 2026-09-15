/**
 * A scripted agent: buys quotes until the policy stops it, then prints its receipts.
 * Env: SOLANA_PAYER_KEYFILE (agent), DEMO_URL (default http://127.0.0.1:4020), BUDGET_USD (default 1), RECEIPTS_FILE
 */
import { createClient, type KeyPairSigner } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signerFromFile } from "@solana/kit-plugin-signer";
import { FileReceiptStore, formatUsd6, PolicyViolation, SottoClient, usd6FromNumber } from "@sotto/sdk";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(new URL("../demo-solana.json", import.meta.url), "utf8")) as { rpcUrl: string; network: string; mint: string; decimals: number };
const base = process.env.DEMO_URL ?? "http://127.0.0.1:4020";
const client = await createClient().use(signerFromFile(process.env.SOLANA_PAYER_KEYFILE!)).use(solanaRpc({ rpcUrl: cfg.rpcUrl }));
const agent = await SottoClient.create({
  agentId: "quote-bot",
  policy: { agentId: "quote-bot", maxPerPayment: usd6FromNumber(0.5), perDay: usd6FromNumber(Number(process.env.BUDGET_USD ?? 1)), allowHosts: ["127.0.0.1", "localhost"] },
  receipts: new FileReceiptStore(process.env.RECEIPTS_FILE ?? new URL("../receipts.jsonl", import.meta.url).pathname),
  solana: { client, signer: client.payer as unknown as KeyPairSigner, network: cfg.network, mints: [{ mint: cfg.mint, decimals: cfg.decimals }] },
});

for (let i = 1; i <= 6; i++) {
  try {
    const t0 = Date.now();
    const { response, receipt } = await agent.fetchDetailed(`${base}/premium/quote`);
    const body = await response.json();
    console.log(`#${i} ${response.status} in ${Date.now() - t0}ms →`, body, receipt ? `paid ${(receipt.details as { usd?: string })?.usd} confidentially, tx ${receipt.transactions[0]?.slice(0, 12)}…` : "(no payment)");
  } catch (e) {
    if (e instanceof PolicyViolation) { console.log(`#${i} DENIED — ${e.decision.reason}`); break; }
    throw e;
  }
}
const { remaining, spent } = await agent.policy.remaining("quote-bot");
console.log(`spent today ${formatUsd6(spent.day)}, remaining ${remaining.day === undefined ? "∞" : formatUsd6(remaining.day)}`);
console.log(`receipts: ${(await agent.listReceipts()).length}`);
