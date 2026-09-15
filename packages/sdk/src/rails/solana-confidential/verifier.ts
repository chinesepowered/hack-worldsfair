/**
 * Payee (or auditor) side of the Solana `confidential` rail: verify a payment from the ledger alone.
 *
 *  1. The transfer transaction succeeded, contains a Token-2022 ConfidentialTransfer to *our* token
 *     account, and a Memo equal to the payment id.
 *  2. One of the proof transactions verified a batched 3-handle ciphertext-validity proof into the exact
 *     context-state account the transfer references.
 *  3. The proof context's destination (or auditor) ElGamal pubkey is ours; decrypting lo + (hi << 16)
 *     with our secret yields the amount.
 * Nothing here needs any state beyond the keys — a fresh server can verify an old payment.
 */
import { createSolanaRpc, getBase58Encoder, type Address, type Rpc, type Signature, type SolanaRpcApi } from "@solana/kit";
import { BatchedGroupedCiphertext3HandlesValidityProofData, ElGamalSecretKey, GroupedElGamalCiphertext3Handles } from "@solana/zk-sdk/bundler";
import { addressToBytes } from "./keys.js";

export const ZK_ELGAMAL_PROOF_PROGRAM = "ZkE1Gama1Proof11111111111111111111111111111" as Address;
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as Address;
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" as Address;
const ZK_IX_VERIFY_BATCHED_GROUPED_3_HANDLES_VALIDITY = 12;
const TOKEN22_IX_CONFIDENTIAL_TRANSFER_EXTENSION = 27;
const CT_SUB_IX_TRANSFER = 7;
/**
 * Account order of ConfidentialTransferInstruction::Transfer (Token-2022):
 * source, mint, destination, [instructions sysvar when any proof is inline], equality ctx, validity ctx,
 * range ctx, authority, [multisig signers…]. With every proof in a context account there is no sysvar.
 */
function transferAccountIndices(count: number) {
  const hasSysvar = count >= 8;
  const base = hasSysvar ? 4 : 3;
  return { sourceToken: 0, mint: 1, destinationToken: 2, equalityContext: base, validityContext: base + 1, rangeContext: base + 2, authority: base + 3 };
}

export type VerifyConfidentialArgs = {
  rpc: Rpc<SolanaRpcApi> | string;
  transferSignature: string;
  /** Transactions that wrote the proof context accounts. Leave empty to discover them from the ledger. */
  proofSignatures?: string[];
  paymentId: string;
  /** Our token account (the payee's), or — for an auditor — leave undefined to skip the destination check. */
  destinationToken?: Address;
  /** Our ElGamal secret: the payee's (role "payee") or the mint auditor's (role "auditor"). */
  elgamalSecret: ElGamalSecretKey;
  elgamalPubkey: Address;
  role: "payee" | "auditor";
  minAmount: bigint;
};

export type VerifiedConfidentialPayment = {
  amount: bigint;
  transferSignature: string;
  validityProofSignature: string;
  validityContextAccount: Address;
  sourceToken: Address;
  destinationToken: Address;
  mint: Address;
  slot: bigint;
};

