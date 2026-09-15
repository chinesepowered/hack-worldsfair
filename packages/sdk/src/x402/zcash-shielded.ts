/**
 * x402 v2 scheme `shielded` on Zcash: the payer's settler sends a shielded note whose encrypted memo is
 * the payment id; the payee's viewing-key settler finds it. Payload: `{ txid, paymentId }`.
 * Amounts are zatoshis; `asset` is the literal "ZEC"; `payTo` is the payee's unified address.
 */
import type { PaymentPayload, PaymentPayloadResult, PaymentRequirements, Price, AssetAmount, Network, SchemeNetworkClient, SchemeNetworkFacilitator, SchemeNetworkServer, SettleResponse, VerifyResponse } from "@x402/core/types";
import { appendPaymentIdentifierToExtensions } from "@x402/extensions";
import { newPaymentId } from "../receipts/index.js";
import { payShielded, ShieldedVerifyError, verifyShieldedPayment, ZcashSettlerClient } from "../rails/zcash-shielded/index.js";

export const SHIELDED_SCHEME = "shielded";
export const ZEC_ASSET = "ZEC";
export const ZEC_DECIMALS = 8;
export const ZCASH_TESTNET: Network = "zcash:testnet";
export const ZCASH_MAINNET: Network = "zcash:mainnet";

export type ShieldedZcashPayload = { txid: string; paymentId: string };

export class ShieldedZcashClientScheme implements SchemeNetworkClient {
  readonly scheme = SHIELDED_SCHEME;
  constructor(private readonly cfg: { settler: ZcashSettlerClient; onPayment?: (info: { paymentId: string; requirements: PaymentRequirements }) => void | Promise<void> }) {}
  async createPaymentPayload(x402Version: number, requirements: PaymentRequirements): Promise<PaymentPayloadResult> {
    const paymentId = newPaymentId();
    await this.cfg.onPayment?.({ paymentId, requirements });
    const proof = await payShielded({ settler: this.cfg.settler, address: requirements.payTo, zatoshis: BigInt(requirements.amount), paymentId });
    const payload: ShieldedZcashPayload = { txid: proof.txid, paymentId };
    return { x402Version, payload, extensions: appendPaymentIdentifierToExtensions({}, paymentId) };
  }
}

export class ShieldedZcashServerScheme implements SchemeNetworkServer {
  readonly scheme = SHIELDED_SCHEME;
  readonly defaultAssetTransferMethod = "default";
  readonly paymentFlows = { default: { supported: ["upfront"], default: "upfront" } } as const;
  /** Dollar prices need a ZEC price; supply one or price routes in ZEC (`{ asset: "ZEC", amount: "<zatoshis>" }`). */
  constructor(private readonly cfg: { zecPriceUsd?: number } = {}) {}
  async parsePrice(price: Price, _network: Network): Promise<AssetAmount> {
    if (typeof price === "object") return price;
    const usd = typeof price === "number" ? price : Number(String(price).replace(/^\$/, ""));
    if (!Number.isFinite(usd) || usd < 0) throw new Error(`invalid price: ${String(price)}`);
    if (!this.cfg.zecPriceUsd) throw new Error("shielded scheme: zecPriceUsd is required to price routes in dollars");
    return { asset: ZEC_ASSET, amount: BigInt(Math.ceil((usd / this.cfg.zecPriceUsd) * 10 ** ZEC_DECIMALS)).toString() };
  }
  getAssetDecimals(_asset: string, _network: Network): number { return ZEC_DECIMALS; }
  async enhancePaymentRequirements(r: PaymentRequirements): Promise<PaymentRequirements> {
    return { ...r, extra: { ...r.extra, shielded: true, memoCarriesPaymentId: true } };
  }
}

export class ShieldedZcashFacilitatorScheme implements SchemeNetworkFacilitator {
  readonly scheme = SHIELDED_SCHEME;
  readonly caipFamily = "zcash:*";
  constructor(private readonly cfg: { settler: ZcashSettlerClient; address: string; waitMs?: number; requireMined?: boolean }) {}
  getExtra(_network: Network) { return undefined; }
  getSigners(_network: string): string[] { return []; }
  async verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    const p = payload.payload as Partial<ShieldedZcashPayload>;
    if (payload.accepted.scheme !== SHIELDED_SCHEME || requirements.scheme !== SHIELDED_SCHEME) return invalid("unsupported_scheme");
    if (payload.accepted.network !== requirements.network) return invalid("network_mismatch");
    if (typeof p.txid !== "string" || typeof p.paymentId !== "string") return invalid("invalid_shielded_payload");
    if (requirements.payTo !== this.cfg.address) return invalid("pay_to_is_not_this_facilitator");
    try {
      await verifyShieldedPayment({ settler: this.cfg.settler, paymentId: p.paymentId, minZatoshis: BigInt(requirements.amount), txid: p.txid, waitMs: this.cfg.waitMs ?? 0, requireMined: this.cfg.requireMined ?? false });
      return { isValid: true, payer: "shielded" };
    } catch (e) {
      return invalid(e instanceof ShieldedVerifyError ? e.code : `verification_error: ${(e as Error).message}`);
    }
  }
  async settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    const v = await this.verify(payload, requirements);
    const p = payload.payload as ShieldedZcashPayload;
    if (!v.isValid) return { success: false, errorReason: v.invalidReason, transaction: "", network: requirements.network, payer: v.payer };
    return { success: true, transaction: p.txid, network: requirements.network, payer: v.payer, amount: requirements.amount };
  }
}
function invalid(reason: string): VerifyResponse { return { isValid: false, invalidReason: reason, payer: "" }; }
