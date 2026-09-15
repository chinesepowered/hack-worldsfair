/**
 * Integration test against a local validator (see CLAUDE.md for the recipe). Skipped unless
 * SOLANA_PAYER_KEYFILE and SOLANA_PAYEE_KEYFILE are set.
 */
import { describe, expect, it } from "vitest";
import { fetchToken, findAssociatedTokenPda, getConfidentialDepositInstruction, getCreateMintInstructionPlan, getMintToInstruction, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { fetchConfidentialTransferBalance, getApplyConfidentialPendingBalanceInstructionFromToken, getCreateConfidentialTransferAccountInstructionPlan } from "@solana-program/token-2022/confidential";
import { createClient, createKeyPairSignerFromBytes, generateKeyPairSigner, sequentialInstructionPlan, singleInstructionPlan, some } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signerFromFile } from "@solana/kit-plugin-signer";
import { readFileSync } from "node:fs";
import { deriveConfidentialKeys, newPaymentId, payConfidential, verifyConfidentialPayment, VerifyError } from "../src/index.js";

const PAYER = process.env.SOLANA_PAYER_KEYFILE, PAYEE = process.env.SOLANA_PAYEE_KEYFILE;
const RPC_URL = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";

describe.skipIf(!PAYER || !PAYEE)("solana confidential rail (local validator)", () => {
  it("pays with a memo and the payee + auditor verify the amount from the ledger", async () => {
    const client = await createClient().use(signerFromFile(PAYER!)).use(solanaRpc({ rpcUrl: RPC_URL }));
    const alice = client.payer;
    const bob = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(PAYEE!, "utf8"))));
    const auditorSigner = await generateKeyPairSigner();
    const mintSigner = await generateKeyPairSigner();
    const mint = mintSigner.address;
    const auditor = await deriveConfidentialKeys(auditorSigner, mint);
    await client.sendTransaction(await getCreateMintInstructionPlan(client, {
      payer: alice, newMint: mintSigner, decimals: 6, mintAuthority: alice,
      extensions: [{ __kind: "ConfidentialTransferMint", authority: some(alice.address), autoApproveNewAccounts: true, auditorElgamalPubkey: some(auditor.elgamalPubkey) }],
    }));
    const A = await deriveConfidentialKeys(alice, mint), B = await deriveConfidentialKeys(bob, mint);
    const [aTok] = await findAssociatedTokenPda({ mint, owner: alice.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
    const [bTok] = await findAssociatedTokenPda({ mint, owner: bob.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
    for (const [owner, token, keys] of [[alice, aTok, A], [bob, bTok, B]] as const)
      await client.sendTransaction(await getCreateConfidentialTransferAccountInstructionPlan({ payer: alice, owner, mint, token, rpc: client.rpc, elgamalKeypair: keys.elgamalKeypair, aesKey: keys.aesKey }));
    await client.sendTransaction(sequentialInstructionPlan([
      singleInstructionPlan(getMintToInstruction({ mint, token: aTok, mintAuthority: alice, amount: 5_000_000n })),
      singleInstructionPlan(getConfidentialDepositInstruction({ token: aTok, mint, authority: alice, amount: 5_000_000n, decimals: 6 })),
    ]));
    await client.sendTransaction(singleInstructionPlan(getApplyConfidentialPendingBalanceInstructionFromToken({ token: aTok, tokenAccount: (await fetchToken(client.rpc, aTok)).data, authority: alice, elgamalSecretKey: A.elgamalSecretKey, aesKey: A.aesKey })));

    const paymentId = newPaymentId();
    const proof = await payConfidential({ client, payer: alice, authority: alice, keys: A, mint, destinationToken: bTok, amount: 1_234_567n, paymentId });
    expect(proof.proofSignatures.length).toBeGreaterThanOrEqual(3);

    const asPayee = await verifyConfidentialPayment({ rpc: RPC_URL, ...proof, destinationToken: bTok, elgamalSecret: B.elgamalSecretKey, elgamalPubkey: B.elgamalPubkey, role: "payee", minAmount: 1_234_567n });
    expect(asPayee.amount).toBe(1_234_567n);
    expect(asPayee.mint).toBe(mint);
    const asAuditor = await verifyConfidentialPayment({ rpc: RPC_URL, ...proof, elgamalSecret: auditor.elgamalSecretKey, elgamalPubkey: auditor.elgamalPubkey, role: "auditor", minAmount: 0n });
    expect(asAuditor.amount).toBe(1_234_567n);
    // an auditor who only knows the transfer signature discovers the proof transactions from the ledger
    const discovered = await verifyConfidentialPayment({ rpc: RPC_URL, transferSignature: proof.transferSignature, paymentId, elgamalSecret: auditor.elgamalSecretKey, elgamalPubkey: auditor.elgamalPubkey, role: "auditor", minAmount: 0n });
    expect(discovered.amount).toBe(1_234_567n);
    expect(discovered.validityProofSignature).toBe(asAuditor.validityProofSignature);
    // a stranger's key cannot decrypt, a wrong payment id is rejected, and asking for more than was paid fails
    await expect(verifyConfidentialPayment({ rpc: RPC_URL, ...proof, destinationToken: bTok, elgamalSecret: A.elgamalSecretKey, elgamalPubkey: A.elgamalPubkey, role: "payee", minAmount: 0n })).rejects.toMatchObject({ code: "not_encrypted_to_us" });
    await expect(verifyConfidentialPayment({ rpc: RPC_URL, ...proof, paymentId: "pay_other", destinationToken: bTok, elgamalSecret: B.elgamalSecretKey, elgamalPubkey: B.elgamalPubkey, role: "payee", minAmount: 0n })).rejects.toBeInstanceOf(VerifyError);
    await expect(verifyConfidentialPayment({ rpc: RPC_URL, ...proof, destinationToken: bTok, elgamalSecret: B.elgamalSecretKey, elgamalPubkey: B.elgamalPubkey, role: "payee", minAmount: 2_000_000n })).rejects.toMatchObject({ code: "insufficient_amount" });
    // the payee can still sweep it into spendable balance
    await client.sendTransaction(singleInstructionPlan(getApplyConfidentialPendingBalanceInstructionFromToken({ token: bTok, tokenAccount: (await fetchToken(client.rpc, bTok)).data, authority: bob, elgamalSecretKey: B.elgamalSecretKey, aesKey: B.aesKey })));
    expect((await fetchConfidentialTransferBalance({ token: bTok, rpc: client.rpc, elgamalSecretKey: B.elgamalSecretKey, aesKey: B.aesKey })).availableBalance).toBe(1_234_567n);
  }, 120_000);
});
