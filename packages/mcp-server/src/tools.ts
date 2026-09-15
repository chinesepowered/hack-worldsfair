import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatUsd6, PolicyViolation, type SottoClient } from "@sotto/sdk";
import { z } from "zod";

const CHARACTER_LIMIT = 25_000;

const usd = (v: bigint | null | undefined) => (v === undefined || v === null ? undefined : formatUsd6(v));
const receiptView = (r: NonNullable<Awaited<ReturnType<SottoClient["listReceipts"]>>[number]>) => ({
  id: r.id, at: r.at, resource: r.resource, protocol: r.protocol, scheme: r.scheme, network: r.network, asset: r.asset,
  amount: r.amount, decimals: r.decimals, usd: (r.details as { usd?: string } | undefined)?.usd, confidential: r.confidential,
  transactions: r.transactions, paymentId: r.paymentId,
});

export function registerTools(server: McpServer, client: SottoClient): void {
  server.registerTool(
    "sotto_fetch",
    {
      title: "Fetch (pays if required)",
      description:
        "Fetch a URL. If the server answers 402 Payment Required (x402 or MPP), pay it automatically on a supported rail — confidentially where the rail allows — but only if the owner's spend policy permits. Returns the response and, when a payment happened, the receipt. Denied payments return an error naming the rule that blocked them.",
      inputSchema: {
        url: z.string().url().describe("Absolute http(s) URL"),
        method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
        headers: z.record(z.string(), z.string()).optional().describe("Extra request headers"),
        body: z.string().optional().describe("Request body for non-GET methods"),
        max_chars: z.number().int().min(100).max(CHARACTER_LIMIT).default(8000).describe("Truncate the body to this many characters"),
      },
      outputSchema: {
        status: z.number(),
        headers: z.record(z.string(), z.string()),
        body: z.string(),
        truncated: z.boolean(),
        payment: z.object({
          scheme: z.string(), network: z.string(), asset: z.string(), amount: z.string(), usd: z.string().optional(),
          confidential: z.boolean(), transactions: z.array(z.string()), receiptId: z.string(),
        }).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ url, method, headers, body, max_chars }) => {
      try {
        const { response, receipt } = await client.fetchDetailed(url, { method, headers, body: method === "GET" ? undefined : body });
        const text = await response.text();
        const truncated = text.length > max_chars;
        const keep = ["content-type", "content-length", "payment-response", "payment-receipt", "www-authenticate", "payment-required"];
        const out = {
          status: response.status,
          headers: Object.fromEntries([...response.headers.entries()].filter(([k]) => keep.includes(k.toLowerCase()))),
          body: truncated ? text.slice(0, max_chars) : text,
          truncated,
          payment: receipt ? { scheme: receipt.scheme, network: receipt.network, asset: receipt.asset, amount: receipt.amount, usd: (receipt.details as { usd?: string } | undefined)?.usd, confidential: receipt.confidential, transactions: receipt.transactions, receiptId: receipt.id } : undefined,
        };
        return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
      } catch (e) {
        if (e instanceof PolicyViolation) {
          const { remaining } = await client.policy.remaining(client.config.agentId);
          const msg = `Payment denied by the owner's policy: ${e.decision.reason}. Remaining budget — hour: ${usd(remaining.hour) ?? "n/a"}, day: ${usd(remaining.day) ?? "n/a"}, month: ${usd(remaining.month) ?? "n/a"}. Ask the owner to raise the limit or use a cheaper resource.`;
          return { content: [{ type: "text", text: msg }], isError: true };
        }
        return { content: [{ type: "text", text: `fetch failed: ${(e as Error).message}` }], isError: true };
      }
    },
  );

  server.registerTool(
    "sotto_budget",
    {
      title: "Spend policy and remaining budget",
      description: "What this agent is allowed to spend: per-payment cap, rolling hourly/daily/monthly budgets with what remains, host allow/deny lists, expiry, and whether it is paused.",
      inputSchema: {},
      outputSchema: {
        agentId: z.string(), paused: z.boolean(), maxPerPaymentUsd: z.string().optional(),
        remainingUsd: z.object({ hour: z.string().optional(), day: z.string().optional(), month: z.string().optional() }),
        spentUsd: z.object({ hour: z.string(), day: z.string(), month: z.string() }),
        allowHosts: z.array(z.string()).optional(), denyHosts: z.array(z.string()).optional(), allowNetworks: z.array(z.string()).optional(), expiresAt: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const { policy, remaining, spent } = await client.policy.remaining(client.config.agentId);
      const out = {
        agentId: client.config.agentId, paused: Boolean(policy?.paused), maxPerPaymentUsd: usd(policy?.maxPerPayment),
        remainingUsd: { hour: usd(remaining.hour), day: usd(remaining.day), month: usd(remaining.month) },
        spentUsd: { hour: formatUsd6(spent.hour), day: formatUsd6(spent.day), month: formatUsd6(spent.month) },
        allowHosts: policy?.allowHosts, denyHosts: policy?.denyHosts, allowNetworks: policy?.allowNetworks, expiresAt: policy?.expiresAt?.toISOString(),
      };
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
    },
  );

  server.registerTool(
    "sotto_receipts",
    {
      title: "Payment receipts",
      description: "Signed receipts for this agent's payments, newest first. Amounts are in the asset's atomic units with a USD estimate; confidential receipts describe amounts only the owner can see on-chain.",
      inputSchema: { limit: z.number().int().min(1).max(200).default(20), since: z.string().datetime().optional().describe("ISO timestamp lower bound") },
      outputSchema: { receipts: z.array(z.object({ id: z.string(), at: z.string(), resource: z.string(), protocol: z.string(), scheme: z.string(), network: z.string(), asset: z.string(), amount: z.string(), decimals: z.number(), usd: z.string().optional(), confidential: z.boolean(), transactions: z.array(z.string()), paymentId: z.string() })), total: z.number() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit, since }) => {
      const all = (await client.receipts.list({ agentId: client.config.agentId, since: since ? new Date(since) : undefined })).sort((a, b) => b.at.localeCompare(a.at));
      const out = { receipts: all.slice(0, limit).map(receiptView), total: all.length };
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
    },
  );

  server.registerTool(
    "sotto_decisions",
    {
      title: "Policy decisions",
      description: "Recent allow/deny decisions the policy engine made for this agent, newest first, with the reason for each.",
      inputSchema: { limit: z.number().int().min(1).max(200).default(20) },
      outputSchema: { decisions: z.array(z.object({ id: z.string(), at: z.string(), resource: z.string(), network: z.string(), asset: z.string(), amount: z.string(), usd: z.string().optional(), allowed: z.boolean(), reason: z.string() })) },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit }) => {
      const list = (await client.decisions()).slice(-limit).reverse();
      const out = { decisions: list.map(d => ({ id: d.id, at: d.at.toISOString(), resource: d.resource, network: d.network, asset: d.asset, amount: d.amount.toString(), usd: usd(d.usd6), allowed: d.allowed, reason: d.reason })) };
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
    },
  );

  server.registerTool(
    "sotto_set_paused",
    {
      title: "Pause or resume spending",
      description: "The kill switch. While paused, every payment is refused; fetches of free resources still work. Resuming re-enables the policy as configured.",
      inputSchema: { paused: z.boolean() },
      outputSchema: { paused: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ paused }) => {
      client.pause(paused);
      const out = { paused };
      return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
    },
  );
}
