/**
 * Spike: Tempo via the Machine Payments Protocol (mppx) — a paid endpoint on a local HTTP server,
 * an agent client that pays with pathUSD on Moderato, and a receipt.
 * Run: TEMPO_TEST_PK=0x... NODE_USE_ENV_PROXY=1 pnpm exec tsx scripts/spike-tempo-mpp.ts
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Mppx as MppxServer, tempo as tempoServer } from "mppx/server";
import { Mppx as MppxClient, tempo as tempoClient } from "mppx/client";
import { privateKeyToAccount } from "viem/accounts";

const PK = process.env.TEMPO_TEST_PK as `0x${string}` | undefined;
if (!PK) throw new Error("TEMPO_TEST_PK is required");
const PATH_USD = "0x20c0000000000000000000000000000000000000";
const MODERATO = 42431;

const agent = privateKeyToAccount(PK);
// Payee: a fresh address is fine — it only needs to receive.
const payee = privateKeyToAccount(("0x" + "11".repeat(32)) as `0x${string}`);
console.log("agent", agent.address, "→ payee", payee.address);

// ---- server: a paid API ---------------------------------------------------------------------
const mppx = MppxServer.create({
  methods: [tempoServer({ currency: PATH_USD, recipient: payee.address, testnet: true })],
  secretKey: "spike-secret-key-at-least-32-bytes-long-000",
});
const paid = mppx.charge({ amount: "0.01" });

async function toRequest(req: IncomingMessage, port: number): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(`http://127.0.0.1:${port}${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: body && req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
  });
}
async function send(res: ServerResponse, r: Response) {
  res.statusCode = r.status;
  r.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await r.arrayBuffer()));
}
const server = createServer(async (req, res) => {
  try {
    const request = await toRequest(req, port);
    const response = await paid(request);
    if (response.status === 402) return send(res, response.challenge);
    return send(res, response.withReceipt(Response.json({ secret: "the premium data", at: Date.now() })));
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
});
await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
const port = (server.address() as { port: number }).port;
console.log(`paid API on http://127.0.0.1:${port}`);

// ---- client: an agent that pays automatically ------------------------------------------------
const { fetch: payingFetch } = MppxClient.create({
  methods: [tempoClient({ account: agent, expectedChainId: MODERATO })],
  polyfill: false,
});
const t0 = Date.now();
const r1 = await fetch(`http://127.0.0.1:${port}/premium`);
console.log("plain fetch →", r1.status, "WWW-Authenticate:", r1.headers.get("www-authenticate")?.slice(0, 120));
const r2 = await payingFetch(`http://127.0.0.1:${port}/premium`);
console.log("paying fetch →", r2.status, "in", Date.now() - t0, "ms");
console.log("body:", await r2.text());
console.log("Payment-Receipt:", r2.headers.get("payment-receipt")?.slice(0, 200));
server.close();
