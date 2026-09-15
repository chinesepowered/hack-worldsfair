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
  /** Flip an allowed decision to denied after the fact (the payment never happened) so it stops counting against budgets. */
  void(id: string, reason: string): Promise<void>;
  /** Sum of allowed spend for an agent since `since`. */
  spentSince(agentId: string, since: Date): Promise<Usd6>;
  list(agentId?: string): Promise<Decision[]>;
}

export class MemoryDecisionLog implements DecisionLog {
  readonly decisions: Decision[] = [];
  async append(d: Decision) { this.decisions.push(d); }
  async void(id: string, reason: string) {
    const d = this.decisions.find(x => x.id === id);
    if (d && d.allowed) { d.allowed = false; d.reason = `voided: ${reason}`; d.remaining = undefined; }
  }
  async spentSince(agentId: string, since: Date) {
    let total = 0n;
    for (const d of this.decisions) if (d.agentId === agentId && d.allowed && d.at >= since && d.usd6 !== null) total += d.usd6;
    return total;
  }
  async list(agentId?: string) { return this.decisions.filter(d => !agentId || d.agentId === agentId); }
}

/** Wire form of a decision: bigints as decimal strings, dates as ISO — plus `void` lines that flip an earlier decision. */
type DecisionLine =
  | { id: string; at: string; agentId: string; resource: string; network: string; asset: string; amount: string; usd6: string | null; allowed: boolean; reason: string; remaining?: { hour?: string; day?: string; month?: string } }
  | { void: string; reason: string; at: string };

/**
 * Append-only JSON-lines decision log, so budgets survive restarts and one-shot processes (the `sotto` CLI runs the
 * policy engine fresh on every call). A void is appended as its own line rather than rewriting history.
 */
export class FileDecisionLog implements DecisionLog {
  private loaded: Promise<Decision[]> | undefined;
  constructor(readonly path: string) {}
  private async load() {
    if (!this.loaded) {
      this.loaded = (async () => {
        const { readFile } = await import("node:fs/promises");
        const out: Decision[] = [];
        try {
          for (const line of (await readFile(this.path, "utf8")).split("\n")) {
            if (!line.trim()) continue;
            const l = JSON.parse(line) as DecisionLine;
            if ("void" in l) {
              const d = out.find(x => x.id === l.void);
              if (d && d.allowed) { d.allowed = false; d.reason = `voided: ${l.reason}`; d.remaining = undefined; }
              continue;
            }
            const rem = l.remaining;
            out.push({
              ...l, at: new Date(l.at), amount: BigInt(l.amount), usd6: l.usd6 === null ? null : BigInt(l.usd6),
              remaining: rem ? { hour: rem.hour === undefined ? undefined : BigInt(rem.hour), day: rem.day === undefined ? undefined : BigInt(rem.day), month: rem.month === undefined ? undefined : BigInt(rem.month) } : undefined,
            });
          }
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
        return out;
      })();
    }
    return this.loaded;
  }
  private async write(line: DecisionLine) {
    const { appendFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, JSON.stringify(line) + "\n", { mode: 0o600 });
  }
  async append(d: Decision) {
    (await this.load()).push(d);
    const rem = d.remaining;
    await this.write({
      id: d.id, at: d.at.toISOString(), agentId: d.agentId, resource: d.resource, network: d.network, asset: d.asset,
      amount: d.amount.toString(), usd6: d.usd6 === null ? null : d.usd6.toString(), allowed: d.allowed, reason: d.reason,
      remaining: rem ? { hour: rem.hour?.toString(), day: rem.day?.toString(), month: rem.month?.toString() } : undefined,
    });
  }
  async void(id: string, reason: string) {
    const d = (await this.load()).find(x => x.id === id);
    if (d && d.allowed) {
      d.allowed = false; d.reason = `voided: ${reason}`; d.remaining = undefined;
      await this.write({ void: id, reason, at: new Date().toISOString() });
    }
  }
  async spentSince(agentId: string, since: Date) {
    let total = 0n;
    for (const d of await this.load()) if (d.agentId === agentId && d.allowed && d.at >= since && d.usd6 !== null) total += d.usd6;
    return total;
  }
  async list(agentId?: string) { return (await this.load()).filter(d => !agentId || d.agentId === agentId); }
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

  /** Remaining budget per configured window, and the policy itself — for dashboards and agents asking "what can I still spend?". */
  async remaining(agentId: string, now = this.now()): Promise<{ policy: Policy | undefined; remaining: { hour?: Usd6; day?: Usd6; month?: Usd6 }; spent: { hour: Usd6; day: Usd6; month: Usd6 } }> {
    const policy = this.policies.get(agentId);
    const spent = {
      hour: await this.log.spentSince(agentId, new Date(now.getTime() - 3_600_000)),
      day: await this.log.spentSince(agentId, new Date(now.getTime() - 86_400_000)),
      month: await this.log.spentSince(agentId, new Date(now.getTime() - 30 * 86_400_000)),
    };
    const remaining: { hour?: Usd6; day?: Usd6; month?: Usd6 } = {};
    if (policy?.perHour !== undefined) remaining.hour = policy.perHour - spent.hour;
    if (policy?.perDay !== undefined) remaining.day = policy.perDay - spent.day;
    if (policy?.perMonth !== undefined) remaining.month = policy.perMonth - spent.month;
    return { policy, remaining, spent };
  }

  /** Decide and log. Throws PolicyViolation when denied. */
  async authorize(intent: PaymentIntent): Promise<Decision> {
    const d = await this.evaluate(intent);
    await this.log.append(d);
    if (!d.allowed) throw new PolicyViolation(d);
    return d;
  }

  /** A payment that was authorized but never settled must not consume budget. */
  async voidDecision(id: string, reason: string): Promise<void> { await this.log.void(id, reason); }

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

/** Hostname (no port) for URLs; `mcp:<tool path>` for MCP resources; the raw string otherwise. */
export function hostOf(resource: string): string {
  try {
    const u = new URL(resource);
    return u.protocol === "mcp:" ? `mcp:${u.host}${u.pathname}` : u.hostname;
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
