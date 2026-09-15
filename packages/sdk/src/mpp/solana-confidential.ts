/**
 * MPP (Machine Payments Protocol) method `solana-confidential`: the same rail as the x402 scheme, worn
 * as an MPP payment method so agents that speak MPP (Tempo's ecosystem) can pay confidentially on Solana.
 *
 * The challenge id is the payment id: it goes into the transfer's memo, so a credential can only ever
 * satisfy the exact challenge it was created for.
 */
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import type { Address } from "@solana/kit";
import { Credential, Method, Receipt, z } from "mppx";
import { parseUnits } from "viem";
import { deriveConfidentialKeys, type ConfidentialKeys } from "../rails/solana-confidential/keys.js";
import { payConfidential, type ConfidentialPayerClient } from "../rails/solana-confidential/payer.js";
import { verifyConfidentialPayment } from "../rails/solana-confidential/verifier.js";
import type { ConfidentialSigner } from "../x402/solana-confidential.js";

export const SOLANA_CONFIDENTIAL_METHOD = "solana-confidential";

export const solanaConfidential = Method.from({
  name: SOLANA_CONFIDENTIAL_METHOD,
  intent: "charge",
  schema: {
    credential: {
      payload: z.object({
        transferSignature: z.string(),
        proofSignatures: z.array(z.string()),
        paymentId: z.string(),
      }),
    },
    request: z.object({
      /** Decimal amount in whole tokens, e.g. "0.25". */
      amount: z.string(),
      mint: z.string(),
      /** Payee wallet address (its confidential ATA is derived). */
      recipient: z.string(),
      network: z.string(),
      decimals: z.number(),
    }),
  },
});

export type SolanaConfidentialClientConfig = {
  client: ConfidentialPayerClient;
  signer: ConfidentialSigner;
  onPayment?: (info: { paymentId: string; request: { amount: string; mint: string; recipient: string; network: string } }) => void | Promise<void>;
};

/** Client half: pays the challenge on Solana and returns a serialized credential. */
export function solanaConfidentialClient(cfg: SolanaConfidentialClientConfig) {
  const keys = new Map<string, Promise<ConfidentialKeys>>();
  const keysFor = (mint: Address) => {
    let k = keys.get(mint);
    if (!k) { k = deriveConfidentialKeys(cfg.signer, mint); keys.set(mint, k); }
    return k;
  };
  return Method.toClient(solanaConfidential, {
    async createCredential({ challenge }) {
      const r = challenge.request;
      const mint = r.mint as Address;
      const paymentId = challenge.id;
      await cfg.onPayment?.({ paymentId, request: r });
      const proof = await payConfidential({
        client: cfg.client, payer: cfg.signer, authority: cfg.signer, keys: await keysFor(mint), mint,
        destinationOwner: r.recipient as Address, amount: parseUnits(r.amount, r.decimals), paymentId,
      });
      return Credential.serialize({ challenge, payload: { transferSignature: proof.transferSignature, proofSignatures: proof.proofSignatures, paymentId } });
    },
  });
}

export type SolanaConfidentialServerConfig = {
  rpcUrl: string;
  payee: ConfidentialSigner;
  mint: Address;
  decimals: number;
  network: string;
};

/** Server half: verifies the on-chain payment from the ledger and issues a receipt. */
export function solanaConfidentialServer(cfg: SolanaConfidentialServerConfig) {
  const keys = deriveConfidentialKeys(cfg.payee, cfg.mint);
  return Method.toServer(solanaConfidential, {
    defaults: { mint: cfg.mint, recipient: cfg.payee.address, network: cfg.network, decimals: cfg.decimals },
    async broadcast({ credential, request }) {
      const p = credential.payload;
      if (p.paymentId !== credential.challenge.id) throw new Error("payment id does not match the challenge");
      const k = await keys;
      const [destinationToken] = await findAssociatedTokenPda({ mint: cfg.mint, owner: cfg.payee.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
      const v = await verifyConfidentialPayment({
        rpc: cfg.rpcUrl,
        transferSignature: p.transferSignature,
        proofSignatures: p.proofSignatures,
        paymentId: p.paymentId,
        destinationToken,
        elgamalSecret: k.elgamalSecretKey,
        elgamalPubkey: k.elgamalPubkey,
        role: "payee",
        minAmount: parseUnits(request.amount, request.decimals ?? cfg.decimals),
      });
      if (v.mint !== cfg.mint) throw new Error("asset mismatch");
      return Receipt.from({ method: SOLANA_CONFIDENTIAL_METHOD, reference: v.transferSignature, status: "success", timestamp: new Date().toISOString() });
    },
  });
}
