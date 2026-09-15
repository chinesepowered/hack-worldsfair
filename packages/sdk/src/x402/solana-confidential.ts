/**
 * x402 v2 scheme `confidential` on Solana: client, server, and facilitator halves, plus an in-process
 * facilitator client so a payee can verify its own payments without a third party.
 *
 * Payload: `{ transferSignature, proofSignatures, paymentId }` (proof-of-payment — the payer settles).
 * The payment id is also echoed through the standard `payment-identifier` extension.
 */
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import type { Address, MessagePartialSigner, TransactionSigner } from "@solana/kit";

/** A signer that can both sign transactions and derive confidential keys (a KeyPairSigner qualifies). */
export type ConfidentialSigner = TransactionSigner & MessagePartialSigner;
import type { x402Facilitator } from "@x402/core/facilitator";
import type { FacilitatorClient } from "@x402/core/server";
import type {
  AssetAmount,
  Network,
  PaymentPayload,
  PaymentPayloadContext,
  PaymentPayloadResult,
  PaymentRequirements,
  Price,
  SchemeNetworkClient,
  SchemeNetworkFacilitator,
  SchemeNetworkServer,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { appendPaymentIdentifierToExtensions } from "@x402/extensions";
import { newPaymentId } from "../receipts/index.js";
import { deriveConfidentialKeys, type ConfidentialKeys } from "../rails/solana-confidential/keys.js";
import { payConfidential, type ConfidentialPayerClient } from "../rails/solana-confidential/payer.js";
import { verifyConfidentialPayment, VerifyError } from "../rails/solana-confidential/verifier.js";

export const CONFIDENTIAL_SCHEME = "confidential";

export type ConfidentialSvmPayload = {
  transferSignature: string;
  proofSignatures: string[];
  paymentId: string;
};

// ---------------------------------------------------------------------------------------------
// client
// ---------------------------------------------------------------------------------------------

export type ConfidentialSvmClientConfig = {
  client: ConfidentialPayerClient;
  /** Pays fees and owns the source token account. */
  signer: ConfidentialSigner;
  /** Optional hook to observe the payment id before the transfer is sent (policy/receipts). */
  onPayment?: (info: { paymentId: string; requirements: PaymentRequirements }) => void | Promise<void>;
};

export class ConfidentialSvmClientScheme implements SchemeNetworkClient {
  readonly scheme = CONFIDENTIAL_SCHEME;
  private readonly keys = new Map<string, Promise<ConfidentialKeys>>();
  constructor(private readonly cfg: ConfidentialSvmClientConfig) {}

  private keysFor(mint: Address): Promise<ConfidentialKeys> {
    let k = this.keys.get(mint);
    if (!k) {
      k = deriveConfidentialKeys(this.cfg.signer, mint);
      this.keys.set(mint, k);
    }
    return k;
  }

  async createPaymentPayload(x402Version: number, requirements: PaymentRequirements, _context?: PaymentPayloadContext): Promise<PaymentPayloadResult> {
    const mint = requirements.asset as Address;
    const paymentId = newPaymentId();
    await this.cfg.onPayment?.({ paymentId, requirements });
    const proof = await payConfidential({
      client: this.cfg.client,
      payer: this.cfg.signer,
      authority: this.cfg.signer,
      keys: await this.keysFor(mint),
      mint,
      destinationOwner: requirements.payTo as Address,
      amount: BigInt(requirements.amount),
      paymentId,
    });
    const payload: ConfidentialSvmPayload = { transferSignature: proof.transferSignature, proofSignatures: proof.proofSignatures, paymentId };
    return { x402Version, payload, extensions: appendPaymentIdentifierToExtensions({}, paymentId) };
  }
}

// ---------------------------------------------------------------------------------------------
// server (resource server half: prices → amounts)
// ---------------------------------------------------------------------------------------------

export type ConfidentialSvmServerConfig = {
  /** The dollar-denominated mint used when a route prices in money ("$0.10"). */
  usdMint?: { mint: Address; decimals: number };
  decimalsByMint?: Record<string, number>;
};

export class ConfidentialSvmServerScheme implements SchemeNetworkServer {
  readonly scheme = CONFIDENTIAL_SCHEME;
  /** Proof-of-payment: the payer settles before presenting the payload, so the only flow is "upfront". */
  readonly defaultAssetTransferMethod = "default";
  readonly paymentFlows = { default: { supported: ["upfront"], default: "upfront" } } as const;
  constructor(private readonly cfg: ConfidentialSvmServerConfig = {}) {}

  async parsePrice(price: Price, _network: Network): Promise<AssetAmount> {
    if (typeof price === "object") return price;
    const usd = typeof price === "number" ? price : Number(String(price).replace(/^\$/, ""));
    if (!Number.isFinite(usd) || usd < 0) throw new Error(`invalid price: ${String(price)}`);
    if (!this.cfg.usdMint) throw new Error("confidential scheme: a usdMint is required to price routes in dollars");
    const { mint, decimals } = this.cfg.usdMint;
    return { asset: mint, amount: BigInt(Math.round(usd * 10 ** decimals)).toString() };
  }

  getAssetDecimals(asset: string, _network: Network): number {
    if (this.cfg.usdMint && asset === this.cfg.usdMint.mint) return this.cfg.usdMint.decimals;
    const d = this.cfg.decimalsByMint?.[asset];
    if (d === undefined) throw new Error(`unknown decimals for mint ${asset}`);
    return d;
  }

  async enhancePaymentRequirements(requirements: PaymentRequirements): Promise<PaymentRequirements> {
    return { ...requirements, extra: { ...requirements.extra, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS, confidential: true } };
  }
}

// ---------------------------------------------------------------------------------------------
// facilitator (payee-run verifier)
// ---------------------------------------------------------------------------------------------

export type ConfidentialSvmFacilitatorConfig = {
  rpcUrl: string;
  /** The payee's signer — its confidential keys are derived per mint, exactly as the wallet does. */
  payee: ConfidentialSigner;
};

export class ConfidentialSvmFacilitatorScheme implements SchemeNetworkFacilitator {
  readonly scheme = CONFIDENTIAL_SCHEME;
  readonly caipFamily = "solana:*";
  private readonly keys = new Map<string, Promise<ConfidentialKeys>>();
  constructor(private readonly cfg: ConfidentialSvmFacilitatorConfig) {}

  getExtra(_network: Network): Record<string, unknown> | undefined { return undefined; }
  getSigners(_network: string): string[] { return []; }

  private keysFor(mint: Address): Promise<ConfidentialKeys> {
    let k = this.keys.get(mint);
    if (!k) {
      k = deriveConfidentialKeys(this.cfg.payee, mint);
      this.keys.set(mint, k);
    }
    return k;
  }

  async verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    const p = payload.payload as Partial<ConfidentialSvmPayload>;
    if (payload.accepted.scheme !== CONFIDENTIAL_SCHEME || requirements.scheme !== CONFIDENTIAL_SCHEME) return invalid("unsupported_scheme");
    if (payload.accepted.network !== requirements.network) return invalid("network_mismatch");
    if (typeof p.transferSignature !== "string" || !Array.isArray(p.proofSignatures) || typeof p.paymentId !== "string") return invalid("invalid_confidential_payload");
    if (requirements.payTo !== this.cfg.payee.address) return invalid("pay_to_is_not_this_facilitator");
    const mint = requirements.asset as Address;
    const keys = await this.keysFor(mint);
    const [destinationToken] = await findAssociatedTokenPda({ mint, owner: this.cfg.payee.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
    try {
      const v = await verifyConfidentialPayment({
        rpc: this.cfg.rpcUrl,
        transferSignature: p.transferSignature,
        proofSignatures: p.proofSignatures,
        paymentId: p.paymentId,
        destinationToken,
        elgamalSecret: keys.elgamalSecretKey,
        elgamalPubkey: keys.elgamalPubkey,
        role: "payee",
        minAmount: BigInt(requirements.amount),
      });
      if (v.mint !== mint) return invalid("asset_mismatch");
      return { isValid: true, payer: v.sourceToken };
    } catch (e) {
      return invalid(e instanceof VerifyError ? e.code : `verification_error: ${(e as Error).message}`);
    }
  }

  /** The payer already settled on-chain; settlement here is verification plus the receipt. */
  async settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    const v = await this.verify(payload, requirements);
    const p = payload.payload as ConfidentialSvmPayload;
    if (!v.isValid) return { success: false, errorReason: v.invalidReason, transaction: "", network: requirements.network, payer: v.payer };
    return { success: true, transaction: p.transferSignature, network: requirements.network, payer: v.payer, amount: requirements.amount };
  }
}

function invalid(reason: string): VerifyResponse {
  return { isValid: false, invalidReason: reason, payer: "" };
}

// ---------------------------------------------------------------------------------------------
// in-process facilitator client
// ---------------------------------------------------------------------------------------------

/** Lets an `x402ResourceServer` talk to an `x402Facilitator` in the same process — no HTTP hop, no third party. */
export class LocalFacilitatorClient implements FacilitatorClient {
  constructor(private readonly facilitator: x402Facilitator) {}
  verify(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<VerifyResponse> {
    return this.facilitator.verify(paymentPayload, paymentRequirements);
  }
  settle(paymentPayload: PaymentPayload, paymentRequirements: PaymentRequirements): Promise<SettleResponse> {
    return this.facilitator.settle(paymentPayload, paymentRequirements);
  }
  async getSupported(): Promise<SupportedResponse> {
    return this.facilitator.getSupported() as unknown as SupportedResponse;
  }
}
