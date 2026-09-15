/** The five operations, protocol-free: the MCP tools (tools.ts) and the `sotto` CLI (cli.ts) are thin faces over these. */
import { formatUsd6, PolicyViolation, type SottoClient } from "@sotto/sdk";
import type { KillSwitch } from "./config.js";

export const CHARACTER_LIMIT = 25_000;

export const usd = (v: bigint | null | undefined) => (v === undefined || v === null ? undefined : formatUsd6(v));

export type FetchArgs = { url: string; method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"; headers?: Record<string, string>; body?: string; max_chars?: number };
export type PaymentView = { scheme: string; network: string; asset: string; amount: string; usd?: string; confidential: boolean; transactions: string[]; receiptId: string; paymentId: string };
export type FetchResult = { status: number; headers: Record<string, string>; body: string; truncated: boolean; payment?: PaymentView };

/** Fetch, paying if asked and allowed. Throws `PolicyViolation` when the policy refuses; any other error is the request failing. */
export async function fetchOp(client: SottoClient, a: FetchArgs): Promise<FetchResult> {
  const method = a.method ?? "GET";
  const max = a.max_chars ?? 8000;
  const { response, receipt } = await client.fetchDetailed(a.url, { method, headers: a.headers, body: method === "GET" ? undefined : a.body });
  const text = await response.text();
  const truncated = text.length > max;
  const keep = ["content-type", "content-length", "payment-response", "payment-receipt", "www-authenticate", "payment-required"];
  return {
    status: response.status,
    headers: Object.fromEntries([...response.headers.entries()].filter(([k]) => keep.includes(k.toLowerCase()))),
    body: truncated ? text.slice(0, max) : text,
    truncated,
    payment: receipt ? { scheme: receipt.scheme, network: receipt.network, asset: receipt.asset, amount: receipt.amount, usd: (receipt.details as { usd?: string } | undefined)?.usd, confidential: receipt.confidential, transactions: receipt.transactions, receiptId: receipt.id, paymentId: receipt.paymentId } : undefined,
  };
}

export type BudgetView = {
  agentId: string; paused: boolean; maxPerPaymentUsd?: string;
  remainingUsd: { hour?: string; day?: string; month?: string };
  spentUsd: { hour: string; day: string; month: string };
  limitsUsd: { hour?: string; day?: string; month?: string };
  allowHosts?: string[]; denyHosts?: string[]; allowNetworks?: string[]; expiresAt?: string;
};

export async function budgetOp(client: SottoClient): Promise<BudgetView> {
  const { policy, remaining, spent } = await client.policy.remaining(client.config.agentId);
  return {
    agentId: client.config.agentId, paused: Boolean(policy?.paused), maxPerPaymentUsd: usd(policy?.maxPerPayment),
    remainingUsd: { hour: usd(remaining.hour), day: usd(remaining.day), month: usd(remaining.month) },
    spentUsd: { hour: formatUsd6(spent.hour), day: formatUsd6(spent.day), month: formatUsd6(spent.month) },
    limitsUsd: { hour: usd(policy?.perHour), day: usd(policy?.perDay), month: usd(policy?.perMonth) },
    allowHosts: policy?.allowHosts, denyHosts: policy?.denyHosts, allowNetworks: policy?.allowNetworks, expiresAt: policy?.expiresAt?.toISOString(),
  };
}

export type ReceiptView = { id: string; at: string; resource: string; protocol: string; scheme: string; network: string; asset: string; amount: string; decimals: number; usd?: string; confidential: boolean; transactions: string[]; paymentId: string };

export async function receiptsOp(client: SottoClient, a: { limit?: number; since?: string } = {}): Promise<{ receipts: ReceiptView[]; total: number }> {
  const all = (await client.receipts.list({ agentId: client.config.agentId, since: a.since ? new Date(a.since) : undefined })).sort((x, y) => y.at.localeCompare(x.at));
  const receipts = all.slice(0, a.limit ?? 20).map(r => ({
    id: r.id, at: r.at, resource: r.resource, protocol: r.protocol, scheme: r.scheme, network: r.network, asset: r.asset,
    amount: r.amount, decimals: r.decimals, usd: (r.details as { usd?: string } | undefined)?.usd, confidential: r.confidential,
    transactions: r.transactions, paymentId: r.paymentId,
  }));
  return { receipts, total: all.length };
}

export type DecisionView = { id: string; at: string; resource: string; network: string; asset: string; amount: string; usd?: string; allowed: boolean; reason: string };

export async function decisionsOp(client: SottoClient, a: { limit?: number } = {}): Promise<{ decisions: DecisionView[] }> {
  const list = (await client.decisions()).slice(-(a.limit ?? 20)).reverse();
  return { decisions: list.map(d => ({ id: d.id, at: d.at.toISOString(), resource: d.resource, network: d.network, asset: d.asset, amount: d.amount.toString(), usd: usd(d.usd6), allowed: d.allowed, reason: d.reason })) };
}

/** The kill switch: in this process now, and on disk for every later one. */
export async function setPausedOp(client: SottoClient, kill: KillSwitch, paused: boolean): Promise<{ paused: boolean }> {
  client.pause(paused);
  await kill.set(paused);
  return { paused };
}

export async function denialMessage(client: SottoClient, e: PolicyViolation): Promise<string> {
  const { remaining } = await client.policy.remaining(client.config.agentId);
  return `Payment denied by the owner's policy: ${e.decision.reason}. Remaining budget — hour: ${usd(remaining.hour) ?? "n/a"}, day: ${usd(remaining.day) ?? "n/a"}, month: ${usd(remaining.month) ?? "n/a"}. Ask the owner to raise the limit or use a cheaper resource.`;
}
