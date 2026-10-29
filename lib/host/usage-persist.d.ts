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
    view: () => {
        date: string;
        perProvider: Record<string, ProviderUsage>;
    };
    /** Write any pending increments immediately. */
    flushNow: () => void;
    /** Providers with un-persisted increments. */
    pendingProviders: () => string[];
    /** Flush what is pending and stop the timer. */
    dispose: () => void;
}
/** Local (not UTC) YYYY-MM-DD key — "today" must match the operator's clock. */
export declare function localDateKey(date: Date): string;
/** The `keepDays` date keys ending at `today`, oldest first. */
export declare function recentDateKeys(today: Date, keepDays: number): string[];
/** Keep only usable entries inside the current window; drops hand-edited junk. */
export declare function pruneBuckets(buckets: unknown, today: Date, keepDays: number): UsageBuckets;
/**
 * Create a coalescing persistence scheduler for call counters.
 * @param write - Persists the merged, pruned bucket map (the settings write).
 * @param options - Window, clock and window-size overrides.
 * @returns The scheduler.
 */
export declare function createUsagePersist(write: (buckets: UsageBuckets) => void, options?: UsagePersistOptions): UsagePersist;
