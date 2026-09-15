/**
 * SottoClient — the agent side. A `fetch` that pays over x402 or MPP on whichever rail the server offers,
 * but only after the owner's policy allows it, and that writes a signed receipt for every payment.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { x402Client, x402HTTPClient, type x402ClientConfig } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { Mppx as MppxClient, tempo } from "mppx/client";
import { Receipt as MppReceipt } from "mppx";
import type { Account } from "viem";
import { formatUsd6, StaticPriceSource, type PriceSource } from "./money.js";
import { PolicyEngine, PolicyViolation, type Decision, type DecisionLog, type Policy } from "./policy/index.js";
import { MemoryReceiptStore, ReceiptSigner, newReceiptId, type Receipt, type ReceiptStore, type SignedReceipt } from "./receipts/index.js";
import { solanaConfidentialClient } from "./mpp/solana-confidential.js";
import { zcashShieldedClient } from "./mpp/zcash-shielded.js";
import type { ConfidentialPayerClient } from "./rails/solana-confidential/payer.js";
import type { ZcashSettlerClient } from "./rails/zcash-shielded/index.js";
import { ConfidentialSvmClientScheme, type ConfidentialSigner } from "./x402/solana-confidential.js";
import { ShieldedZcashClientScheme, ZEC_ASSET, ZEC_DECIMALS } from "./x402/zcash-shielded.js";

export type SottoClientConfig = {
  agentId: string;
  policy: Policy;
  prices?: PriceSource;
  receipts?: ReceiptStore;
  /** Where allow/deny decisions are kept; `FileDecisionLog` makes budgets survive restarts. Default: in memory. */
  decisionLog?: DecisionLog;
  signer?: ReceiptSigner;
  /** Mints the agent may pay with. `usdPrice` defaults to 1 (a dollar-stable mint); set it for anything else. */
  solana?: { client: ConfidentialPayerClient; signer: ConfidentialSigner; network: string; mints: Array<{ mint: string; decimals: number; usdPrice?: number }> };
  /** `zecPriceUsd` lets the policy engine budget shielded payments in dollars. */
  zcash?: { settler: ZcashSettlerClient; network: string; zecPriceUsd?: number };
  tempo?: { account: Account; expectedChainId?: number; decimals?: number; network?: string };
};

/** What the paying scheme/method saw when it was asked to pay — captured per request. */
type Pending = {
  resource: string;
  paymentId?: string;
  protocol?: "x402" | "mpp";
  scheme?: string;
  network?: string;
  asset?: string;
  decimals?: number;
  amount?: bigint;
  decision?: Decision;
  receipt?: SignedReceipt;
};

export class SottoClient {
  readonly policy: PolicyEngine;
  readonly receipts: ReceiptStore;
  private readonly als = new AsyncLocalStorage<Pending>();
  private readonly payingFetch: typeof fetch;
  private constructor(readonly config: SottoClientConfig, readonly receiptSigner: ReceiptSigner) {
    this.policy = new PolicyEngine({ prices: config.prices ?? SottoClient.defaultPrices(config), log: config.decisionLog });
    this.policy.setPolicy(config.policy);
    this.receipts = config.receipts ?? new MemoryReceiptStore();
    this.payingFetch = this.buildFetch();
  }

  /** Prices the engine can budget with: configured mints (default $1) and the ZEC price, if given. */
  static defaultPrices(config: SottoClientConfig): PriceSource {
    const table = new StaticPriceSource();
    for (const m of config.solana?.mints ?? []) table.set(config.solana!.network, m.mint, m.usdPrice ?? 1);
    if (config.zcash?.zecPriceUsd) table.set(config.zcash.network, ZEC_ASSET, config.zcash.zecPriceUsd);
    return table;
  }

  static async create(config: SottoClientConfig): Promise<SottoClient> {
    return new SottoClient(config, config.signer ?? (await ReceiptSigner.generate()));
  }

  /** Ask the policy engine; throws PolicyViolation (aborting the payment) when denied. */
  private async authorize(p: Pending, info: { protocol: "x402" | "mpp"; scheme: string; network: string; asset: string; decimals: number; amount: bigint; paymentId: string }) {
    Object.assign(p, info);
    p.decision = await this.policy.authorize({ agentId: this.config.agentId, resource: p.resource, protocol: info.protocol, scheme: info.scheme, network: info.network, asset: info.asset, decimals: info.decimals, amount: info.amount });
  }

