/** x402 over HTTP with the `confidential` scheme: a paid express route, a paying fetch, a verified settlement. */
import { describe, expect, it } from "vitest";
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { x402Facilitator } from "@x402/core/facilitator";
import { x402ResourceServer } from "@x402/core/server";
import { wrapFetchWithPayment } from "@x402/fetch";
import { declarePaymentIdentifierExtension, paymentIdentifierResourceServerExtension } from "@x402/extensions";
import type { AddressInfo } from "node:net";
import { ConfidentialSvmClientScheme, ConfidentialSvmFacilitatorScheme, ConfidentialSvmServerScheme, LocalFacilitatorClient } from "../src/index.js";
import { haveLocalValidator, RPC_URL, setupConfidentialMint } from "./helpers/solana.js";

const NETWORK = "solana:localnet" as const;

describe.skipIf(!haveLocalValidator)("x402 confidential scheme over HTTP (local validator)", () => {
  it("returns 402, then 200 after a confidential payment the payee verified itself", async () => {
    const fx = await setupConfidentialMint();

    // payee: resource server + its own in-process facilitator
    const facilitator = new x402Facilitator().register(NETWORK, new ConfidentialSvmFacilitatorScheme({ rpcUrl: RPC_URL, payee: fx.bob }));
    const resourceServer = new x402ResourceServer(new LocalFacilitatorClient(facilitator))
      .register(NETWORK, new ConfidentialSvmServerScheme({ usdMint: { mint: fx.mint, decimals: fx.decimals } }))
      .registerExtension(paymentIdentifierResourceServerExtension);
    const app = express();
    app.use(paymentMiddleware({
      "GET /premium": {
        accepts: { scheme: "confidential", network: NETWORK, price: "$0.25", payTo: fx.bob.address },
        description: "premium data",
        extensions: { "payment-identifier": declarePaymentIdentifierExtension({ required: true }) },
      },
    }, resourceServer));
    app.get("/premium", (_req, res) => { res.json({ data: "the premium data" }); });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(r => server.once("listening", r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/premium`;

    try {
      const plain = await fetch(url);
      expect(plain.status).toBe(402);
      // x402 v2 carries the requirements in the PAYMENT-REQUIRED header (base64 JSON)
      const header = plain.headers.get("payment-required");
      expect(header).toBeTruthy();
      const required = JSON.parse(Buffer.from(header!, "base64").toString()) as { x402Version: number; accepts: Array<{ scheme: string; amount: string; asset: string; payTo: string }>; extensions?: Record<string, unknown> };
      expect(required.x402Version).toBe(2);
      expect(required.accepts[0]).toMatchObject({ scheme: "confidential", amount: "250000", asset: fx.mint, payTo: fx.bob.address });
      expect(required.extensions).toHaveProperty("payment-identifier");

      // payer: an agent whose fetch pays automatically
      const seen: string[] = [];
      // the mint is not one of x402's default assets, so it must be allowed explicitly
      const client = x402Client.fromConfig({ schemes: [{ network: NETWORK, client: new ConfidentialSvmClientScheme({ client: fx.client, signer: fx.alice, onPayment: ({ paymentId }) => { seen.push(paymentId); } }) }], spendControls: { allowedAssets: [{ network: NETWORK, asset: fx.mint }] } });
      const payingFetch = wrapFetchWithPayment(fetch, client);
      const t0 = Date.now();
      const paid = await payingFetch(url);
      expect(paid.status).toBe(200);
      expect(await paid.json()).toEqual({ data: "the premium data" });
      const settle = new x402HTTPClient(client).getPaymentSettleResponse(name => paid.headers.get(name));
      expect(settle.success).toBe(true);
      expect(settle.transaction).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
      expect(seen).toHaveLength(1);
      console.log(`paid confidentially over x402 in ${Date.now() - t0}ms, tx ${settle.transaction.slice(0, 16)}…`);
    } finally {
      server.close();
    }
  }, 180_000);
});
