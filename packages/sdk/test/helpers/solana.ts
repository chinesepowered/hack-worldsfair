/** Shared local-validator fixtures: a confidential mint with an auditor, funded payer, configured payee. */
import { fetchToken, findAssociatedTokenPda, getConfidentialDepositInstruction, getCreateMintInstructionPlan, getMintToInstruction, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { getApplyConfidentialPendingBalanceInstructionFromToken, getCreateConfidentialTransferAccountInstructionPlan } from "@solana-program/token-2022/confidential";
import { createClient, createKeyPairSignerFromBytes, generateKeyPairSigner, sequentialInstructionPlan, singleInstructionPlan, some, type Address, type KeyPairSigner, type TransactionSigner } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signerFromFile } from "@solana/kit-plugin-signer";
import { readFileSync } from "node:fs";
import { deriveConfidentialKeys, type ConfidentialKeys } from "../../src/index.js";

export const RPC_URL = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
export const PAYER_KEYFILE = process.env.SOLANA_PAYER_KEYFILE;
export const PAYEE_KEYFILE = process.env.SOLANA_PAYEE_KEYFILE;
export const haveLocalValidator = Boolean(PAYER_KEYFILE && PAYEE_KEYFILE);

export type Fixture = Awaited<ReturnType<typeof setupConfidentialMint>>;

export async function setupConfidentialMint(opts: { decimals?: number; fund?: bigint } = {}) {
  const decimals = opts.decimals ?? 6;
  const fund = opts.fund ?? 100_000_000n;
  const client = await createClient().use(signerFromFile(PAYER_KEYFILE!)).use(solanaRpc({ rpcUrl: RPC_URL }));
  const alice = client.payer as unknown as KeyPairSigner;
  const bob = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(PAYEE_KEYFILE!, "utf8"))));
  const auditorSigner = await generateKeyPairSigner();
  const mintSigner = await generateKeyPairSigner();
  const mint: Address = mintSigner.address;
  const auditor = await deriveConfidentialKeys(auditorSigner, mint);
  await client.sendTransaction(await getCreateMintInstructionPlan(client, {
    payer: alice, newMint: mintSigner, decimals, mintAuthority: alice,
    extensions: [{ __kind: "ConfidentialTransferMint", authority: some(alice.address), autoApproveNewAccounts: true, auditorElgamalPubkey: some(auditor.elgamalPubkey) }],
  }));
  const configure = async (owner: KeyPairSigner): Promise<{ token: Address; keys: ConfidentialKeys }> => {
    const keys = await deriveConfidentialKeys(owner, mint);
    const [token] = await findAssociatedTokenPda({ mint, owner: owner.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
    await client.sendTransaction(await getCreateConfidentialTransferAccountInstructionPlan({ payer: alice, owner, mint, token, rpc: client.rpc, elgamalKeypair: keys.elgamalKeypair, aesKey: keys.aesKey }));
    return { token, keys };
  };
  const A = await configure(alice);
  const B = await configure(bob);
  await client.sendTransaction(sequentialInstructionPlan([
    singleInstructionPlan(getMintToInstruction({ mint, token: A.token, mintAuthority: alice, amount: fund })),
    singleInstructionPlan(getConfidentialDepositInstruction({ token: A.token, mint, authority: alice, amount: fund, decimals })),
  ]));
  await client.sendTransaction(singleInstructionPlan(getApplyConfidentialPendingBalanceInstructionFromToken({ token: A.token, tokenAccount: (await fetchToken(client.rpc, A.token)).data, authority: alice, elgamalSecretKey: A.keys.elgamalSecretKey, aesKey: A.keys.aesKey })));
  return { client, alice, bob, mint, decimals, auditor, aliceToken: A.token, aliceKeys: A.keys, bobToken: B.token, bobKeys: B.keys };
}