  private buildFetch(): typeof fetch {
    const c = this.config;
    const mppMethods: unknown[] = [];
    const schemes: x402ClientConfig["schemes"] = [];
    const allowedAssets: Array<{ network: `${string}:${string}`; asset: string }> = [];
    const pending = () => this.als.getStore();

    if (c.solana) {
      const { client, signer, network, mints } = c.solana;
      const decimalsOf = (mint: string) => mints.find(m => m.mint === mint)?.decimals ?? 6;
      schemes.push({ network: network as `${string}:${string}`, client: new ConfidentialSvmClientScheme({ client, signer, onPayment: async ({ paymentId, requirements }) => {
        const p = pending(); if (!p) return;
        await this.authorize(p, { protocol: "x402", scheme: "confidential", network, asset: requirements.asset, decimals: decimalsOf(requirements.asset), amount: BigInt(requirements.amount), paymentId });
      } }) });
      for (const m of mints) allowedAssets.push({ network: network as `${string}:${string}`, asset: m.mint });
      mppMethods.push(solanaConfidentialClient({ client, signer, onPayment: async ({ paymentId, request }) => {
        const p = pending(); if (!p) return;
        const decimals = decimalsOf(request.mint);
        await this.authorize(p, { protocol: "mpp", scheme: "solana-confidential", network: request.network, asset: request.mint, decimals, amount: BigInt(Math.round(Number(request.amount) * 10 ** decimals)), paymentId });
      } }));
    }
    if (c.zcash) {
      const { settler, network } = c.zcash;
      schemes.push({ network: network as `${string}:${string}`, client: new ShieldedZcashClientScheme({ settler, onPayment: async ({ paymentId, requirements }) => {
        const p = pending(); if (!p) return;
        await this.authorize(p, { protocol: "x402", scheme: "shielded", network, asset: ZEC_ASSET, decimals: ZEC_DECIMALS, amount: BigInt(requirements.amount), paymentId });
      } }) });
      allowedAssets.push({ network: network as `${string}:${string}`, asset: ZEC_ASSET });
      mppMethods.push(zcashShieldedClient({ settler, onPayment: async ({ paymentId, request }) => {
        const p = pending(); if (!p) return;
        await this.authorize(p, { protocol: "mpp", scheme: "zcash-shielded", network: request.network, asset: ZEC_ASSET, decimals: ZEC_DECIMALS, amount: BigInt(request.zatoshis), paymentId });
      } }));
    }
    if (c.tempo) {
      // Tempo is public and bounded: policy runs on the challenge amount before the transfer is signed.
      const { account, expectedChainId } = c.tempo;
      const decimals = c.tempo.decimals ?? 6;
      const network = c.tempo.network ?? `eip155:${expectedChainId ?? 42431}`;
      const guarded = tempo({ account, expectedChainId }).map(m => ({
        ...m,
        createCredential: async (args: never) => {
          const challenge = (args as { challenge: { id: string; request: { amount: string; currency: string } } }).challenge;
          const p = pending();
          if (p) await this.authorize(p, { protocol: "mpp", scheme: "tempo", network, asset: challenge.request.currency, decimals, amount: BigInt(challenge.request.amount), paymentId: challenge.id });
          return (m as { createCredential: (a: never) => Promise<string> }).createCredential(args);
        },
      }));
      mppMethods.push(...guarded);
    }

    let base: typeof fetch = fetch;
    if (mppMethods.length) base = MppxClient.create({ methods: mppMethods as never, polyfill: false }).fetch as typeof fetch;
    if (schemes.length) {
      const client = x402Client.fromConfig({ schemes, spendControls: { allowedAssets } });
      const wrapped = wrapFetchWithPayment(base, client);
      const http = new x402HTTPClient(client);
      base = (async (input, init) => {
        const res = await wrapped(input, init);
        const p = pending();
        if (p && p.protocol === "x402" && res.headers.get("payment-response")) {
          const settle = http.getPaymentSettleResponse(name => res.headers.get(name));
          if (settle.success) await this.record(p, [settle.transaction]);
        }
        return res;
      }) as typeof fetch;
    }
    return base;
  }

  private async record(p: Pending, transactions: string[]) {
    if (!p.paymentId || p.amount === undefined || !p.scheme || !p.network || !p.asset) return;
    const r: Receipt = {
      id: newReceiptId(), at: new Date().toISOString(), agentId: this.config.agentId, protocol: p.protocol ?? "x402", scheme: p.scheme,
      network: p.network, asset: p.asset, decimals: p.decimals ?? 0, amount: p.amount.toString(), resource: p.resource, paymentId: p.paymentId,
      transactions, confidential: p.scheme !== "tempo" && p.scheme !== "exact",
      details: p.decision?.usd6 !== undefined && p.decision.usd6 !== null ? { usd: formatUsd6(p.decision.usd6) } : undefined,
    };
    const signed = await this.receiptSigner.sign(r);
    await this.receipts.put(signed);
    p.receipt = signed;
  }

  /** Like `fetch`, but also returns the receipt and policy decision when a payment happened. */
  async fetchDetailed(input: RequestInfo | URL, init?: RequestInit): Promise<{ response: Response; receipt?: SignedReceipt; decision?: Decision }> {
    const resource = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const p: Pending = { resource };
    return this.als.run(p, async () => {
      try {
        const response = await this.payingFetch(input, init);
        if (p.protocol === "mpp" && response.headers.get("payment-receipt")) {
          const receipt = MppReceipt.fromResponse(response);
          await this.record(p, [receipt.reference]);
        }
        // authorized, but no receipt came back: the payment did not settle, so it must not count against budgets
        if (p.decision?.allowed && !p.receipt) await this.policy.voidDecision(p.decision.id, `no settlement (status ${response.status})`);
        return { response, receipt: p.receipt, decision: p.decision };
      } catch (e) {
        if (p.decision?.allowed && !p.receipt) await this.policy.voidDecision(p.decision.id, (e as Error).message);
        throw e;
      }
    });
  }

  /** A fetch that pays when asked — within policy — and records a receipt. Throws PolicyViolation when denied. */
  readonly fetch: typeof fetch = async (input, init) => (await this.fetchDetailed(input, init)).response;

  async listReceipts(): Promise<SignedReceipt[]> { return this.receipts.list({ agentId: this.config.agentId }); }
  async decisions() { return this.policy.log.list(this.config.agentId); }
  pause(paused = true) { this.policy.pause(this.config.agentId, paused); }
}

export { PolicyViolation };
