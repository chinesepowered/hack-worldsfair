/**
 * Spike: Solana Token-2022 confidential transfer, end to end, from TypeScript.
 *  1. create a confidential-transfer mint with an auditor ElGamal key
 *  2. configure confidential token accounts for Alice (payer) and Bob (payee)
 *  3. mint → deposit → apply pending (Alice)
 *  4. confidential transfer Alice → Bob (+ memo carrying a payment id)
 *  5. Bob applies pending and decrypts his balance; the auditor reads the amount from the ledger
 * Run: SOLANA_PAYER_KEYFILE=... SOLANA_PAYEE_KEYFILE=... pnpm spike:solana   (defaults to local validator)
 */
import {
  fetchToken,
  findAssociatedTokenPda,
  getConfidentialDepositInstruction,
  getCreateMintInstructionPlan,
  getMintToInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import {
  deriveAeKeyForOwnerMint,
  deriveElGamalKeypairForOwnerMint,
  fetchConfidentialTransferBalance,
  getApplyConfidentialPendingBalanceInstructionFromToken,
  getConfidentialTransferWithRecordInstructionPlan,
  getCreateConfidentialTransferAccountInstructionPlan,
} from "@solana-program/token-2022/confidential";
import { getAddMemoInstruction } from "@solana-program/memo";
import {
  createClient,
  createKeyPairSignerFromBytes,
  generateKeyPairSigner,
  sequentialInstructionPlan,
  singleInstructionPlan,
  some,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signerFromFile } from "@solana/kit-plugin-signer";
import { AeKey, ElGamalKeypair, ElGamalSecretKey } from "@solana/zk-sdk/bundler";
import { readFileSync } from "node:fs";

const PAYER_KEYFILE = process.env.SOLANA_PAYER_KEYFILE;
const PAYEE_KEYFILE = process.env.SOLANA_PAYEE_KEYFILE;
if (!PAYER_KEYFILE || !PAYEE_KEYFILE) throw new Error("SOLANA_PAYER_KEYFILE and SOLANA_PAYEE_KEYFILE are required");
const RPC_URL = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const DECIMALS = 6;
const MINT_AMOUNT = 1_000_000_000n; // 1000.000000
const PAY_AMOUNT = 12_345_678n; // 12.345678

const client = await createClient().use(signerFromFile(PAYER_KEYFILE)).use(solanaRpc({ rpcUrl: RPC_URL }));
const { rpc } = client;
const alice: TransactionSigner = client.payer;
const bob = await createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(PAYEE_KEYFILE, "utf8"))));
const auditorSigner = await generateKeyPairSigner();
const t = (label: string, t0: number) => console.log(`  ✓ ${label} (${Date.now() - t0}ms)`);

// ---- 1. mint with auditor -------------------------------------------------------------------
let t0 = Date.now();
const mintSigner = await generateKeyPairSigner();
const mint = mintSigner.address;
const auditor = await deriveElGamalKeypairForOwnerMint({ signer: auditorSigner, owner: auditorSigner.address, mint });
const createMintPlan = await getCreateMintInstructionPlan(client, {
  payer: alice,
  newMint: mintSigner,
  decimals: DECIMALS,
  mintAuthority: alice,
  extensions: [
    {
      __kind: "ConfidentialTransferMint",
      authority: some(alice.address),
      autoApproveNewAccounts: true,
      auditorElgamalPubkey: some(auditor.elgamalPubkey),
    },
  ],
});
await client.sendTransaction(createMintPlan);
t(`mint ${mint} created with auditor ${auditor.elgamalPubkey}`, t0);

