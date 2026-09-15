/**
 * Build a SottoClient from environment variables. Everything an owner sets lives here:
 *
 *   SOTTO_AGENT_ID            name of this agent (default "agent")
 *   SOTTO_POLICY              JSON: { "maxPerPaymentUsd": 0.5, "perHourUsd": 2, "perDayUsd": 10, "perMonthUsd": 100,
 *                                     "allowHosts": ["*.example.com"], "denyHosts": [], "allowNetworks": [], "expiresAt": "2026-12-31T00:00:00Z" }
 *   SOTTO_RECEIPTS_FILE       JSON-lines ledger (default ~/.sotto/receipts.jsonl)
 *   SOTTO_SOLANA_RPC_URL, SOTTO_SOLANA_KEYFILE, SOTTO_SOLANA_NETWORK, SOTTO_SOLANA_MINTS (JSON [{mint, decimals, usdPrice?}])
 *   SOTTO_ZCASH_SETTLER_URL, SOTTO_ZCASH_NETWORK (default zcash:testnet), SOTTO_ZEC_PRICE_USD
 *   SOTTO_TEMPO_PRIVATE_KEY, SOTTO_TEMPO_CHAIN_ID (default 42431 = Moderato testnet)
 */
import { createClient, type KeyPairSigner } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signerFromFile } from "@solana/kit-plugin-signer";
import { FileReceiptStore, SottoClient, ZcashSettlerClient, usd6FromNumber, type Policy, type SottoClientConfig } from "@sotto/sdk";
import { homedir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";

type PolicyJson = {
  maxPerPaymentUsd?: number; perHourUsd?: number; perDayUsd?: number; perMonthUsd?: number;
  allowHosts?: string[]; denyHosts?: string[]; allowNetworks?: string[]; expiresAt?: string; paused?: boolean;
};

export function policyFromJson(agentId: string, json: string | undefined): Policy {
  const p: PolicyJson = json ? (JSON.parse(json) as PolicyJson) : {};
  const usd = (v: number | undefined) => (v === undefined ? undefined : usd6FromNumber(v));
  return {
    agentId,
    maxPerPayment: usd(p.maxPerPaymentUsd), perHour: usd(p.perHourUsd), perDay: usd(p.perDayUsd), perMonth: usd(p.perMonthUsd),
    allowHosts: p.allowHosts, denyHosts: p.denyHosts, allowNetworks: p.allowNetworks,
    expiresAt: p.expiresAt ? new Date(p.expiresAt) : undefined, paused: p.paused,
  };
}

export async function clientFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<SottoClient> {
  const agentId = env.SOTTO_AGENT_ID ?? "agent";
  const config: SottoClientConfig = {
    agentId,
    policy: policyFromJson(agentId, env.SOTTO_POLICY),
    receipts: new FileReceiptStore(env.SOTTO_RECEIPTS_FILE ?? join(homedir(), ".sotto", "receipts.jsonl")),
  };
  if (env.SOTTO_SOLANA_KEYFILE) {
    const rpcUrl = env.SOTTO_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    const client = await createClient().use(signerFromFile(env.SOTTO_SOLANA_KEYFILE)).use(solanaRpc({ rpcUrl }));
    config.solana = {
      client, signer: client.payer as unknown as KeyPairSigner,
      network: env.SOTTO_SOLANA_NETWORK ?? "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      mints: env.SOTTO_SOLANA_MINTS ? (JSON.parse(env.SOTTO_SOLANA_MINTS) as SottoClientConfig["solana"] extends infer S ? S extends { mints: infer M } ? M : never : never) : [],
    };
  }
  if (env.SOTTO_ZCASH_SETTLER_URL) {
    config.zcash = { settler: new ZcashSettlerClient(env.SOTTO_ZCASH_SETTLER_URL), network: env.SOTTO_ZCASH_NETWORK ?? "zcash:testnet", zecPriceUsd: env.SOTTO_ZEC_PRICE_USD ? Number(env.SOTTO_ZEC_PRICE_USD) : undefined };
  }
  if (env.SOTTO_TEMPO_PRIVATE_KEY) {
    config.tempo = { account: privateKeyToAccount(env.SOTTO_TEMPO_PRIVATE_KEY as `0x${string}`), expectedChainId: Number(env.SOTTO_TEMPO_CHAIN_ID ?? 42431) };
  }
  if (!config.solana && !config.zcash && !config.tempo) throw new Error("sotto-mcp-server: configure at least one rail (SOTTO_SOLANA_KEYFILE, SOTTO_ZCASH_SETTLER_URL or SOTTO_TEMPO_PRIVATE_KEY)");
  return SottoClient.create(config);
}
