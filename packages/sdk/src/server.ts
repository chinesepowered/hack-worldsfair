/**
 * SottoServer — the payee side. One object that:
 *   - speaks x402 (resource server + self-hosted facilitator) and MPP (mppx) for every configured rail,
 *   - protects express routes with a single middleware whose 402 carries BOTH protocols' challenges,
 *   - verifies confidential payments itself, from the ledger, with keys only it holds.
 */
import type { Address } from "@solana/kit";
import { x402Facilitator } from "@x402/core/facilitator";
import { x402HTTPResourceServer, x402ResourceServer, type RoutesConfig } from "@x402/core/server";
import { paymentMiddlewareFromHTTPServer } from "@x402/express";
import { declarePaymentIdentifierExtension, paymentIdentifierResourceServerExtension } from "@x402/extensions";
import type { NextFunction, Request as ExpressRequest, RequestHandler, Response as ExpressResponse } from "express";
import { Mppx, tempo } from "mppx/server";
import { solanaConfidentialServer } from "./mpp/solana-confidential.js";
import { zcashShieldedServer } from "./mpp/zcash-shielded.js";
import type { ZcashSettlerClient } from "./rails/zcash-shielded/index.js";
import { ConfidentialSvmFacilitatorScheme, ConfidentialSvmServerScheme, LocalFacilitatorClient, type ConfidentialSigner } from "./x402/solana-confidential.js";
import { ShieldedZcashFacilitatorScheme, ShieldedZcashServerScheme, ZEC_DECIMALS } from "./x402/zcash-shielded.js";

export type SottoServerConfig = {
  /** MPP secret (≥ 32 bytes) used to sign challenges. */
  secretKey: string;
  realm?: string;
  solana?: { rpcUrl: string; payee: ConfidentialSigner; usdMint: { mint: Address; decimals: number }; network: string };
  zcash?: { settler: ZcashSettlerClient; address: string; network: string; zecPriceUsd: number; waitMs?: number; requireMined?: boolean };
  tempo?: { recipient: `0x${string}`; currency?: `0x${string}`; testnet?: boolean };
};

export type SottoRoute = { price: string; description?: string; mimeType?: string };
export type SottoRoutes = Record<string, SottoRoute>;

/** What an MPP charge handler returns for a request. */
export type MppChargeResult = { status: number; challenge?: Response; withReceipt?: (r: Response) => Response };
export type MppServer = ReturnType<typeof Mppx.create> & { charge: (request: Record<string, unknown>) => (request: Request) => Promise<MppChargeResult> };

export class SottoServer {
  readonly x402: x402ResourceServer;
  readonly mpp: MppServer;
  private constructor(readonly config: SottoServerConfig, x402: x402ResourceServer, mpp: MppServer) {
    this.x402 = x402;
    this.mpp = mpp;
  }

  static create(config: SottoServerConfig): SottoServer {
    const facilitator = new x402Facilitator();
    const x402 = new x402ResourceServer(new LocalFacilitatorClient(facilitator)).registerExtension(paymentIdentifierResourceServerExtension);
    const methods: unknown[] = [];
    if (config.solana) {
      const { rpcUrl, payee, usdMint, network } = config.solana;
      facilitator.register(network as `${string}:${string}`, new ConfidentialSvmFacilitatorScheme({ rpcUrl, payee }));
      x402.register(network as `${string}:${string}`, new ConfidentialSvmServerScheme({ usdMint }));
      methods.push(solanaConfidentialServer({ rpcUrl, payee, mint: usdMint.mint, decimals: usdMint.decimals, network }));
    }
    if (config.zcash) {
      const z = config.zcash;
      facilitator.register(z.network as `${string}:${string}`, new ShieldedZcashFacilitatorScheme({ settler: z.settler, address: z.address, waitMs: z.waitMs, requireMined: z.requireMined }));
      x402.register(z.network as `${string}:${string}`, new ShieldedZcashServerScheme({ zecPriceUsd: z.zecPriceUsd }));
      methods.push(zcashShieldedServer({ settler: z.settler, address: z.address, network: z.network, waitMs: z.waitMs, requireMined: z.requireMined }));
    }
    if (config.tempo) {
      methods.push(...tempo({ recipient: config.tempo.recipient, currency: config.tempo.currency, testnet: config.tempo.testnet }));
    }
    if (methods.length === 0) throw new Error("SottoServer: configure at least one rail");
    const mpp = Mppx.create({ methods: methods as never, secretKey: config.secretKey, ...(config.realm ? { realm: config.realm } : {}) }) as unknown as MppServer;
    return new SottoServer(config, x402, mpp);
  }

