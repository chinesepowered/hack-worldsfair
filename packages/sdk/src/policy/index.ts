/**
 * Spend policy: the rule set that bounds what an agent may pay, and the engine that decides.
 *
 * Decisions happen *before* any signature is produced, on the agent's machine. Every decision —
 * allow or deny — is appended to a log so the owner can see what the agent tried to do.
 */
import { type AssetAmount, type PriceSource, StaticPriceSource, type Usd6, formatUsd6, toUsd6 } from "../money.js";

export type Policy = {
  agentId: string;
  /** Hard cap on a single payment, micro-dollars. */
  maxPerPayment?: Usd6;
  /** Rolling budgets, micro-dollars. */
  perHour?: Usd6;
  perDay?: Usd6;
  perMonth?: Usd6;
  /** Only pay resources on these hosts (exact or `*.example.com`). Empty/undefined = any host. */
  allowHosts?: string[];
  /** Never pay these hosts, even if allowed above. */
  denyHosts?: string[];
  /** Only these CAIP-2 networks. Undefined = any registered rail. */
  allowNetworks?: string[];
  /** Refuse everything after this time. */
  expiresAt?: Date;
  /** Refuse everything when set — the owner's kill switch. */
  paused?: boolean;
};

export type PaymentIntent = {
  agentId: string;
  /** The resource being paid for (URL or `mcp://tool/<name>`). */
  resource: string;
  network: string;
  asset: string;
  decimals: number;
  amount: bigint;
  /** Which protocol face produced this intent. */
  protocol: "x402" | "mpp";
  scheme: string;
};

export type Decision = {
  id: string;
  at: Date;
  agentId: string;
  resource: string;
  network: string;
  asset: string;
  amount: bigint;
  usd6: Usd6 | null;
  allowed: boolean;
  reason: string;
  /** Remaining budgets after this decision (if allowed). */
  remaining?: { hour?: Usd6; day?: Usd6; month?: Usd6 };
};

export interface DecisionLog {
  append(d: Decision): Promise<void>;
  /** Sum of allowed spend for an agent since `since`. */
  spentSince(agentId: string, since: Date): Promise<Usd6>;
  list(agentId?: string): Promise<Decision[]>;
}

export class MemoryDecisionLog implements DecisionLog {
  readonly decisions: Decision[] = [];
  async append(d: Decision) { this.decisions.push(d); }
  async spentSince(agentId: string, since: Date) {
    let total = 0n;
    for (const d of this.decisions) if (d.agentId === agentId && d.allowed && d.at >= since && d.usd6 !== null) total += d.usd6;
    return total;
  }
  async list(agentId?: string) { return this.decisions.filter(d => !agentId || d.agentId === agentId); }
}

export class PolicyViolation extends Error {
  constructor(readonly decision: Decision) {
    super(`payment denied: ${decision.reason}`);
    this.name = "PolicyViolation";
  }
}

export type PolicyEngineOptions = {
  prices?: PriceSource;
  log?: DecisionLog;
  now?: () => Date;
  /** Refuse assets with no known price (default true — an unpriced asset can't be budgeted). */
  requirePrice?: boolean;
};

export class PolicyEngine {
  private readonly policies = new Map<string, Policy>();
  private readonly prices: PriceSource;
  readonly log: DecisionLog;
  private readonly now: () => Date;
  private readonly requirePrice: boolean;

  constructor(opts: PolicyEngineOptions = {}) {
    this.prices = opts.prices ?? new StaticPriceSource();
    this.log = opts.log ?? new MemoryDecisionLog();
    this.now = opts.now ?? (() => new Date());
    this.requirePrice = opts.requirePrice ?? true;
  }

  setPolicy(p: Policy): this { this.policies.set(p.agentId, p); return this; }
  getPolicy(agentId: string): Policy | undefined { return this.policies.get(agentId); }
  pause(agentId: string, paused = true): void {
    const p = this.policies.get(agentId);
    if (p) p.paused = paused;
  }

  /** Decide and log. Throws PolicyViolation when denied. */
  async authorize(intent: PaymentIntent): Promise<Decision> {
    const d = await this.evaluate(intent);
    await this.log.append(d);
    if (!d.allowed) throw new PolicyViolation(d);
    return d;
  }

  /** Decide without logging or throwing. */
  async evaluate(intent: PaymentIntent): Promise<Decision> {
    const at = this.now();
    const base = {
      id: `dec_${crypto.randomUUID().replace(/-/g, "")}`,
      at, agentId: intent.agentId, resource: intent.resource, network: intent.network, asset: intent.asset, amount: intent.amount,
    };
    const deny = (reason: string, usd6: Usd6 | null = null): Decision => ({ ...base, usd6, allowed: false, reason });

    const policy = this.policies.get(intent.agentId);
    if (!policy) return deny(`no policy for agent ${intent.agentId}`);
    if (policy.paused) return deny("agent is paused");
    if (policy.expiresAt && at > policy.expiresAt) return deny(`policy expired at ${policy.expiresAt.toISOString()}`);
    if (intent.amount <= 0n) return deny("amount must be positive");

    const host = hostOf(intent.resource);
    if (policy.denyHosts?.some(h => hostMatches(host, h))) return deny(`host ${host} is denied`);
    if (policy.allowHosts?.length && !policy.allowHosts.some(h => hostMatches(host, h))) return deny(`host ${host} is not on the allow list`);
    if (policy.allowNetworks?.length && !policy.allowNetworks.includes(intent.network)) return deny(`network ${intent.network} is not allowed`);

    const price = await this.prices.priceUsd6({ network: intent.network, asset: intent.asset, decimals: intent.decimals });
    if (price === null) {
      if (this.requirePrice) return deny(`no price for ${intent.asset} on ${intent.network}`);
      return { ...base, usd6: null, allowed: true, reason: "allowed (unpriced asset, budgets not enforced)" };
    }
    const usd6 = toUsd6({ ...intent } as AssetAmount, price);
    if (policy.maxPerPayment !== undefined && usd6 > policy.maxPerPayment)
      return deny(`${formatUsd6(usd6)} exceeds per-payment cap ${formatUsd6(policy.maxPerPayment)}`, usd6);

    const windows: Array<[keyof NonNullable<Decision["remaining"]>, string, Usd6 | undefined, number]> = [
      ["hour", "hourly", policy.perHour, 3_600_000],
      ["day", "daily", policy.perDay, 86_400_000],
      ["month", "monthly", policy.perMonth, 30 * 86_400_000],
    ];
    const remaining: NonNullable<Decision["remaining"]> = {};
    for (const [name, label, limit, ms] of windows) {
      if (limit === undefined) continue;
      const spent = await this.log.spentSince(intent.agentId, new Date(at.getTime() - ms));
      if (spent + usd6 > limit)
        return deny(`${formatUsd6(usd6)} would exceed ${label} budget ${formatUsd6(limit)} (spent ${formatUsd6(spent)})`, usd6);
      remaining[name] = limit - spent - usd6;
    }
    return { ...base, usd6, allowed: true, reason: "allowed", remaining };
  }
}

export function hostOf(resource: string): string {
  try {
    const u = new URL(resource);
    return u.protocol === "mcp:" ? `mcp:${u.host}${u.pathname}` : u.host;
  } catch {
    return resource;
  }
}

/** `*.example.com` matches any subdomain (not the apex); otherwise exact, case-insensitive. */
export function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase(), p = pattern.toLowerCase();
  if (p.startsWith("*.")) return h.endsWith(p.slice(1)) && h.length > p.length - 1;
  return h === p;
}
