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

import { FileReceiptStore } from "../src/index.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("FileReceiptStore", () => {
  it("persists receipts as JSON lines and reloads them", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "sotto-")), "receipts.jsonl");
    const signer = await ReceiptSigner.generate();
    const mk = async (id: string) => signer.sign({ id, at: new Date().toISOString(), agentId: "a", protocol: "mpp", scheme: "tempo", network: "eip155:42431", asset: "0x20c0", decimals: 6, amount: "1", resource: "https://x", paymentId: "p", transactions: ["0x1"], confidential: false });
    const s1 = new FileReceiptStore(path);
    await s1.put(await mk("rcpt_1"));
    await s1.put(await mk("rcpt_2"));
    const s2 = new FileReceiptStore(path);
    expect((await s2.list()).map(r => r.id).sort()).toEqual(["rcpt_1", "rcpt_2"]);
    expect(await ReceiptSigner.verify((await s2.get("rcpt_2"))!)).toBe(true);
  });
});