  /** x402 payment options for a price: one per configured rail. */
  x402Accepts(price: string) {
    const accepts: Array<{ scheme: string; network: string; price: string; payTo: string }> = [];
    if (this.config.solana) accepts.push({ scheme: "confidential", network: this.config.solana.network, price, payTo: this.config.solana.payee.address });
    if (this.config.zcash) accepts.push({ scheme: "shielded", network: this.config.zcash.network, price, payTo: this.config.zcash.address });
    return accepts;
  }

  /** The MPP charge request for a price: every configured method finds the field it needs. */
  mppRequest(price: string) {
    const usd = Number(price.replace(/^\$/, ""));
    const req: Record<string, string> = { amount: usd.toString() };
    if (this.config.zcash) req.zatoshis = BigInt(Math.ceil((usd / this.config.zcash.zecPriceUsd) * 10 ** ZEC_DECIMALS)).toString();
    return req;
  }

  /** x402 route table for the given routes (feed to `paymentMiddleware` if you only want x402). */
  x402Routes(routes: SottoRoutes): RoutesConfig {
    const out: Record<string, unknown> = {};
    for (const [key, r] of Object.entries(routes)) {
      const accepts = this.x402Accepts(r.price);
      if (accepts.length === 0) continue;
      out[key] = { accepts, description: r.description, mimeType: r.mimeType, extensions: { "payment-identifier": declarePaymentIdentifierExtension(true) } };
    }
    return out as RoutesConfig;
  }

  /**
   * Express middleware protecting `routes` with both protocols.
   * Unpaid → 402 with `PAYMENT-REQUIRED` (x402) and `WWW-Authenticate: Payment` (MPP).
   * `PAYMENT-SIGNATURE` → x402 verify + settle. `Authorization: Payment` → MPP verify → receipt header.
   */
  protect(routes: SottoRoutes): RequestHandler {
    const x402Routes = this.x402Routes(routes);
    const hasX402Routes = Object.keys(x402Routes).length > 0;
    const httpServer = hasX402Routes ? new x402HTTPResourceServer(this.x402, x402Routes) : undefined;
    const x402Middleware = httpServer ? paymentMiddlewareFromHTTPServer(httpServer, undefined, undefined, true) : undefined;
    const mppRoutes = new Map<string, (request: Request) => Promise<MppChargeResult>>();
    for (const [key, r] of Object.entries(routes)) mppRoutes.set(key, this.mpp.charge(this.mppRequest(r.price)));
    const routeKey = (req: ExpressRequest) => `${req.method.toUpperCase()} ${req.path}`;

    return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
      const key = routeKey(req);
      const charge = mppRoutes.get(key);
      if (!charge) return next();
      const request = toWebRequest(req);
      try {
        const hasMpp = /^payment\s/i.test(req.headers.authorization ?? "") || Boolean(req.headers["payment-authorization"]);
        const hasX402 = Boolean(req.headers["payment-signature"]);
        if (hasMpp) {
          const r = await charge(request);
          if (r.status === 402) return sendWebResponse(res, r.challenge!);
          copyHeaders(res, r.withReceipt!(new Response()).headers);
          return next();
        }
        if (hasX402 && x402Middleware) return x402Middleware(req, res, next);
        // unpaid: build the MPP challenge, then let x402 write its 402 and merge the MPP header in
        const r = await charge(request);
        const mppChallenge = r.status === 402 ? r.challenge!.headers.get("www-authenticate") : null;
        if (!x402Middleware) {
          if (r.status === 402) return sendWebResponse(res, r.challenge!);
          copyHeaders(res, r.withReceipt!(new Response()).headers);
          return next();
        }
        if (mppChallenge) res.setHeader("WWW-Authenticate", mppChallenge);
        return x402Middleware(req, res, next);
      } catch (e) {
        return next(e);
      }
    };
  }
}

function toWebRequest(req: ExpressRequest): Request {
  const url = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v); else if (Array.isArray(v)) headers.set(k, v.join(", "));
  const raw = (req as { rawBody?: Buffer }).rawBody;
  const body: BodyInit | undefined = req.method === "GET" || req.method === "HEAD" ? undefined : raw ? new Uint8Array(raw) : req.body !== undefined ? JSON.stringify(req.body) : undefined;
  return new Request(url, { method: req.method, headers, body });
}
async function sendWebResponse(res: ExpressResponse, r: Response) {
  res.status(r.status);
  copyHeaders(res, r.headers);
  res.end(Buffer.from(await r.arrayBuffer()));
}
function copyHeaders(res: ExpressResponse, headers: Headers) {
  headers.forEach((v, k) => res.setHeader(k, v));
}