export async function verifyConfidentialPayment(a: VerifyConfidentialArgs): Promise<VerifiedConfidentialPayment> {
  const rpc = typeof a.rpc === "string" ? createSolanaRpc(a.rpc) : a.rpc;
  const b58 = getBase58Encoder();
  const fetchTx = async (sig: string) => {
    const tx = await rpc.getTransaction(sig as Signature, { encoding: "json", maxSupportedTransactionVersion: 0 }).send();
    if (!tx) throw new VerifyError("transaction_not_found", sig);
    if (tx.meta?.err) throw new VerifyError("transaction_failed", sig);
    return tx;
  };

  // 1. the transfer transaction
  const transfer = await fetchTx(a.transferSignature);
  const keys = transfer.transaction.message.accountKeys as readonly string[];
  const ixs = transfer.transaction.message.instructions;
  const memoIx = ixs.find(ix => keys[ix.programIdIndex] === MEMO_PROGRAM);
  if (!memoIx) throw new VerifyError("memo_missing", a.transferSignature);
  const memo = new TextDecoder().decode(new Uint8Array(b58.encode(memoIx.data)));
  if (memo !== a.paymentId) throw new VerifyError("payment_id_mismatch", `memo=${memo}`);
  const transferIx = ixs.find(ix => {
    if (keys[ix.programIdIndex] !== TOKEN_2022_PROGRAM) return false;
    const d = new Uint8Array(b58.encode(ix.data));
    return d[0] === TOKEN22_IX_CONFIDENTIAL_TRANSFER_EXTENSION && d[1] === CT_SUB_IX_TRANSFER;
  });
  if (!transferIx) throw new VerifyError("confidential_transfer_missing", a.transferSignature);
  const acct = (i: number) => keys[transferIx.accounts[i]!] as Address;
  const idx = transferAccountIndices(transferIx.accounts.length);
  const sourceToken = acct(idx.sourceToken);
  const mint = acct(idx.mint);
  const destinationToken = acct(idx.destinationToken);
  const validityContextAccount = acct(idx.validityContext);
  if (a.role === "payee" && a.destinationToken && destinationToken !== a.destinationToken)
    throw new VerifyError("wrong_destination", destinationToken);

  // 2. the validity-proof transaction that wrote that context account (discoverable: the account's own history)
  let candidates = a.proofSignatures ?? [];
  if (candidates.length === 0) candidates = await discoverProofSignatures(rpc, validityContextAccount, a.transferSignature);
  let found: { sig: string; data: Uint8Array } | undefined;
  for (const sig of candidates) {
    const tx = await fetchTx(sig);
    const k = tx.transaction.message.accountKeys as readonly string[];
    for (const ix of tx.transaction.message.instructions) {
      if (k[ix.programIdIndex] !== ZK_ELGAMAL_PROOF_PROGRAM) continue;
      const d = new Uint8Array(b58.encode(ix.data));
      if (d[0] !== ZK_IX_VERIFY_BATCHED_GROUPED_3_HANDLES_VALIDITY) continue;
      if (k[ix.accounts[0]!] !== validityContextAccount) continue;
      found = { sig, data: d };
    }
    if (found) break;
  }
  if (!found) throw new VerifyError("validity_proof_not_found", validityContextAccount);

  // 3. decrypt with our key at our index
  const proof = BatchedGroupedCiphertext3HandlesValidityProofData.fromBytes(found.data.slice(1));
  const ctx = proof.context().toBytes(); // source pk | destination pk | auditor pk | lo (128) | hi (128)
  const index = a.role === "payee" ? 1 : 2;
  const expectedPk = ctx.slice(32 * index, 32 * index + 32);
  if (!bytesEqual(expectedPk, addressToBytes(a.elgamalPubkey))) throw new VerifyError("not_encrypted_to_us", a.role);
  const lo = GroupedElGamalCiphertext3Handles.fromBytes(ctx.slice(96, 224));
  const hi = GroupedElGamalCiphertext3Handles.fromBytes(ctx.slice(224, 352));
  const amount = lo.decrypt(a.elgamalSecret, index) + (hi.decrypt(a.elgamalSecret, index) << 16n);
  if (amount < a.minAmount) throw new VerifyError("insufficient_amount", `${amount} < ${a.minAmount}`);
  return { amount, transferSignature: a.transferSignature, validityProofSignature: found.sig, validityContextAccount, sourceToken, destinationToken, mint, slot: transfer.slot };
}

/** Every transaction that touched a proof context account, except the transfer itself — the ledger remembers closed accounts' history. */
export async function discoverProofSignatures(rpc: Rpc<SolanaRpcApi>, contextAccount: Address, transferSignature: string): Promise<string[]> {
  const sigs = await rpc.getSignaturesForAddress(contextAccount, { limit: 20 }).send();
  return sigs.map(s => s.signature as string).filter(s => s !== transferSignature);
}

export class VerifyError extends Error {
  constructor(readonly code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "VerifyError";
  }
}
function bytesEqual(x: Uint8Array, y: Uint8Array): boolean {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}
