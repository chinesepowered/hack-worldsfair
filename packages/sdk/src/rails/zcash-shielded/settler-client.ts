/**
 * Client for `services/zcash-settler serve` — the Rust sidecar that holds the Zcash wallet.
 * A payer runs a settler with a spending key; a payee runs one with a viewing key only.
 */
export type SettlerBalance = {
  chain_tip_height: number;
  fully_scanned_height: number;
  total: number;
  sapling_spendable: number;
  orchard_spendable: number;
  transparent_spendable: number;
};

export type ReceivedOutput = {
  txid: string;
  mined_height: number | null;
  block_time: number | null;
  zatoshis: number;
  pool: "transparent" | "sapling" | "orchard" | "unknown";
  memo: string | null;
};

export class ZcashSettlerClient {
  constructor(readonly baseUrl: string, private readonly fetchImpl: typeof fetch = fetch) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
    if (!res.ok) throw new ZcashSettlerError(res.status, body.error ?? `settler returned ${res.status}`);
    return body;
  }

  health() { return this.call<{ ok: boolean; network: string }>("/health"); }
  address() { return this.call<{ account: string; address: string }>("/address"); }
  balance() { return this.call<SettlerBalance>("/balance"); }
  sync() { return this.call<{ ok: true }>("/sync", { method: "POST" }); }

  /** Send a shielded payment; `memo` is the payment id. Returns the txid. */
  async send(args: { address: string; zatoshis: bigint | number; memo?: string }): Promise<{ txid: string }> {
    return this.call<{ txid: string }>("/send", { method: "POST", body: JSON.stringify({ address: args.address, zatoshis: Number(args.zatoshis), memo: args.memo }) });
  }

  /** Received outputs, optionally filtered by exact memo; syncs first unless `sync: false`. */
  async received(args: { memo?: string; minZatoshis?: bigint | number; sync?: boolean } = {}): Promise<ReceivedOutput[]> {
    const q = new URLSearchParams();
    if (args.memo !== undefined) q.set("memo", args.memo);
    if (args.minZatoshis !== undefined) q.set("min_zatoshis", String(args.minZatoshis));
    if (args.sync !== undefined) q.set("sync", String(args.sync));
    const r = await this.call<{ received: ReceivedOutput[] }>(`/received${q.size ? "?" + q.toString() : ""}`);
    return r.received;
  }
}

export class ZcashSettlerError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ZcashSettlerError";
  }
}
