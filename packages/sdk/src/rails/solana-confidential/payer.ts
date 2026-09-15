/**
 * Payer side of the Solana `confidential` rail: a Token-2022 confidential transfer whose range proof is
 * staged in an SPL Record account, with the payment id in a Memo instruction on the transfer transaction.
 */
import { fetchToken, findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { getConfidentialTransferWithRecordInstructionPlan } from "@solana-program/token-2022/confidential";
import { getAddMemoInstruction } from "@solana-program/memo";
import {
  nonDivisibleSequentialInstructionPlan,
  singleInstructionPlan,
  type Address,
  type GetAccountInfoApi,
  type GetMinimumBalanceForRentExemptionApi,
  type InstructionPlan,
  type Rpc,
  type TransactionPlanResult,
  type TransactionSigner,
} from "@solana/kit";
import type { ConfidentialKeys } from "./keys.js";

/** The subset of a kit client we need: an RPC and a way to run a multi-transaction plan. */
export type ConfidentialPayerClient = {
  rpc: Rpc<GetAccountInfoApi & GetMinimumBalanceForRentExemptionApi>;
  sendTransactions(plan: InstructionPlan): Promise<TransactionPlanResult>;
};

export type ConfidentialPaymentProof = {
  /** Transaction carrying the ConfidentialTransfer instruction and the memo. */
  transferSignature: string;
  /** Every other transaction in the plan (proof context creation, record writes, closes). */
  proofSignatures: string[];
  paymentId: string;
};

export async function payConfidential(args: {
  client: ConfidentialPayerClient;
  payer: TransactionSigner;
  authority: TransactionSigner;
  keys: ConfidentialKeys;
  mint: Address;
  /** Payee's token account, or its owner (we resolve the ATA). */
  destinationToken?: Address;
  destinationOwner?: Address;
  amount: bigint;
  paymentId: string;
}): Promise<ConfidentialPaymentProof> {
  const { client, payer, authority, keys, mint, amount, paymentId } = args;
  const [sourceToken] = await findAssociatedTokenPda({ mint, owner: authority.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
  const destinationToken =
    args.destinationToken ??
    (await findAssociatedTokenPda({ mint, owner: args.destinationOwner!, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS }))[0];
  const [sourceAccount, destinationAccount] = await Promise.all([fetchToken(client.rpc, sourceToken), fetchToken(client.rpc, destinationToken)]);

  const transferPlan = await getConfidentialTransferWithRecordInstructionPlan({
    sourceToken, mint, destinationToken,
    sourceTokenAccount: sourceAccount.data, destinationTokenAccount: destinationAccount.data,
    authority, amount, sourceElgamalKeypair: keys.elgamalKeypair, aesKey: keys.aesKey, payer, rpc: client.rpc,
  });
  // The memo must ride on the same transaction as the transfer — append it to the plan's last leaf.
  const plan = appendToLastLeaf(transferPlan, singleInstructionPlan(getAddMemoInstruction({ memo: paymentId, signers: [authority] })));
  const result = await client.sendTransactions(plan);
  const signatures = collectSignatures(result);
  if (signatures.length === 0) throw new Error("confidential transfer produced no signatures");
  const transferSignature = signatures[signatures.length - 1]!;
  return { transferSignature, proofSignatures: signatures.slice(0, -1), paymentId };
}

/** Append `extra` to the final single-transaction leaf of `plan`, so it lands in the same transaction. */
export function appendToLastLeaf(plan: InstructionPlan, extra: InstructionPlan): InstructionPlan {
  if (plan.kind === "sequential") {
    const plans = [...plan.plans];
    plans[plans.length - 1] = appendToLastLeaf(plans[plans.length - 1]!, extra);
    return { ...plan, plans };
  }
  // A single leaf (or a parallel group) gets wrapped in a non-divisible sequence with the extra plan.
  return nonDivisibleSequentialInstructionPlan([plan, extra]);
}

/** Signatures of every executed transaction in a plan result, in execution order. */
export function collectSignatures(result: unknown): string[] {
  const out: string[] = [];
  const walk = (r: unknown) => {
    if (!r || typeof r !== "object") return;
    const o = r as Record<string, unknown>;
    const ctx = o.context as Record<string, unknown> | undefined;
    if (ctx && typeof ctx.signature === "string") out.push(ctx.signature);
    if (Array.isArray(o.plans)) o.plans.forEach(walk);
  };
  walk(result);
  return out;
}
