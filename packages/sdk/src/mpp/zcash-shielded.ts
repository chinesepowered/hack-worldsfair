/** MPP method `zcash-shielded`: pay a challenge with a shielded Zcash note whose memo is the challenge id. */
import { Credential, Method, Receipt, z } from "mppx";
import { payShielded, verifyShieldedPayment, type ZcashSettlerClient } from "../rails/zcash-shielded/index.js";

export const ZCASH_SHIELDED_METHOD = "zcash-shielded";

export const zcashShielded = Method.from({
  name: ZCASH_SHIELDED_METHOD,
  intent: "charge",
  schema: {
    credential: { payload: z.object({ txid: z.string(), paymentId: z.string() }) },
    request: z.object({
      /** Amount in zatoshis, as a decimal string. */
      zatoshis: z.string(),
      /** Payee unified address. */
      recipient: z.string(),
      network: z.string(),
    }),
  },
});

export function zcashShieldedClient(cfg: { settler: ZcashSettlerClient; onPayment?: (info: { paymentId: string; request: { zatoshis: string; recipient: string; network: string } }) => void | Promise<void> }) {
  return Method.toClient(zcashShielded, {
    async createCredential({ challenge }) {
      const r = challenge.request;
      const paymentId = challenge.id;
      await cfg.onPayment?.({ paymentId, request: r });
      const proof = await payShielded({ settler: cfg.settler, address: r.recipient, zatoshis: BigInt(r.zatoshis), paymentId });
      return Credential.serialize({ challenge, payload: { txid: proof.txid, paymentId } });
    },
  });
}

export function zcashShieldedServer(cfg: { settler: ZcashSettlerClient; address: string; network: string; waitMs?: number; requireMined?: boolean }) {
  return Method.toServer(zcashShielded, {
    defaults: { recipient: cfg.address, network: cfg.network },
    async broadcast({ credential, request }) {
      const p = credential.payload;
      if (p.paymentId !== credential.challenge.id) throw new Error("payment id does not match the challenge");
      const out = await verifyShieldedPayment({ settler: cfg.settler, paymentId: p.paymentId, minZatoshis: BigInt(request.zatoshis), txid: p.txid, waitMs: cfg.waitMs ?? 0, requireMined: cfg.requireMined ?? false });
      return Receipt.from({ method: ZCASH_SHIELDED_METHOD, reference: out.txid, status: "success", timestamp: new Date().toISOString() });
    },
  });
}
