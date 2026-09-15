import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PolicyViolation, type SottoClient } from "@sotto/sdk";
import { z } from "zod";
import type { KillSwitch } from "./config.js";
import { budgetOp, CHARACTER_LIMIT, decisionsOp, denialMessage, fetchOp, receiptsOp, setPausedOp } from "./ops.js";

const ok = (out: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: JSON.stringify(out) }], structuredContent: out });

export function registerTools(server: McpServer, client: SottoClient, kill: KillSwitch): void {
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
          confidential: z.boolean(), transactions: z.array(z.string()), receiptId: z.string(), paymentId: z.string(),
        }).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        return ok(await fetchOp(client, args));
      } catch (e) {
        if (e instanceof PolicyViolation) return { content: [{ type: "text", text: await denialMessage(client, e) }], isError: true };
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
        limitsUsd: z.object({ hour: z.string().optional(), day: z.string().optional(), month: z.string().optional() }),
        allowHosts: z.array(z.string()).optional(), denyHosts: z.array(z.string()).optional(), allowNetworks: z.array(z.string()).optional(), expiresAt: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => ok(await budgetOp(client)),
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
    async (args) => ok(await receiptsOp(client, args)),
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
    async (args) => ok(await decisionsOp(client, args)),
  );

  server.registerTool(
    "sotto_set_paused",
    {
      title: "Pause or resume spending",
      description: "The kill switch. While paused, every payment is refused; fetches of free resources still work. The state persists on disk, so it holds across restarts and is shared with the `sotto` CLI. Resuming re-enables the policy as configured.",
      inputSchema: { paused: z.boolean() },
      outputSchema: { paused: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ paused }) => ok(await setPausedOp(client, kill, paused)),
  );
}
