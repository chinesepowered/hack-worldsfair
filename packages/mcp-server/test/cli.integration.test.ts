/** Runs the built `sotto` CLI as a subprocess against a paywalled route: budgets persist across invocations and the kill switch holds. */
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import express from "express";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SottoServer } from "@sotto/sdk";
import { haveLocalValidator, RPC_URL, setupConfidentialMint } from "../../sdk/test/helpers/solana.js";

const NETWORK = "solana:localnet";
type Run = { code: number; stdout: string; stderr: string };
const sotto = (env: NodeJS.ProcessEnv, ...args: string[]) =>
  new Promise<Run>(resolve => {
    execFile("node", [join(process.cwd(), "dist/cli.js"), ...args], { env, encoding: "utf8", timeout: 120_000 }, (err, stdout, stderr) =>
      resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, stdout, stderr }));
  });

describe.skipIf(!haveLocalValidator)("sotto CLI (local validator)", () => {
  it("pays within policy, keeps the budget across processes, and honours the kill switch", async () => {
    const fx = await setupConfidentialMint({ fund: 10_000_000n });
    const server = SottoServer.create({ secretKey: "test-secret-key-at-least-32-bytes-long-0000", solana: { rpcUrl: RPC_URL, payee: fx.bob, usdMint: { mint: fx.mint, decimals: fx.decimals }, network: NETWORK } });
    const app = express();
    app.use(server.protect({ "GET /premium": { price: "$0.30" } }));
    app.get("/premium", (_q, s) => { s.json({ data: "the premium data" }); });
    app.get("/free", (_q, s) => { s.json({ free: true }); });
    const http = app.listen(0, "127.0.0.1"); await new Promise<void>(r => http.once("listening", r));
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      SOTTO_AGENT_ID: "cli-agent",
      SOTTO_POLICY: JSON.stringify({ maxPerPaymentUsd: 0.5, perDayUsd: 0.5, allowHosts: ["127.0.0.1"] }),
      SOTTO_STATE_DIR: mkdtempSync(join(tmpdir(), "sotto-cli-")),
      SOTTO_SOLANA_RPC_URL: RPC_URL, SOTTO_SOLANA_KEYFILE: process.env.SOLANA_PAYER_KEYFILE!, SOTTO_SOLANA_NETWORK: NETWORK,
      SOTTO_SOLANA_MINTS: JSON.stringify([{ mint: fx.mint, decimals: fx.decimals }]),
    };
    try {
      expect((await sotto(env, "help")).code).toBe(0);
      expect((await sotto(env)).code).toBe(2);

      const budget = await sotto(env, "budget", "--json");
      expect(budget.code).toBe(0);
      expect(JSON.parse(budget.stdout)).toMatchObject({ agentId: "cli-agent", paused: false, maxPerPaymentUsd: "$0.5", remainingUsd: { day: "$0.5" }, limitsUsd: { day: "$0.5" } });

      const free = await sotto(env, "fetch", `${base}/free`);
      expect(free).toMatchObject({ code: 0, stdout: '{"free":true}\n' });
      expect(free.stderr).not.toMatch(/paid/);

      const paid = await sotto(env, "fetch", `${base}/premium`, "--json");
      expect(paid.code).toBe(0);
      const r = JSON.parse(paid.stdout) as { status: number; body: string; payment: { usd: string; confidential: boolean; receiptId: string; transactions: string[] } };
      expect(r.status).toBe(200);
      expect(JSON.parse(r.body)).toEqual({ data: "the premium data" });
      expect(r.payment).toMatchObject({ usd: "$0.3", confidential: true });
      expect(r.payment.transactions[0]).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);

      // a new process reads the receipt and the spend back from the state directory
      const receipts = await sotto(env, "receipts", "--json");
      expect(JSON.parse(receipts.stdout)).toMatchObject({ total: 1, receipts: [{ id: r.payment.receiptId }] });
      expect(JSON.parse((await sotto(env, "budget", "--json")).stdout)).toMatchObject({ spentUsd: { day: "$0.3" }, remainingUsd: { day: "$0.2" } });

      // …so the daily budget ($0.50) refuses a second $0.30 even though this is a fresh process
      const denied = await sotto(env, "fetch", `${base}/premium`);
      expect(denied.code).toBe(3);
      expect(denied.stderr).toMatch(/daily budget/);
      expect((await sotto(env, "decisions")).stdout).toMatch(/denied/);

      // the kill switch persists on disk; free resources still work while paused
      expect((await sotto(env, "pause")).code).toBe(0);
      expect(JSON.parse((await sotto(env, "budget", "--json")).stdout)).toMatchObject({ paused: true });
      expect((await sotto(env, "fetch", `${base}/free`)).code).toBe(0);
      expect((await sotto(env, "resume")).code).toBe(0);
      expect(JSON.parse((await sotto(env, "budget", "--json")).stdout)).toMatchObject({ paused: false });
    } finally {
      http.close();
    }
  }, 240_000);
});