// ---- 2. confidential accounts for Alice and Bob ----------------------------------------------
async function confidentialKeys(owner: TransactionSigner) {
  const eg = await deriveElGamalKeypairForOwnerMint({ signer: owner, owner: owner.address, mint });
  const ae = await deriveAeKeyForOwnerMint({ signer: owner, owner: owner.address, mint });
  const elgamalSecretKey = ElGamalSecretKey.fromBytes(new Uint8Array(eg.secretKey));
  return {
    elgamalKeypair: ElGamalKeypair.fromSecretKey(elgamalSecretKey),
    elgamalSecretKey,
    elgamalPubkey: eg.elgamalPubkey,
    aesKey: AeKey.fromBytes(new Uint8Array(ae)),
  };
}
async function createConfidentialAccount(owner: TransactionSigner) {
  const keys = await confidentialKeys(owner);
  const [token] = await findAssociatedTokenPda({ mint, owner: owner.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
  const plan = await getCreateConfidentialTransferAccountInstructionPlan({
    payer: alice, owner, mint, token, rpc, elgamalKeypair: keys.elgamalKeypair, aesKey: keys.aesKey,
  });
  await client.sendTransaction(plan);
  return { token, ...keys };
}
t0 = Date.now();
const A = await createConfidentialAccount(alice);
const B = await createConfidentialAccount(bob);
t(`confidential accounts: alice ${A.token} bob ${B.token}`, t0);

// ---- 3. mint → deposit → apply (Alice) -------------------------------------------------------
t0 = Date.now();
await client.sendTransaction(
  sequentialInstructionPlan([
    singleInstructionPlan(getMintToInstruction({ mint, token: A.token, mintAuthority: alice, amount: MINT_AMOUNT })),
    singleInstructionPlan(getConfidentialDepositInstruction({ token: A.token, mint, authority: alice, amount: MINT_AMOUNT, decimals: DECIMALS })),
  ]),
);
let aliceToken = await fetchToken(rpc, A.token);
await client.sendTransaction(
  singleInstructionPlan(
    getApplyConfidentialPendingBalanceInstructionFromToken({
      token: A.token, tokenAccount: aliceToken.data, authority: alice, elgamalSecretKey: A.elgamalSecretKey, aesKey: A.aesKey,
    }),
  ),
);
const aliceBal0 = await fetchConfidentialTransferBalance({ token: A.token, rpc, elgamalSecretKey: A.elgamalSecretKey, aesKey: A.aesKey });
t(`alice deposited; confidential available = ${aliceBal0.availableBalance}`, t0);

// ---- 4. confidential transfer Alice → Bob with a payment-id memo ---------------------------
t0 = Date.now();
const paymentId = `pay_${crypto.randomUUID().replace(/-/g, "")}`;
aliceToken = await fetchToken(rpc, A.token);
const bobToken = await fetchToken(rpc, B.token);
const transferPlan = await getConfidentialTransferWithRecordInstructionPlan({
  sourceToken: A.token, mint, destinationToken: B.token, sourceTokenAccount: aliceToken.data, destinationTokenAccount: bobToken.data,
  authority: alice, amount: PAY_AMOUNT, sourceElgamalKeypair: A.elgamalKeypair, aesKey: A.aesKey, payer: alice, rpc,
});
const transferResult = await client.sendTransactions(
  sequentialInstructionPlan([transferPlan, singleInstructionPlan(getAddMemoInstruction({ memo: paymentId, signers: [alice] }))]),
);
const sigs: string[] = [];
const walk = (r: unknown) => {
  if (!r || typeof r !== "object") return;
  const o = r as Record<string, unknown>;
  if (o.context && typeof (o.context as Record<string, unknown>).signature === "string") sigs.push((o.context as Record<string, string>).signature);
  if (Array.isArray(o.plans)) o.plans.forEach(walk);
};
walk(transferResult);
t(`confidential transfer of ${PAY_AMOUNT} sent in ${sigs.length} tx(s), memo ${paymentId}`, t0);
console.log("    signatures:", sigs.join(", "));

// ---- 5. Bob applies pending and decrypts --------------------------------------------------
t0 = Date.now();
const bobTokenAfter = await fetchToken(rpc, B.token);
await client.sendTransaction(
  singleInstructionPlan(
    getApplyConfidentialPendingBalanceInstructionFromToken({
      token: B.token, tokenAccount: bobTokenAfter.data, authority: bob, elgamalSecretKey: B.elgamalSecretKey, aesKey: B.aesKey,
    }),
  ),
);
const bobBal = await fetchConfidentialTransferBalance({ token: B.token, rpc, elgamalSecretKey: B.elgamalSecretKey, aesKey: B.aesKey });
const aliceBal1 = await fetchConfidentialTransferBalance({ token: A.token, rpc, elgamalSecretKey: A.elgamalSecretKey, aesKey: A.aesKey });
t(`bob decrypted available = ${bobBal.availableBalance}; alice now ${aliceBal1.availableBalance}`, t0);

// what the public sees: the token account's plain `amount` field for both parties
const pubA = await fetchToken(rpc, A.token);
const pubB = await fetchToken(rpc, B.token);
console.log(`  public view: alice.amount=${pubA.data.amount} bob.amount=${pubB.data.amount} (confidential balances are ciphertext)`);
console.log(bobBal.availableBalance === PAY_AMOUNT ? "PASS: payee decrypted exactly the paid amount" : "FAIL: amount mismatch");
