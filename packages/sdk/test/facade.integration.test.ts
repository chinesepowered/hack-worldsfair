/** The one-line experience: SottoServer protects a route for both protocols; SottoClient pays within policy. */
import { describe, expect, it } from "vitest";
import express from "express";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import type { AddressInfo } from "node:net";
import { ConfidentialSvmClientScheme, PolicyViolation, ReceiptSigner, SottoClient, SottoServer, ZCASH_TESTNET, ZcashSettlerClient } from "../src/index.js";
import { haveLocalValidator, RPC_URL, setupConfidentialMint } from "./helpers/solana.js";

const NETWORK = "solana:localnet";
const PAYEE_UA = "utest1payee";
function fakeZcash() {
  const notes: Array<{ txid: string; memo: string; zatoshis: number; to: string }> = [];
  const mk = (role: "payer" | "payee") => new ZcashSettlerClient(`http://${role}.settler`, async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/send" && role === "payer") {
      const b = JSON.parse(String(init?.body)) as { address: string; zatoshis: number; memo: string };
      const txid = "e".repeat(60) + String(notes.length).padStart(4, "0");
      notes.push({ txid, memo: b.memo, zatoshis: b.zatoshis, to: b.address });
      return Response.json({ txid });
    }
    if (url.pathname === "/received" && role === "payee") {
      const memo = url.searchParams.get("memo"); const min = Number(url.searchParams.get("min_zatoshis") ?? 0);
      return Response.json({ received: notes.filter(n => n.to === PAYEE_UA && (!memo || n.memo === memo) && n.zatoshis >= min).map(n => ({ txid: n.txid, mined_height: 1, block_time: 1, zatoshis: n.zatoshis, pool: "orchard", memo: n.memo })) });
    }
    return Response.json({ error: "unexpected" }, { status: 500 });
  });
  return { payer: mk("payer"), payee: mk("payee"), notes };
}

describe.skipIf(!haveLocalValidator)("SottoServer + SottoClient (local validator + fake zcash)", () => {
  it("serves both protocols on one route and pays within policy with receipts", async () => {
    const fx = await setupConfidentialMint({ fund: 10_000_000n });
    const zc = fakeZcash();
    const server = SottoServer.create({
      secretKey: "test-secret-key-at-least-32-bytes-long-0000",
      solana: { rpcUrl: RPC_URL, payee: fx.bob, usdMint: { mint: fx.mint, decimals: fx.decimals }, network: NETWORK },
      zcash: { settler: zc.payee, address: PAYEE_UA, network: ZCASH_TESTNET, zecPriceUsd: 40 },
    });
    const app = express();
    app.use(server.protect({ "GET /premium": { price: "$0.25", description: "premium data" } }));
    app.get("/premium", (_q, s) => { s.json({ data: "the premium data" }); });
    app.get("/free", (_q, s) => { s.json({ free: true }); });
    const http = app.listen(0, "127.0.0.1"); await new Promise<void>(r => http.once("listening", r));
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

    try {
      // unpaid: one 402 that both kinds of agent can act on
      const unpaid = await fetch(`${base}/premium`);
      expect(unpaid.status).toBe(402);
      expect(unpaid.headers.get("www-authenticate")).toMatch(/^Payment /);
      expect(unpaid.headers.get("payment-required")).toBeTruthy();
      expect((await fetch(`${base}/free`)).status).toBe(200);

      // an agent with both rails and a budget of $0.60/day
      const signer = await ReceiptSigner.generate();
      const agent = await SottoClient.create({
        agentId: "agent-1", signer,
        policy: { agentId: "agent-1", maxPerPayment: 500_000n, perDay: 600_000n, allowHosts: ["127.0.0.1"] },
        solana: { client: fx.client, signer: fx.alice, network: NETWORK, mints: [{ mint: fx.mint, decimals: fx.decimals }] },
        zcash: { settler: zc.payer, network: ZCASH_TESTNET },
      });
      const r1 = await agent.fetch(`${base}/premium`);
      expect(r1.status).toBe(200);
      expect(await r1.json()).toEqual({ data: "the premium data" });
      const receipts = await agent.listReceipts();
      expect(receipts).toHaveLength(1);
      expect(receipts[0]).toMatchObject({ agentId: "agent-1", amount: "250000", confidential: true, resource: `${base}/premium` });
      expect(["solana-confidential", "confidential"]).toContain(receipts[0]!.scheme);
      expect(await ReceiptSigner.verify(receipts[0]!)).toBe(true);
      expect(receipts[0]!.details).toEqual({ usd: "$0.25" });

      const r2 = await agent.fetch(`${base}/premium`);
      expect(r2.status).toBe(200);
      await expect(agent.fetch(`${base}/premium`)).rejects.toBeInstanceOf(PolicyViolation);
      const decisions = await agent.decisions();
      expect(decisions.filter(d => d.allowed)).toHaveLength(2);
      expect(decisions.at(-1)).toMatchObject({ allowed: false });
      expect(decisions.at(-1)!.reason).toMatch(/daily budget/);
      expect(await agent.listReceipts()).toHaveLength(2);

      // an agent with only Zcash pays shielded; a paused agent pays nothing
      const zagent2 = await SottoClient.create({ agentId: "agent-z", policy: { agentId: "agent-z", maxPerPayment: 1_000_000n }, zcash: { settler: zc.payer, network: ZCASH_TESTNET, zecPriceUsd: 40 } });
      const rz = await zagent2.fetch(`${base}/premium`);
      expect(rz.status).toBe(200);
      expect(zc.notes).toHaveLength(1);
      expect(zc.notes[0]).toMatchObject({ to: PAYEE_UA, zatoshis: 625_000 }); // $0.25 at $40/ZEC
      expect((await zagent2.listReceipts())[0]).toMatchObject({ scheme: "zcash-shielded", amount: "625000", confidential: true });
      zagent2.pause();
      await expect(zagent2.fetch(`${base}/premium`)).rejects.toBeInstanceOf(PolicyViolation);
      expect(zc.notes).toHaveLength(1);

      // a plain x402 agent (no MPP at all) still gets served by the same route
      const x = x402Client.fromConfig({ schemes: [{ network: NETWORK, client: new ConfidentialSvmClientScheme({ client: fx.client, signer: fx.alice }) }], spendControls: { allowedAssets: [{ network: NETWORK, asset: fx.mint }] } });
      const rx = await wrapFetchWithPayment(fetch, x)(`${base}/premium`);
      expect(rx.status).toBe(200);
      expect(rx.headers.get("payment-response")).toBeTruthy();
    } finally {
      http.close();
    }
  }, 240_000);
});
