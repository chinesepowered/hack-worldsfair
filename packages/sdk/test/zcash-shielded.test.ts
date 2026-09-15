import { describe, expect, it } from "vitest";
import { payShielded, ShieldedVerifyError, verifyShieldedPayment, ZcashSettlerClient, ZcashSettlerError } from "../src/index.js";

/** A fake settler: records sends and answers /received from a list we control. */
function fakeSettler(state: { received: unknown[]; sends: unknown[]; fail?: number }) {
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (state.fail) return new Response(JSON.stringify({ error: "boom" }), { status: state.fail });
    if (url.pathname === "/send") {
      state.sends.push(JSON.parse(String(init?.body)));
      return Response.json({ txid: "ab".repeat(32) });
    }
    if (url.pathname === "/received") {
      const memo = url.searchParams.get("memo");
      const min = Number(url.searchParams.get("min_zatoshis") ?? 0);
      return Response.json({ received: (state.received as Array<{ memo: string; zatoshis: number }>).filter(o => (!memo || o.memo === memo) && o.zatoshis >= min) });
    }
    return Response.json({ ok: true, network: "Test" });
  };
  return new ZcashSettlerClient("http://settler.local", fetchImpl);
}

describe("zcash shielded rail (fake settler)", () => {
  it("sends with the payment id as memo", async () => {
    const state = { received: [], sends: [] as Array<{ address: string; zatoshis: number; memo: string }> };
    const proof = await payShielded({ settler: fakeSettler(state), address: "utest1abc", zatoshis: 12_345n, paymentId: "pay_x" });
    expect(proof).toEqual({ txid: "ab".repeat(32), paymentId: "pay_x" });
    expect(state.sends[0]).toEqual({ address: "utest1abc", zatoshis: 12345, memo: "pay_x" });
  });

  it("verifies by memo and minimum value, and distinguishes unmined from missing", async () => {
    const state = { received: [{ txid: "t1", mined_height: null, block_time: null, zatoshis: 20_000, pool: "orchard", memo: "pay_x" }], sends: [] };
    const s = fakeSettler(state);
    await expect(verifyShieldedPayment({ settler: s, paymentId: "pay_x", minZatoshis: 20_000n })).resolves.toMatchObject({ txid: "t1" });
    await expect(verifyShieldedPayment({ settler: s, paymentId: "pay_x", minZatoshis: 20_001n })).rejects.toMatchObject({ code: "payment_not_found" });
    await expect(verifyShieldedPayment({ settler: s, paymentId: "pay_other", minZatoshis: 1n })).rejects.toBeInstanceOf(ShieldedVerifyError);
    await expect(verifyShieldedPayment({ settler: s, paymentId: "pay_x", minZatoshis: 1n, requireMined: true })).rejects.toMatchObject({ code: "not_mined_yet" });
    (state.received[0] as { mined_height: number | null }).mined_height = 4_350_000;
    await expect(verifyShieldedPayment({ settler: s, paymentId: "pay_x", minZatoshis: 1n, requireMined: true })).resolves.toMatchObject({ mined_height: 4_350_000 });
  });

  it("surfaces settler errors with status codes", async () => {
    await expect(fakeSettler({ received: [], sends: [], fail: 403 }).send({ address: "u", zatoshis: 1 })).rejects.toMatchObject({ status: 403, name: "ZcashSettlerError" });
    expect(new ZcashSettlerError(500, "x")).toBeInstanceOf(Error);
  });
});

describe.skipIf(!process.env.ZCASH_SETTLER_URL)("zcash settler (live)", () => {
  it("reports health, an address, and a balance", async () => {
    const s = new ZcashSettlerClient(process.env.ZCASH_SETTLER_URL!);
    expect((await s.health()).ok).toBe(true);
    expect((await s.address()).address).toMatch(/^u(test)?1[a-z0-9]+$/);
    expect((await s.balance()).chain_tip_height).toBeGreaterThan(0);
  });
});
