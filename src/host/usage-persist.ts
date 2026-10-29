/**
 * dsh-web-tools — persisted per-day call counters for the settings card.
 *
 * The executor's {@link ./stats.ts} ring is in-memory and bounded (200
 * entries), so "how often was this provider called today / in the last 7
 * days" cannot be answered from it: a restart forgets everything and a busy
 * day evicts yesterday. This module keeps a small bucket map
 * `{ [localDate]: { [provider]: count } }`, merged additively on flush and
 * pruned to the 7-day window, so the card can show durable counts.
 *
 * Persistence rides the same seam as Brave's quota cache: a settings write
 * costs ~2.5s on DSH 0.1.7 (profile patch + Loader reconciliation under
 * hmr.runExclusive), so records coalesce and flush at most once per quiet
 * window. A crash inside the window loses only display counters.
 * @module
 */

/** Pruned, merged bucket map as persisted into the settings namespace. */
export type UsageBuckets = Record<string, Record<string, number>>;

/** Per-provider counters for the card. */
export interface ProviderUsage {
  /** Calls dated today (host-local). */
  today: number;
  /** Calls across the last 7 host-local days, today included. */
  last7: number;
}

/** Options for {@link createUsagePersist}. */
export interface UsagePersistOptions {
  /** Quiet window before a flush, in ms (default 60s). */
  delayMs?: number;
  /** Clock, injectable for tests (also drives the date keys). */
  now?: () => Date;
  /** How many day buckets to keep, today included (default 7). */
  keepDays?: number;
}

/** Coalescing writer for per-day provider call counters. */
export interface UsagePersist {
  /** Adopt the buckets loaded from settings so past days survive a flush. */
  seed: (buckets: unknown) => void;
  /** Count `n` (default 1) calls for one provider; schedules at most one write per window. */
  record: (provider: string, n?: number) => void;
  /** Merged view for the card (today + last7 per provider). */
  view: () => { date: string; perProvider: Record<string, ProviderUsage> };
  /** Write any pending increments immediately. */
  flushNow: () => void;
  /** Providers with un-persisted increments. */
  pendingProviders: () => string[];
  /** Flush what is pending and stop the timer. */
  dispose: () => void;
}

/** Local (not UTC) YYYY-MM-DD key — "today" must match the operator's clock. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The `keepDays` date keys ending at `today`, oldest first. */
export function recentDateKeys(today: Date, keepDays: number): string[] {
  const keys: string[] = [];
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let i = keepDays - 1; i >= 0; i -= 1) {
    keys.push(localDateKey(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - i)));
  }
  return keys;
}

/** Coerce one bucket entry to a usable non-negative integer (0 = drop). */
function sanitizeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** Keep only usable entries inside the current window; drops hand-edited junk. */
export function pruneBuckets(buckets: unknown, today: Date, keepDays: number): UsageBuckets {
  const window = new Set(recentDateKeys(today, keepDays));
  const out: UsageBuckets = {};
  if (!buckets || typeof buckets !== "object") return out;
  for (const [date, providers] of Object.entries(buckets as Record<string, unknown>)) {
    if (!window.has(date) || !providers || typeof providers !== "object") continue;
    const row: Record<string, number> = {};
    for (const [provider, count] of Object.entries(providers as Record<string, unknown>)) {
      if (!provider) continue;
      const n = sanitizeCount(count);
      if (n > 0) row[provider] = n;
    }
    if (Object.keys(row).length > 0) out[date] = row;
  }
  return out;
}

/**
 * Create a coalescing persistence scheduler for call counters.
 * @param write - Persists the merged, pruned bucket map (the settings write).
 * @param options - Window, clock and window-size overrides.
 * @returns The scheduler.
 */
export function createUsagePersist(
  write: (buckets: UsageBuckets) => void,
  options: UsagePersistOptions = {},
): UsagePersist {
  const delayMs = options.delayMs ?? 60_000;
  const keepDays = options.keepDays ?? 7;
  const now = options.now ?? (() => new Date());

  let known: UsageBuckets = {};
  let dirty: UsageBuckets = {};
  let timer: ReturnType<typeof setTimeout> | null = null;

  const mergeAdditive = (a: UsageBuckets, b: UsageBuckets): UsageBuckets => {
    const out: UsageBuckets = {};
    for (const [date, providers] of Object.entries(a)) {
      out[date] = { ...providers };
    }
    for (const [date, providers] of Object.entries(b)) {
      const row = (out[date] ??= {});
      for (const [provider, count] of Object.entries(providers)) {
        row[provider] = (row[provider] ?? 0) + count;
      }
    }
    return out;
  };

  const flushNow = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (Object.keys(dirty).length === 0) return;
    // Counters ADD across flushes (a quota snapshot overwrites, a count
    // accumulates): known holds everything already persisted, dirty only the
    // increments since.
    const merged = pruneBuckets(mergeAdditive(known, dirty), now(), keepDays);
    dirty = {};
    known = merged;
    write(merged);
  };

  const schedule = () => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      flushNow();
    }, delayMs);
    // Never keep the process alive just to persist display counters.
    (timer as unknown as { unref?: () => void }).unref?.();
  };

  return {
    seed(buckets) {
      known = pruneBuckets(buckets, now(), keepDays);
    },
    record(provider, n = 1) {
      if (!provider || !Number.isFinite(n) || n <= 0) return;
      const date = localDateKey(now());
      const row = (dirty[date] ??= {});
      row[provider] = (row[provider] ?? 0) + n;
      schedule();
    },
    view() {
      const today = now();
      const todayKey = localDateKey(today);
      const windowKeys = recentDateKeys(today, keepDays);
      const merged = mergeAdditive(known, dirty);
      const perProvider: Record<string, ProviderUsage> = {};
      for (const date of windowKeys) {
        for (const [provider, count] of Object.entries(merged[date] ?? {})) {
          const agg = (perProvider[provider] ??= { today: 0, last7: 0 });
          agg.last7 += count;
          if (date === todayKey) agg.today += count;
        }
      }
      return { date: todayKey, perProvider };
    },
    flushNow,
    pendingProviders: () => [...new Set(Object.values(dirty).flatMap((row) => Object.keys(row)))],
    dispose() {
      flushNow();
    },
  };
}
