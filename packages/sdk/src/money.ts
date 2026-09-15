/**
 * Money handling for policy decisions.
 *
 * Every rail settles in its own asset and atomic units (pathUSD 6dp on Tempo, a Token-2022 mint on
 * Solana, zatoshis on Zcash). Spend policies are written in one unit — micro-dollars (USD × 10^6) —
 * so a budget means the same thing on every chain. A PriceSource converts; stablecoins are 1:1.
 */

/** Integer micro-dollars: $1.00 = 1_000_000n. */
export type Usd6 = bigint;

export type AssetRef = {
  /** CAIP-2 network id, e.g. `eip155:42431`, `solana:<genesis>`, `zcash:testnet`. */
  network: string;
  /** Asset id on that network (token address / mint) or a symbol for native assets (`ZEC`). */
  asset: string;
  decimals: number;
};

export type AssetAmount = AssetRef & { amount: bigint };

export interface PriceSource {
  /** USD price of one whole unit of the asset, as micro-dollars; `null` if unknown. */
  priceUsd6(ref: AssetRef): Promise<Usd6 | null>;
}

/** A price table for the assets we know about. Stablecoins default to $1. */
export class StaticPriceSource implements PriceSource {
  private readonly table = new Map<string, Usd6>();
  constructor(entries: Array<[network: string, asset: string, priceUsd: number]> = []) {
    for (const [network, asset, price] of entries) this.set(network, asset, price);
  }
  set(network: string, asset: string, priceUsd: number): this {
    this.table.set(key(network, asset), usd6FromNumber(priceUsd));
    return this;
  }
  async priceUsd6(ref: AssetRef): Promise<Usd6 | null> {
    return this.table.get(key(ref.network, ref.asset)) ?? (isStablecoin(ref) ? 1_000_000n : null);
  }
}

const STABLE_SYMBOLS = /^(USDC|USDT|PATHUSD|ALPHAUSD|BETAUSD|THETAUSD|CASH|USD)$/i;
const STABLE_ADDRESSES = new Set([
  "0x20c0000000000000000000000000000000000000", // pathUSD (Tempo)
  "0x20c0000000000000000000000000000000000001", // AlphaUSD (Tempo testnet)
  "0x20c000000000000000000000b9537d11c60e8b50", // USDC.e (Tempo mainnet)
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e", // USDC (Base Sepolia)
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC (Base)
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // USDC (Solana devnet)
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC (Solana)
]);
export function isStablecoin(ref: AssetRef): boolean {
  return STABLE_SYMBOLS.test(ref.asset) || STABLE_ADDRESSES.has(ref.asset.toLowerCase()) || STABLE_ADDRESSES.has(ref.asset);
}

export function key(network: string, asset: string): string {
  return `${network}/${asset.toLowerCase()}`;
}

/** Convert an asset amount to micro-dollars using a price; rounds half-up to the nearest micro-dollar. */
export function toUsd6(amount: AssetAmount, priceUsd6: Usd6): Usd6 {
  const scale = 10n ** BigInt(amount.decimals);
  return (amount.amount * priceUsd6 + scale / 2n) / scale;
}

export function usd6FromNumber(usd: number): Usd6 {
  if (!Number.isFinite(usd) || usd < 0) throw new RangeError(`invalid USD amount: ${usd}`);
  return BigInt(Math.round(usd * 1_000_000));
}

export function formatUsd6(v: Usd6): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}$${whole}${frac ? "." + frac : ""}`;
}
