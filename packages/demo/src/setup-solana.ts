/**
 * One-time demo setup on Solana (local validator or devnet): a confidential USD mint with an auditor,
 * confidential accounts for the agent (payer) and the API (payee), and a funded agent balance.
 * Writes demo-solana.json next to the demo so the server, agent and dashboard agree on addresses.
 * Env: SOLANA_RPC_URL, SOLANA_PAYER_KEYFILE (agent), SOLANA_PAYEE_KEYFILE (api), SOLANA_AUDITOR_KEYFILE (optional)
 */
import { fetchToken, findAssociatedTokenPda, getConfidentialDepositInstruction, getCreateMintInstructionPlan, getMintToInstruction, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { getApplyConfidentialPendingBalanceInstructionFromToken, getCreateConfidentialTransferAccountInstructionPlan } from "@solana-program/token-2022/confidential";
import { createClient, createKeyPairSignerFromBytes, generateKeyPairSigner, sequentialInstructionPlan, singleInstructionPlan, some, type KeyPairSigner } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signerFromFile } from "@solana/kit-plugin-signer";
import { deriveConfidentialKeys } from "@sotto/sdk";
import { readFileSync, writeFileSync } from "node:fs";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
const load = async (p: string) => createKeyPairSignerFromBytes(new Uint8Array(JSON.parse(readFileSync(p, "utf8"))));
const client = await createClient().use(signerFromFile(process.env.SOLANA_PAYER_KEYFILE!)).use(solanaRpc({ rpcUrl: RPC_URL }));
const agent = client.payer as unknown as KeyPairSigner;
const api = await load(process.env.SOLANA_PAYEE_KEYFILE!);
const auditor = process.env.SOLANA_AUDITOR_KEYFILE ? await load(process.env.SOLANA_AUDITOR_KEYFILE) : await generateKeyPairSigner();
const mintSigner = await generateKeyPairSigner();
const mint = mintSigner.address;
const DECIMALS = 6;
const FUND = 1_000_000_000n; // $1,000

const auditorKeys = await deriveConfidentialKeys(auditor, mint);
await client.sendTransaction(await getCreateMintInstructionPlan(client, {
  payer: agent, newMint: mintSigner, decimals: DECIMALS, mintAuthority: agent,
  extensions: [{ __kind: "ConfidentialTransferMint", authority: some(agent.address), autoApproveNewAccounts: true, auditorElgamalPubkey: some(auditorKeys.elgamalPubkey) }],
}));
console.log("mint", mint, "auditor elgamal", auditorKeys.elgamalPubkey);
for (const owner of [agent, api]) {
  const keys = await deriveConfidentialKeys(owner, mint);
  const [token] = await findAssociatedTokenPda({ mint, owner: owner.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
  await client.sendTransaction(await getCreateConfidentialTransferAccountInstructionPlan({ payer: agent, owner, mint, token, rpc: client.rpc, elgamalKeypair: keys.elgamalKeypair, aesKey: keys.aesKey }));
  console.log("confidential account", owner === agent ? "agent" : "api", token);
}
const agentKeys = await deriveConfidentialKeys(agent, mint);
const [agentToken] = await findAssociatedTokenPda({ mint, owner: agent.address, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS });
await client.sendTransaction(sequentialInstructionPlan([
  singleInstructionPlan(getMintToInstruction({ mint, token: agentToken, mintAuthority: agent, amount: FUND })),
  singleInstructionPlan(getConfidentialDepositInstruction({ token: agentToken, mint, authority: agent, amount: FUND, decimals: DECIMALS })),
]));
await client.sendTransaction(singleInstructionPlan(getApplyConfidentialPendingBalanceInstructionFromToken({ token: agentToken, tokenAccount: (await fetchToken(client.rpc, agentToken)).data, authority: agent, elgamalSecretKey: agentKeys.elgamalSecretKey, aesKey: agentKeys.aesKey })));
const out = { rpcUrl: RPC_URL, network: process.env.SOLANA_NETWORK ?? "solana:localnet", mint, decimals: DECIMALS, agent: agent.address, api: api.address, auditorElgamalPubkey: auditorKeys.elgamalPubkey, auditorElgamalSecret: Array.from(auditorKeys.elgamalSecretKey.toBytes()) };
writeFileSync(new URL("../demo-solana.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("wrote demo-solana.json; agent funded with", FUND, "units");
