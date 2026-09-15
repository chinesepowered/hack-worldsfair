/** The shielded scheme/method over both protocol faces, with a fake settler on each side. */
import { describe, expect, it } from "vitest";
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402Client } from "@x402/core/client";
import { x402Facilitator } from "@x402/core/facilitator";
import { x402ResourceServer } from "@x402/core/server";
import { wrapFetchWithPayment } from "@x402/fetch";
import { declarePaymentIdentifierExtension, paymentIdentifierResourceServerExtension } from "@x402/extensions";
import { Mppx as MppxServer } from "mppx/server";
import { Mppx as MppxClient } from "mppx/client";
import { Receipt } from "mppx";
import type { AddressInfo } from "node:net";
import { LocalFacilitatorClient, ShieldedZcashClientScheme, ShieldedZcashFacilitatorScheme, ShieldedZcashServerScheme, ZCASH_TESTNET, ZcashSettlerClient, zcashShieldedClient, zcashShieldedServer } from "../src/index.js";
import { serveFetchHandler } from "./helpers/http.js";

const PAYEE = "utest1payee";
/** One shared "chain": what the payer's settler sends becomes visible to the payee's settler. */
function fakeChain() {
  const notes: Array<{ txid: string; memo: string; zatoshis: number; to: string }> = [];
  const mk = (role: "payer" | "payee") => new ZcashSettlerClient(`http://${role}.settler`, async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/send" && role === "payer") {
      const b = JSON.parse(String(init?.body)) as { address: string; zatoshis: number; memo: string };
      const txid = "f".repeat(60) + String(notes.length).padStart(4, "0");
      notes.push({ txid, memo: b.memo, zatoshis: b.zatoshis, to: b.address });
      return Response.json({ txid });
    }
    if (url.pathname === "/received" && role === "payee") {
      const memo = url.searchParams.get("memo"); const min = Number(url.searchParams.get("min_zatoshis") ?? 0);
      return Response.json({ received: notes.filter(n => n.to === PAYEE && (!memo || n.memo === memo) && n.zatoshis >= min).map(n => ({ txid: n.txid, mined_height: 1, block_time: 1, zatoshis: n.zatoshis, pool: "orchard", memo: n.memo })) });
    }
    return Response.json({ error: `unexpected ${role} ${url.pathname}` }, { status: 500 });
  });
  return { payer: mk("payer"), payee: mk("payee"), notes };
}

describe("shielded over x402", () => {
  it("402 → shielded payment with memo → 200", async () => {
    const chain = fakeChain();
    const facilitator = new x402Facilitator().register(ZCASH_TESTNET, new ShieldedZcashFacilitatorScheme({ settler: chain.payee, address: PAYEE }));
    const rs = new x402ResourceServer(new LocalFacilitatorClient(facilitator)).register(ZCASH_TESTNET, new ShieldedZcashServerScheme({ zecPriceUsd: 40 })).registerExtension(paymentIdentifierResourceServerExtension);
    const app = express();
    app.use(paymentMiddleware({ "GET /p": { accepts: { scheme: "shielded", network: ZCASH_TESTNET, price: "$0.40", payTo: PAYEE }, extensions: { "payment-identifier": declarePaymentIdentifierExtension({ required: true }) } } }, rs));
    app.get("/p", (_q, s) => { s.json({ ok: 1 }); });
    const server = app.listen(0, "127.0.0.1"); await new Promise<void>(r => server.once("listening", r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/p`;
    try {
      expect((await fetch(url)).status).toBe(402);
      const client = x402Client.fromConfig({ schemes: [{ network: ZCASH_TESTNET, client: new ShieldedZcashClientScheme({ settler: chain.payer }) }], spendControls: false });
      const res = await wrapFetchWithPayment(fetch, client)(url);
      expect(res.status).toBe(200);
      expect(chain.notes).toHaveLength(1);
      expect(chain.notes[0]).toMatchObject({ to: PAYEE, zatoshis: 1_000_000 }); // $0.40 at $40/ZEC = 0.01 ZEC
      expect(chain.notes[0]!.memo).toMatch(/^pay_/);
    } finally { server.close(); }
  });
});

describe("shielded over MPP", () => {
  it("challenge → shielded payment with the challenge id as memo → receipt", async () => {
    const chain = fakeChain();
    const mppx = MppxServer.create({ methods: [zcashShieldedServer({ settler: chain.payee, address: PAYEE, network: ZCASH_TESTNET })], secretKey: "test-secret-key-at-least-32-bytes-long-0000" });
    const paid = mppx.charge({ zatoshis: "250000" });
    const srv = await serveFetchHandler(async req => { const r = await paid(req); return r.status === 402 ? r.challenge : r.withReceipt(Response.json({ ok: 1 })); });
    try {
      const { fetch: payingFetch } = MppxClient.create({ methods: [zcashShieldedClient({ settler: chain.payer })], polyfill: false });
      const res = await payingFetch(`${srv.url}/p`);
      expect(res.status).toBe(200);
      const receipt = Receipt.fromResponse(res);
      expect(receipt).toMatchObject({ method: "zcash-shielded", status: "success", reference: chain.notes[0]!.txid });
      expect(chain.notes[0]!.memo).toMatch(/^[A-Za-z0-9_-]{16,}$/);
      expect(chain.notes[0]!.zatoshis).toBe(250_000);
    } finally { await srv.close(); }
  });
});
