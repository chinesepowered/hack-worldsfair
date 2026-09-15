/**
 * Spike: can a payee (or auditor) verify a confidential transfer's AMOUNT from the ledger alone?
 * Reads the spike artifact, fetches every transaction, finds the ZK ElGamal validity-proof instruction,
 * and decrypts the grouped ciphertext with the destination key (index 1) and the auditor key (index 2).
 * Run: SPIKE_ARTIFACT=... pnpm exec tsx scripts/inspect-solana-transfer.ts
 */
import { createSolanaRpc, getBase58Encoder, type Signature } from "@solana/kit";
import {
  BatchedGroupedCiphertext3HandlesValidityProofData,
  ElGamalSecretKey,
  GroupedElGamalCiphertext3Handles,
} from "@solana/zk-sdk/bundler";
import { readFileSync } from "node:fs";

const art = JSON.parse(readFileSync(process.env.SPIKE_ARTIFACT!, "utf8"));
const rpc = createSolanaRpc(art.rpcUrl);
const ZK = "ZkE1Gama1Proof11111111111111111111111111111";
const TOKEN22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const RECORD = "recr1L3PCGKLbckBqMNcJhuuyU1zgo8nBhfLVsJNwr5";
const names: Record<string, string> = { [ZK]: "zk-elgamal-proof", [TOKEN22]: "token-2022", [MEMO]: "memo", [RECORD]: "record", ComputeBudget111111111111111111111111111111: "compute-budget", "11111111111111111111111111111111": "system" };
const ZK_IX = ["CloseContextState","VerifyZeroCiphertext","VerifyCiphertextCiphertextEquality","VerifyCiphertextCommitmentEquality","VerifyPubkeyValidity","VerifyPercentageWithCap","VerifyBatchedRangeProofU64","VerifyBatchedRangeProofU128","VerifyBatchedRangeProofU256","VerifyGroupedCiphertext2HandlesValidity","VerifyBatchedGroupedCiphertext2HandlesValidity","VerifyGroupedCiphertext3HandlesValidity","VerifyBatchedGroupedCiphertext3HandlesValidity"];
const b58 = getBase58Encoder();
const bobSecret = ElGamalSecretKey.fromBytes(new Uint8Array(art.bobElGamalSecret));
const auditorSecret = ElGamalSecretKey.fromBytes(new Uint8Array(art.auditorElGamalSecret));

let found = false;
for (const [i, sig] of (art.signatures as string[]).entries()) {
  const tx = await rpc.getTransaction(sig as Signature, { encoding: "json", maxSupportedTransactionVersion: 0 }).send();
  if (!tx) { console.log(`tx#${i} ${sig.slice(0, 12)}… not found`); continue; }
  const keys = tx.transaction.message.accountKeys as string[];
  console.log(`tx#${i} ${sig.slice(0, 12)}… slot ${tx.slot} err=${tx.meta?.err ?? "none"}`);
  for (const ix of tx.transaction.message.instructions) {
    const pid = keys[ix.programIdIndex];
    const data = new Uint8Array(b58.encode(ix.data));
    let label = names[pid] ?? pid.slice(0, 8);
    if (pid === ZK) label += `:${ZK_IX[data[0]] ?? data[0]}`;
    if (pid === TOKEN22) label += `:disc=${data[0]}${data.length > 1 ? "/" + data[1] : ""}`;
    if (pid === MEMO) label += `:"${new TextDecoder().decode(data)}"`;
    console.log(`   ${label.padEnd(58)} ${String(data.length).padStart(5)} bytes  accounts=${ix.accounts.length}`);
    if (pid === ZK && data[0] === 12) {
      const proof = BatchedGroupedCiphertext3HandlesValidityProofData.fromBytes(data.slice(1));
      const ctx = proof.context().toBytes(); // 3 pubkeys (96) + lo (128) + hi (128)
      const lo = GroupedElGamalCiphertext3Handles.fromBytes(ctx.slice(96, 224));
      const hi = GroupedElGamalCiphertext3Handles.fromBytes(ctx.slice(224, 352));
      const dec = (s: ElGamalSecretKey, idx: number) => lo.decrypt(s, idx) + (hi.decrypt(s, idx) << 16n);
      const t0 = Date.now();
      const asPayee = dec(bobSecret, 1);
      const asAuditor = dec(auditorSecret, 2);
      console.log(`   → decrypted amount as payee(idx1)=${asPayee} as auditor(idx2)=${asAuditor} expected=${art.amount} (${Date.now() - t0}ms)`);
      found = true;
      console.log(asPayee.toString() === art.amount && asAuditor.toString() === art.amount ? "   PASS: amount recoverable from the ledger by payee and auditor only" : "   FAIL");
    }
  }
}
if (!found) console.log("no inline 3-handle validity proof found — verifier must use balance deltas instead");
