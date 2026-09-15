import { describe, expect, it } from "vitest";
import { MemoryReceiptStore, ReceiptSigner, newPaymentId, newReceiptId, type Receipt } from "../src/index.js";

describe("receipts", () => {
  it("signs, verifies, and detects tampering", async () => {
    const signer = await ReceiptSigner.generate();
    const r: Receipt = {
      id: newReceiptId(), at: new Date().toISOString(), agentId: "agent-1", protocol: "x402", scheme: "confidential",
      network: "solana:localnet", asset: "MintXYZ", decimals: 6, amount: "12345678", resource: "https://api.example.com/data",
      paymentId: newPaymentId(), transactions: ["sig1", "sig2"], confidential: true,
    };
    const signed = await signer.sign(r);
    expect(await ReceiptSigner.verify(signed)).toBe(true);
    expect(await ReceiptSigner.verify({ ...signed, amount: "1" })).toBe(false);
    const store = new MemoryReceiptStore();
    await store.put(signed);
    expect((await store.list({ agentId: "agent-1" })).map(x => x.id)).toEqual([r.id]);
    expect(await store.list({ agentId: "other" })).toEqual([]);
  });
});
