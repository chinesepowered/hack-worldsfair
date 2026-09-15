/** MPP over HTTP with the `solana-confidential` method: challenge, confidential payment, receipt. */
import { describe, expect, it } from "vitest";
import { Mppx as MppxServer } from "mppx/server";
import { Mppx as MppxClient } from "mppx/client";
import { Receipt } from "mppx";
import { solanaConfidentialClient, solanaConfidentialServer } from "../src/index.js";
import { serveFetchHandler } from "./helpers/http.js";
import { haveLocalValidator, RPC_URL, setupConfidentialMint } from "./helpers/solana.js";

describe.skipIf(!haveLocalValidator)("MPP solana-confidential method over HTTP (local validator)", () => {
  it("challenges, gets paid confidentially, and issues a receipt bound to the challenge", async () => {
    const fx = await setupConfidentialMint();
    const mppx = MppxServer.create({
      methods: [solanaConfidentialServer({ rpcUrl: RPC_URL, payee: fx.bob, mint: fx.mint, decimals: fx.decimals, network: "solana:localnet" })],
      secretKey: "test-secret-key-at-least-32-bytes-long-0000",
    });
    const paid = mppx.charge({ amount: "0.25" });
    const srv = await serveFetchHandler(async request => {
      const r = await paid(request);
      if (r.status === 402) return r.challenge;
      return r.withReceipt(Response.json({ data: "the premium data" }));
    });
    try {
      const plain = await fetch(`${srv.url}/premium`);
      expect(plain.status).toBe(402);
      const challenge = plain.headers.get("www-authenticate") ?? "";
      expect(challenge).toMatch(/^Payment /);
      expect(challenge).toContain('method="solana-confidential"');

      const seen: string[] = [];
      const { fetch: payingFetch } = MppxClient.create({
        methods: [solanaConfidentialClient({ client: fx.client, signer: fx.alice, onPayment: ({ paymentId }) => { seen.push(paymentId); } })],
        polyfill: false,
      });
      const t0 = Date.now();
      const ok = await payingFetch(`${srv.url}/premium`);
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ data: "the premium data" });
      const receipt = Receipt.fromResponse(ok);
      expect(receipt).toMatchObject({ method: "solana-confidential", status: "success" });
      expect(receipt.reference).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
      expect(seen).toHaveLength(1);
      // the paying client got its own challenge; its id became the payment id (and the on-chain memo),
      // which is what the server verified before issuing the receipt
      expect(seen[0]).toMatch(/^[A-Za-z0-9_-]{16,}$/);
      expect(challenge).not.toContain(`id="${seen[0]}"`);
      console.log(`paid confidentially over MPP in ${Date.now() - t0}ms, tx ${receipt.reference.slice(0, 16)}…`);
    } finally {
      await srv.close();
    }
  }, 180_000);
});
