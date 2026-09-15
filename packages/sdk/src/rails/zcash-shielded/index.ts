/**
 * Zcash `shielded` rail. Payer: ask its settler to send to the payee's unified address with the payment
 * id as the encrypted memo. Payee: ask its (viewing-key-only) settler whether a received output carries
 * that memo with at least the required value — first in the mempool, then mined.
 */
import { ZcashSettlerClient, type ReceivedOutput } from "./settler-client.js";
export * from "./settler-client.js";

export type ShieldedPaymentProof = { txid: string; paymentId: string };

export async function payShielded(args: { settler: ZcashSettlerClient; address: string; zatoshis: bigint; paymentId: string }): Promise<ShieldedPaymentProof> {
  const { txid } = await args.settler.send({ address: args.address, zatoshis: args.zatoshis, memo: args.paymentId });
  return { txid, paymentId: args.paymentId };
}

export type VerifyShieldedArgs = {
  settler: ZcashSettlerClient;
  paymentId: string;
  minZatoshis: bigint;
  txid?: string;
  /** Require the output to be mined (default: false — a mempool/unmined note is accepted for low-value payments). */
  requireMined?: boolean;
  /** Poll until found or this many ms elapse (default 0 = single check). */
  waitMs?: number;
  pollIntervalMs?: number;
};

export async function verifyShieldedPayment(a: VerifyShieldedArgs): Promise<ReceivedOutput> {
  const deadline = Date.now() + (a.waitMs ?? 0);
  const interval = a.pollIntervalMs ?? 3000;
  for (;;) {
    const outputs = await a.settler.received({ memo: a.paymentId, minZatoshis: a.minZatoshis, sync: true });
    const match = outputs.find(o => (!a.txid || o.txid === a.txid) && (!a.requireMined || o.mined_height !== null));
    if (match) return match;
    if (Date.now() >= deadline) throw new ShieldedVerifyError(outputs.length ? "not_mined_yet" : "payment_not_found", a.paymentId);
    await new Promise(r => setTimeout(r, interval));
  }
}

export class ShieldedVerifyError extends Error {
  constructor(readonly code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ShieldedVerifyError";
  }
}
