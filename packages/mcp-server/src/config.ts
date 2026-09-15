/**
 * Build a SottoClient from environment variables. Everything an owner sets lives here:
 *
 *   SOTTO_AGENT_ID            name of this agent (default "agent")
 *   SOTTO_POLICY              JSON: { "maxPerPaymentUsd": 0.5, "perHourUsd": 2, "perDayUsd": 10, "perMonthUsd": 100,
 *                                     "allowHosts": ["*.example.com"], "denyHosts": [], "allowNetworks": [], "expiresAt": "2026-12-31T00:00:00Z" }
 *   SOTTO_STATE_DIR           where receipts, decisions and the pause marker live (default ~/.sotto); budgets and the
 *                             kill switch survive restarts because the policy engine replays this directory on start
 *   SOTTO_RECEIPTS_FILE       override for the JSON-lines receipt ledger (default $SOTTO_STATE_DIR/receipts.jsonl)
 *   SOTTO_DECISIONS_FILE      override for the JSON-lines decision log (default $SOTTO_STATE_DIR/decisions.jsonl)
 *   SOTTO_SOLANA_RPC_URL, SOTTO_SOLANA_KEYFILE, SOTTO_SOLANA_NETWORK, SOTTO_SOLANA_MINTS (JSON [{mint, decimals, usdPrice?}])
 *   SOTTO_ZCASH_SETTLER_URL, SOTTO_ZCASH_NETWORK (default zcash:testnet), SOTTO_ZEC_PRICE_USD
 *   SOTTO_TEMPO_PRIVATE_KEY, SOTTO_TEMPO_CHAIN_ID (default 42431 = Moderato testnet)
 *
 * The MCP server and the `sotto` CLI read the same variables, so one configuration serves both.
 */
import { createClient, type KeyPairSigner } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { signerFromFile } from "@solana/kit-plugin-signer";
import { FileDecisionLog, FileReceiptStore, SottoClient, ZcashSettlerClient, usd6FromNumber, type Policy, type SottoClientConfig } from "@sotto/sdk";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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

export type SottoState = { dir: string; receiptsFile: string; decisionsFile: string; pausedFile: string };

export function stateFromEnv(env: NodeJS.ProcessEnv = process.env): SottoState {
  const dir = env.SOTTO_STATE_DIR ?? join(homedir(), ".sotto");
  return {
    dir,
    receiptsFile: env.SOTTO_RECEIPTS_FILE ?? join(dir, "receipts.jsonl"),
    decisionsFile: env.SOTTO_DECISIONS_FILE ?? join(dir, "decisions.jsonl"),
    pausedFile: join(dir, "paused"),
  };
}

/** The kill switch as a marker file: set from the MCP server, the CLI, or the owner's shell (`touch`/`rm`), it holds until resumed. */
export class KillSwitch {
  constructor(readonly path: string) {}
  isPaused(): boolean { return existsSync(this.path); }
  async set(paused: boolean): Promise<void> {
    if (paused) {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path, `${new Date().toISOString()}\n`, { mode: 0o600 });
    } else {
      await rm(this.path, { force: true });
    }
  }
}

export type Sotto = { client: SottoClient; state: SottoState; kill: KillSwitch };

export async function fromEnv(env: NodeJS.ProcessEnv = process.env): Promise<Sotto> {
  const agentId = env.SOTTO_AGENT_ID ?? "agent";
  const state = stateFromEnv(env);
  const config: SottoClientConfig = {
    agentId,
    policy: policyFromJson(agentId, env.SOTTO_POLICY),
    receipts: new FileReceiptStore(state.receiptsFile),
    decisionLog: new FileDecisionLog(state.decisionsFile),
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
  if (!config.solana && !config.zcash && !config.tempo) throw new Error("configure at least one rail (SOTTO_SOLANA_KEYFILE, SOTTO_ZCASH_SETTLER_URL or SOTTO_TEMPO_PRIVATE_KEY)");
  const client = await SottoClient.create(config);
  const kill = new KillSwitch(state.pausedFile);
  if (kill.isPaused()) client.pause(true);
  return { client, state, kill };
}

/** @deprecated use `fromEnv().client` */
export async function clientFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<SottoClient> { return (await fromEnv(env)).client; }
