#!/usr/bin/env node
/**
 * `sotto` — the shell face of the same five operations the MCP server exposes. The Agent Skill in skills/sotto tells an
 * agent with a shell how to use it; configuration is the same SOTTO_* environment as the MCP server.
 */
import { PolicyViolation } from "@sotto/sdk";
import { fromEnv } from "./config.js";
import { budgetOp, CHARACTER_LIMIT, decisionsOp, denialMessage, fetchOp, receiptsOp, setPausedOp, type FetchArgs } from "./ops.js";

const USAGE = `sotto — pay for web resources confidentially, within the owner's policy

  sotto fetch <url> [-X METHOD] [-H "Name: value"]... [-d BODY] [--max-chars N] [--json]
        Fetch a URL. If it answers 402 (x402 or MPP) and the policy allows, pay and retry.
        Body goes to stdout; when a payment happened, one receipt line goes to stderr.
  sotto budget    [--json]                       what this agent may spend, and what remains
  sotto receipts  [--limit N] [--since ISO] [--json]
  sotto decisions [--limit N] [--json]           recent allow/deny decisions with reasons
  sotto pause | sotto resume                     the kill switch — holds until resumed, shared with the MCP server

  exit codes  0 ok · 1 request failed or non-2xx · 2 usage · 3 payment denied by policy
  config      SOTTO_* environment variables — see packages/mcp-server/README.md`;

type Opts = { positional: string[]; json: boolean; method?: string; headers: string[]; data?: string; limit?: number; since?: string; maxChars?: number };

function parse(argv: string[]): Opts {
  const o: Opts = { positional: [], json: false, headers: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === "--json") o.json = true;
    else if (a === "-X" || a === "--method") o.method = next().toUpperCase();
    else if (a === "-H" || a === "--header") o.headers.push(next());
    else if (a === "-d" || a === "--data") o.data = next();
    else if (a === "--limit") o.limit = Number(next());
    else if (a === "--since") o.since = next();
    else if (a === "--max-chars") o.maxChars = Number(next());
    else if (a.startsWith("-")) throw new Error(`unknown option ${a}`);
    else o.positional.push(a);
  }
  return o;
}

const out = (v: unknown) => process.stdout.write(JSON.stringify(v, null, 2) + "\n");
const line = (...cols: Array<string | undefined>) => console.log(cols.filter(c => c !== undefined && c !== "").join("  "));

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") { console.log(USAGE); return cmd ? 0 : 2; }
  let o: Opts;
  try { o = parse(rest); } catch (e) { console.error(`sotto: ${(e as Error).message}\n\n${USAGE}`); return 2; }

  const { client, kill } = await fromEnv();
  switch (cmd) {
    case "fetch": {
      const url = o.positional[0];
      if (!url) { console.error(USAGE); return 2; }
      const headers = Object.fromEntries(o.headers.map(h => { const i = h.indexOf(":"); return [h.slice(0, i).trim(), h.slice(i + 1).trim()]; }));
      try {
        const r = await fetchOp(client, { url, method: o.method as FetchArgs["method"], headers, body: o.data, max_chars: o.maxChars ?? CHARACTER_LIMIT });
        if (o.json) out(r);
        else {
          process.stdout.write(r.body.endsWith("\n") || r.body === "" ? r.body : r.body + "\n");
          if (r.payment) console.error(`sotto: paid ${r.payment.usd ?? `${r.payment.amount} units`}${r.payment.confidential ? " confidentially" : ""} on ${r.payment.network} · receipt ${r.payment.receiptId} · tx ${r.payment.transactions[0] ?? "-"}`);
          if (r.status >= 300) console.error(`sotto: HTTP ${r.status}`);
        }
        return r.status < 300 ? 0 : 1;
      } catch (e) {
        if (!(e instanceof PolicyViolation)) throw e;
        const message = await denialMessage(client, e);
        if (o.json) out({ denied: true, reason: e.decision.reason, message });
        else console.error(`sotto: ${message}`);
        return 3;
      }
    }
    case "budget": {
      const b = await budgetOp(client);
      if (o.json) { out(b); return 0; }
      line("agent", b.agentId, b.paused ? "(PAUSED — every payment is refused until `sotto resume`)" : undefined);
      if (b.maxPerPaymentUsd) line("per payment", b.maxPerPaymentUsd);
      for (const w of ["hour", "day", "month"] as const) {
        if (b.limitsUsd[w]) line(`per ${w}`, `${b.spentUsd[w]} spent · ${b.remainingUsd[w]} left of ${b.limitsUsd[w]}`);
      }
      if (b.allowHosts?.length) line("allow hosts", b.allowHosts.join(", "));
      if (b.denyHosts?.length) line("deny hosts", b.denyHosts.join(", "));
      if (b.allowNetworks?.length) line("networks", b.allowNetworks.join(", "));
      if (b.expiresAt) line("expires", b.expiresAt);
      return 0;
    }
    case "receipts": {
      const r = await receiptsOp(client, { limit: o.limit, since: o.since });
      if (o.json) { out(r); return 0; }
      if (!r.receipts.length) console.log("no receipts yet");
      for (const x of r.receipts) line(x.at, x.usd ?? `${x.amount} units`, x.confidential ? "confidential" : "public", x.network, x.resource, x.id, x.transactions[0]);
      return 0;
    }
    case "decisions": {
      const d = await decisionsOp(client, { limit: o.limit });
      if (o.json) { out(d); return 0; }
      if (!d.decisions.length) console.log("no decisions yet");
      for (const x of d.decisions) line(x.at, x.allowed ? "allowed" : "denied ", x.usd ?? `${x.amount} units`, x.resource, x.reason);
      return 0;
    }
    case "pause":
    case "resume": {
      const r = await setPausedOp(client, kill, cmd === "pause");
      if (o.json) out(r); else console.log(r.paused ? "paused — every payment is refused until `sotto resume`" : "resumed");
      return 0;
    }
    default:
      console.error(`sotto: unknown command ${cmd}\n\n${USAGE}`);
      return 2;
  }
}

main().then(code => process.exit(code), e => { console.error(`sotto: ${(e as Error).message}`); process.exit(1); });
