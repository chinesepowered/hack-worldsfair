/**
 * Receipts: the owner's record of every payment, signed so it can be handed to a third party.
 *
 * For confidential rails the amount is known only because the owner holds the keys; the receipt store is
 * therefore owner-private. Auditors don't read this store — they re-derive amounts from chain data with a
 * viewing/auditor key, which is the point of the design.
 */

export type Receipt = {
  id: string;
  at: string; // ISO
  agentId: string;
  protocol: "x402" | "mpp";
  scheme: string;
  network: string;
  asset: string;
  decimals: number;
  amount: string; // atomic units, decimal string (JSON-safe)
  resource: string;
  paymentId: string;
  /** Transaction ids on the settlement chain (several for multi-tx confidential transfers). */
  transactions: string[];
  /** Whether a third party can read the amount from the chain. */
  confidential: boolean;
  /** Free-form settlement details (e.g. context accounts, memo txid). */
  details?: Record<string, unknown>;
};

export type SignedReceipt = Receipt & { signature: string; signer: string };

export interface ReceiptStore {
  put(r: SignedReceipt): Promise<void>;
  get(id: string): Promise<SignedReceipt | undefined>;
  list(filter?: { agentId?: string; since?: Date }): Promise<SignedReceipt[]>;
}

export class MemoryReceiptStore implements ReceiptStore {
  private readonly items = new Map<string, SignedReceipt>();
  async put(r: SignedReceipt) { this.items.set(r.id, r); }
  async get(id: string) { return this.items.get(id); }
  async list(filter: { agentId?: string; since?: Date } = {}) {
    return [...this.items.values()].filter(r => (!filter.agentId || r.agentId === filter.agentId) && (!filter.since || new Date(r.at) >= filter.since));
  }
}

/** Ed25519 receipt signer backed by WebCrypto; keys never leave the process. */
export class ReceiptSigner {
  private constructor(private readonly key: CryptoKeyPair, readonly publicKeyBase64: string) {}

  static async generate(): Promise<ReceiptSigner> {
    const key = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key.publicKey));
    return new ReceiptSigner(key, toBase64(raw));
  }

  async sign(r: Receipt): Promise<SignedReceipt> {
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, this.key.privateKey, ab(canonicalBytes(r))));
    return { ...r, signature: toBase64(sig), signer: this.publicKeyBase64 };
  }

  static async verify(r: SignedReceipt): Promise<boolean> {
    const { signature, signer, ...body } = r;
    const pub = await crypto.subtle.importKey("raw", ab(fromBase64(signer)), { name: "Ed25519" }, true, ["verify"]);
    return crypto.subtle.verify({ name: "Ed25519" }, pub, ab(fromBase64(signature)), ab(canonicalBytes(body)));
  }
}

/** Deterministic JSON: sorted keys, no whitespace — what gets signed. */
export function canonicalBytes(r: Receipt): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(sortKeys(r)));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map(k => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}
export function newReceiptId(): string { return `rcpt_${crypto.randomUUID().replace(/-/g, "")}`; }
export function newPaymentId(): string { return `pay_${crypto.randomUUID().replace(/-/g, "")}`; }
const toBase64 = (b: Uint8Array) => Buffer.from(b).toString("base64");
/** Copy into a fresh ArrayBuffer — WebCrypto wants BufferSource, not a possibly-shared view. */
const ab = (u8: Uint8Array): ArrayBuffer => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
const fromBase64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
