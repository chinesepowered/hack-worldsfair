import { describe, expect, it } from "vitest";
import { MemoryDecisionLog, PolicyEngine, PolicyViolation, StaticPriceSource, formatUsd6, hostMatches, toUsd6, usd6FromNumber } from "../src/index.js";

const usdc = { network: "eip155:42431", asset: "0x20c0000000000000000000000000000000000000", decimals: 6 };
const intent = (amount: bigint, extra: Partial<Parameters<PolicyEngine["evaluate"]>[0]> = {}) => ({
  agentId: "agent-1", resource: "https://api.example.com/data", protocol: "x402" as const, scheme: "exact", amount, ...usdc, ...extra,
});

describe("money", () => {
  it("converts atomic amounts to micro-dollars with rounding", () => {
    expect(toUsd6({ ...usdc, amount: 10_000n }, 1_000_000n)).toBe(10_000n); // $0.01 of a 6dp stablecoin
    expect(toUsd6({ network: "zcash:testnet", asset: "ZEC", decimals: 8, amount: 50_000_000n }, usd6FromNumber(40))).toBe(20_000_000n); // 0.5 ZEC @ $40
    expect(formatUsd6(1_234_500n)).toBe("$1.2345");
    expect(formatUsd6(0n)).toBe("$0");
  });
  it("matches hosts with wildcards", () => {
    expect(hostMatches("api.example.com", "*.example.com")).toBe(true);
    expect(hostMatches("example.com", "*.example.com")).toBe(false);
    expect(hostMatches("API.example.com", "api.example.com")).toBe(true);
  });
});

describe("PolicyEngine", () => {
  it("denies agents without a policy, and when paused or expired", async () => {
    const e = new PolicyEngine();
    await expect(e.authorize(intent(1n))).rejects.toBeInstanceOf(PolicyViolation);
    e.setPolicy({ agentId: "agent-1", paused: true });
    await expect(e.evaluate(intent(1n))).resolves.toMatchObject({ allowed: false, reason: "agent is paused" });
    e.setPolicy({ agentId: "agent-1", expiresAt: new Date(0) });
    await expect(e.evaluate(intent(1n))).resolves.toMatchObject({ allowed: false });
  });

  it("enforces per-payment caps and host lists", async () => {
    const e = new PolicyEngine();
    e.setPolicy({ agentId: "agent-1", maxPerPayment: 50_000n, allowHosts: ["*.example.com"], denyHosts: ["evil.example.com"] });
    await expect(e.evaluate(intent(10_000n))).resolves.toMatchObject({ allowed: true, usd6: 10_000n });
    await expect(e.evaluate(intent(60_000n))).resolves.toMatchObject({ allowed: false });
    await expect(e.evaluate(intent(1n, { resource: "https://evil.example.com/x" }))).resolves.toMatchObject({ allowed: false, reason: "host evil.example.com is denied" });
    await expect(e.evaluate(intent(1n, { resource: "https://other.org/x" }))).resolves.toMatchObject({ allowed: false });
    await expect(e.evaluate(intent(1n, { resource: "mcp://tool/search" }))).resolves.toMatchObject({ allowed: false });
  });

  it("enforces rolling budgets from the decision log", async () => {
    let t = new Date("2026-09-15T12:00:00Z");
    const log = new MemoryDecisionLog();
    const e = new PolicyEngine({ log, now: () => t });
    e.setPolicy({ agentId: "agent-1", perHour: 100_000n, perDay: 150_000n });
    const d1 = await e.authorize(intent(60_000n));
    expect(d1.remaining).toEqual({ hour: 40_000n, day: 90_000n });
    await expect(e.authorize(intent(50_000n))).rejects.toThrow(/hourly budget/);
    t = new Date(t.getTime() + 61 * 60_000); // an hour later the hourly window has rolled, the daily has not
    await expect(e.authorize(intent(50_000n))).resolves.toMatchObject({ allowed: true, remaining: { hour: 50_000n, day: 40_000n } });
    await expect(e.authorize(intent(50_000n))).rejects.toThrow(/daily budget/);
    expect((await log.list("agent-1")).filter(d => !d.allowed)).toHaveLength(2);
  });

  it("refuses unpriced assets unless told otherwise, and prices ZEC from the table", async () => {
    const zec = { network: "zcash:testnet", asset: "ZEC", decimals: 8 };
    const strict = new PolicyEngine();
    strict.setPolicy({ agentId: "agent-1", maxPerPayment: 1_000_000n });
    await expect(strict.evaluate(intent(1000n, zec))).resolves.toMatchObject({ allowed: false });
    const priced = new PolicyEngine({ prices: new StaticPriceSource([["zcash:testnet", "ZEC", 40]]) });
    priced.setPolicy({ agentId: "agent-1", maxPerPayment: 1_000_000n });
    await expect(priced.evaluate(intent(1_000_000n, zec))).resolves.toMatchObject({ allowed: true, usd6: 400_000n }); // 0.01 ZEC = $0.40
  });
});

describe("voided decisions", () => {
  it("stop counting against budgets once the payment is known not to have settled", async () => {
    const e = new PolicyEngine();
    e.setPolicy({ agentId: "agent-1", perDay: 100_000n });
    const d = await e.authorize(intent(60_000n));
    await expect(e.evaluate(intent(60_000n))).resolves.toMatchObject({ allowed: false });
    await e.voidDecision(d.id, "fetch failed");
    await expect(e.evaluate(intent(60_000n))).resolves.toMatchObject({ allowed: true });
    expect((await e.log.list("agent-1"))[0]).toMatchObject({ allowed: false, reason: "voided: fetch failed" });
  });
});
