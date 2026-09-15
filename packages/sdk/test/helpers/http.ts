/** Minimal Node http ↔ fetch Request/Response adapter for MPP handler tests. */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export async function serveFetchHandler(handler: (req: Request) => Promise<Response>) {
  let port = 0;
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined;
      const request = new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body });
      const response = await handler(request);
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e));
    }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>(r => server.close(() => r())) };
}
