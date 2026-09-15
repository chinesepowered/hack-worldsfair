/** Spawns the built server over stdio and drives it with the MCP client: budget, a paid fetch, receipts, the kill switch. */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import express from "express";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SottoServer } from "@sotto/sdk";
import { haveLocalValidator, RPC_URL, setupConfidentialMint } from "../../sdk/test/helpers/solana.js";

const NETWORK = "solana:localnet";

describe.skipIf(!haveLocalValidator)("sotto-mcp-server over stdio (local validator)", () => {
  it("lists tools, reports the budget, pays for a resource, shows the receipt, and pauses", async () => {
    const fx = await setupConfidentialMint({ fund: 10_000_000n });
    const server = SottoServer.create({ secretKey: "test-secret-key-at-least-32-bytes-long-0000", solana: { rpcUrl: RPC_URL, payee: fx.bob, usdMint: { mint: fx.mint, decimals: fx.decimals }, network: NETWORK } });
    const app = express();
    app.use(server.protect({ "GET /premium": { price: "$0.30" } }));
    app.get("/premium", (_q, s) => { s.json({ data: "the premium data" }); });
    app.get("/free", (_q, s) => { s.json({ free: true }); });
    const http = app.listen(0, "127.0.0.1"); await new Promise<void>(r => http.once("listening", r));
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

    const transport = new StdioClientTransport({
      command: "node",
      args: [join(process.cwd(), "dist/index.js")],
      env: {
        ...(process.env as Record<string, string>),
        SOTTO_AGENT_ID: "mcp-agent",
        SOTTO_POLICY: JSON.stringify({ maxPerPaymentUsd: 0.5, perDayUsd: 0.5, allowHosts: ["127.0.0.1"] }),
        SOTTO_STATE_DIR: mkdtempSync(join(tmpdir(), "sotto-mcp-")),
        SOTTO_SOLANA_RPC_URL: RPC_URL, SOTTO_SOLANA_KEYFILE: process.env.SOLANA_PAYER_KEYFILE!, SOTTO_SOLANA_NETWORK: NETWORK,
        SOTTO_SOLANA_MINTS: JSON.stringify([{ mint: fx.mint, decimals: fx.decimals }]),
      },
      stderr: "pipe",
    });
    const mcp = new Client({ name: "test-client", version: "0.0.0" });
    await mcp.connect(transport);
    try {
      const tools = (await mcp.listTools()).tools.map(t => t.name).sort();
      expect(tools).toEqual(["sotto_budget", "sotto_decisions", "sotto_fetch", "sotto_receipts", "sotto_set_paused"]);

      const budget = await mcp.callTool({ name: "sotto_budget", arguments: {} });
      expect(budget.structuredContent).toMatchObject({ agentId: "mcp-agent", paused: false, maxPerPaymentUsd: "$0.5", remainingUsd: { day: "$0.5" } });

      const free = await mcp.callTool({ name: "sotto_fetch", arguments: { url: `${base}/free` } });
      expect(free.structuredContent).toMatchObject({ status: 200, body: '{"free":true}' });
      expect((free.structuredContent as { payment?: unknown }).payment).toBeUndefined();

      const paid = await mcp.callTool({ name: "sotto_fetch", arguments: { url: `${base}/premium` } });
      expect(paid.isError).toBeFalsy();
      const sc = paid.structuredContent as { status: number; body: string; payment: { amount: string; usd: string; confidential: boolean; transactions: string[] } };
      expect(sc.status).toBe(200);
      expect(JSON.parse(sc.body)).toEqual({ data: "the premium data" });
      expect(sc.payment).toMatchObject({ amount: "300000", usd: "$0.3", confidential: true });
      expect(sc.payment.transactions[0]).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);

      const receipts = await mcp.callTool({ name: "sotto_receipts", arguments: {} });
      expect(receipts.structuredContent).toMatchObject({ total: 1 });

      // the daily budget ($0.50) can't take another $0.30 — an actionable error, not a payment
      const denied = await mcp.callTool({ name: "sotto_fetch", arguments: { url: `${base}/premium` } });
      expect(denied.isError).toBe(true);
      expect(String((denied.content as Array<{ text: string }>)[0]!.text)).toMatch(/daily budget/);
      const decisions = await mcp.callTool({ name: "sotto_decisions", arguments: {} });
      expect((decisions.structuredContent as { decisions: Array<{ allowed: boolean }> }).decisions[0]).toMatchObject({ allowed: false });

      const paused = await mcp.callTool({ name: "sotto_set_paused", arguments: { paused: true } });
      expect(paused.structuredContent).toEqual({ paused: true });
      expect((await mcp.callTool({ name: "sotto_budget", arguments: {} })).structuredContent).toMatchObject({ paused: true });
    } finally {
      await mcp.close();
      http.close();
    }
  }, 240_000);
});
