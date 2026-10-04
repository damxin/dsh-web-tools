/**
 * dsh-web-tools — Host configuration: plugin Config schema + read/write handle.
 *
 * dsh 0.1.7 replaced the old `settings.register()` namespace API with a
 * declarative model: the plugin exports a schemastery `Config` schema, the
 * loader validates it, fills the schema-declared defaults and hands the
 * resolved config to `apply(ctx, config)`. Fields declared `.volatile()` update
 * live (no plugin remount) and are the ONLY paths `settings.update` accepts —
 * which is how the settings card persists edits. API keys are NOT here — they
 * live in the credentials domain (`WEB_TOOLS_*` refs).
 * @module
 */
import z from "@deepseek-ai/schemastery";
import type { WebToolsContext, WebToolsSettingsService } from "./context-types.ts";
import type { QuotaSnapshot } from "./quota.ts";
import type { StoredProviderOptions } from "../shared/provider-options.ts";
import type { SearchRoutingPolicy } from "../shared/api-types.ts";

/** Persistent search routing policy id (shared with the client card). */
export type ToolSearchRoutingPolicy = SearchRoutingPolicy;

/** Settings namespace for this plugin (= the cordis.patch.yml insert row id). */
export const SETTINGS_NS = "dsh-web-tools";

/** Default provider when nothing is configured. Changed from tavily to exa
 *  based on P5 evaluation: Exa achieves 72.2% Top-1, 97.2% Top-3 evidence,
 *  75% official source hit, 0% generic, 0% error across 36 tasks.
 *  This only affects new installs — existing users keep their saved provider. */
export const DEFAULT_PROVIDER = "exa";

/**
 * Explicit defaults — the single source of truth mirrored onto the schema
 * fields below (`.default(...)`); the loader folds them into the resolved
 * config, and read() falls back to them when no resolved config is available.
 */
export const DEFAULT_SETTINGS = {
  enabled: true,
  defaultProvider: DEFAULT_PROVIDER,
  // Per-attempt budget for ONE provider call (the DSH tool owns the overall
  // web_search timeout). Distinct from tool-level timeout: this is how long a
  // single provider may run before we abort it and try the next one.
  providerAttemptTimeoutMs: 10000,
  fallbackOrder: [] as string[],
  providerBaseUrls: {} as Record<string, string>,
  providerEnabled: {} as Record<string, boolean>,
  platformEnabled: { xiaohongshu: true, x: true } as Record<string, boolean>,
  providerOptions: {} as StoredProviderOptions,
  // Brave has NO quota endpoint — its only quota signal is the X-RateLimit-*
  // response header captured during a real search. Persisted here so a
  // restart does not forget the last known balance (keyed by API key).
  braveQuotaCache: {} as Record<string, QuotaSnapshot>,
  // Search routing policy: how the runtime picks the starting provider per
  // search query. "ordered" = always from the first available; "round-robin"
  // and "random" rotate the start offset (see routing-policy.ts).
  searchRoutingPolicy: "ordered" as ToolSearchRoutingPolicy,
  // Outbound proxy for provider HTTP calls ("http://host:port"). Empty = not
  // configured → the standard env vars / Windows system proxy detection in
  // fetch-proxy.ts apply. Applies to EVERY provider unless marked direct.
  proxyUrl: "",
  // Providers marked here (true) NEVER use a proxy — their calls go direct
  // even when proxyUrl/env/system would tunnel them (e.g. Tavily direct
  // while Brave goes through the proxy). Absent = follow the global proxy.
  providerProxyDirect: {} as Record<string, boolean>,
  // Page UI language: "auto" follows the DSH UI language; "zh"/"en" force the
  // page to that language regardless of the DSH-wide preference.
  uiLanguage: "auto" as "auto" | "zh" | "en",
};

/** Plain resolved-settings shape the Host code consumes (volatile refs unwrapped). */
export interface WebToolsSettings {
  enabled: boolean;
  defaultProvider: string;
  providerAttemptTimeoutMs: number;
  fallbackOrder: string[];
  providerBaseUrls: Record<string, string>;
  providerEnabled: Record<string, boolean>;
  platformEnabled: Record<string, boolean>;
  providerOptions: StoredProviderOptions;
  /** Brave per-key quota snapshots captured from search response headers. */
  braveQuotaCache: Record<string, QuotaSnapshot>;
  /** Search routing policy (see shared api-types). */
  searchRoutingPolicy: ToolSearchRoutingPolicy;
  /**
   * Outbound proxy URL for provider HTTP calls ("" = unset → env/system
   * detection). Only http:// / https:// URLs are valid.
   */
  proxyUrl: string;
  /** Providers whose calls go direct (true), bypassing every proxy source. */
  providerProxyDirect: Record<string, boolean>;
  /** Page UI language: "auto" follows the DSH UI language, zh/en force it. */
  uiLanguage: "auto" | "zh" | "en";
}

/**
 * The plugin Config schema (cordis convention: the loader picks up the
 * `Config` export, validates the row's config and fills these defaults).
 * EVERY field is declared volatile: rc.1 `settings.update` refuses
 * non-volatile paths, and the settings card must be able to save every knob
 * here live without remounting the plugin. At runtime the resolved values of
 * volatile fields are live refs — Host code reads them through
 * `installConfig().read()`, which unwraps them per call.
 */
export const Config = z.object({
  enabled: z.boolean().default(DEFAULT_SETTINGS.enabled).volatile(),
  defaultProvider: z.string().default(DEFAULT_SETTINGS.defaultProvider).volatile(),
  providerAttemptTimeoutMs: z.number().step(1).min(1000).max(60000).default(DEFAULT_SETTINGS.providerAttemptTimeoutMs).volatile(),
  fallbackOrder: z.array(z.string()).default(DEFAULT_SETTINGS.fallbackOrder).volatile(),
  providerBaseUrls: z.dict(z.string()).default(DEFAULT_SETTINGS.providerBaseUrls).volatile(),
  providerEnabled: z.dict(z.boolean()).default(DEFAULT_SETTINGS.providerEnabled).volatile(),
  platformEnabled: z.dict(z.boolean()).default(DEFAULT_SETTINGS.platformEnabled).volatile(),
  providerOptions: z.dict(z.any()).default(DEFAULT_SETTINGS.providerOptions).volatile(),
  braveQuotaCache: z.dict(z.any()).default(DEFAULT_SETTINGS.braveQuotaCache).volatile(),
  searchRoutingPolicy: z.union([z.const("ordered"), z.const("round-robin"), z.const("random")]).default(DEFAULT_SETTINGS.searchRoutingPolicy).volatile(),
  proxyUrl: z.string().default(DEFAULT_SETTINGS.proxyUrl).volatile(),
  providerProxyDirect: z.dict(z.boolean()).default(DEFAULT_SETTINGS.providerProxyDirect).volatile(),
  uiLanguage: z.union([z.const("auto"), z.const("zh"), z.const("en")]).default(DEFAULT_SETTINGS.uiLanguage).volatile(),
});

/** A settings-scope handle: current value + write path. */
export interface ConfigHandle {
  /** Resolve the current effective section (re-read each call → live edits apply). */
  read: () => WebToolsSettings;
  /** Write a partial patch into the namespace; resolves when persisted. */
  write: (patch: Partial<WebToolsSettings>) => Promise<void>;
  /**
   * Called once the settings service is reachable (ctx.inject callback). The
   * resolved config passed to apply() already carries persisted values, but
   * boot work that must not race service startup still waits for this.
   */
  onMounted: (cb: () => void) => void;
}

/** A live volatile ref the loader produces for `.volatile()` schema fields. */
interface VolatileRef {
  get: () => unknown;
}

function isVolatileRef(value: unknown): value is VolatileRef {
  return typeof value === "object" && value !== null && typeof (value as VolatileRef).get === "function";
}

/** Deep-unwrap volatile refs into plain JSON-safe values (fresh objects). */
function plainValue(value: unknown): unknown {
  let current = value;
  while (isVolatileRef(current)) current = current.get();
  if (Array.isArray(current)) return current.map(plainValue);
  if (current !== null && typeof current === "object") {
    return Object.fromEntries(
      Object.entries(current as Record<string, unknown>).map(([key, child]) => [key, plainValue(child)]),
    );
  }
  return current;
}

/** Snapshot the resolved config into the plain WebToolsSettings shape. */
function snapshotSettings(resolved: unknown): WebToolsSettings {
  const source = resolved !== null && typeof resolved === "object" ? (resolved as Record<string, unknown>) : undefined;
  const out: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const value = source === undefined ? undefined : source[key];
    out[key] = value === undefined ? plainValue(fallback) : plainValue(value);
  }
  return out as unknown as WebToolsSettings;
}

/**
 * Build the config handle. `resolved` is the loader-resolved plugin config
 * handed to `apply(ctx, config)` — volatile fields arrive as live refs, so
 * read() reflects settings edits immediately. Writes go through the settings
 * service (`SettingsForms.update`), which persists into the profile patch and
 * reconciles the live refs; it only accepts volatile paths, which every
 * schema field above declares.
 */
export function installConfig(ctx: WebToolsContext, resolved?: unknown): ConfigHandle {
  // The settings namespace is the loader entry id authored in cordis.patch.yml.
  const ns = ctx.fiber?.entry?.options?.id ?? SETTINGS_NS;
  let service: WebToolsSettingsService | undefined;
  // Set only on hosts that still expose register() (DSH pre-0.1.7); reads and
  // writes then prefer the registered scope.
  let scope: { get?: () => unknown; update: (patch: object) => Promise<void> } | undefined;
  let mounted = false;
  const mountedCbs: Array<() => void> = [];
  // Synchronous echo of local writes. `service.update()` reconciles the loader's
  // volatile refs asynchronously, so without this a read() right after a save
  // (the client re-fetches config immediately) would still see the old value.
  const overlay: Partial<WebToolsSettings> = {};

  ctx.inject(["settings"], (sctx) => {
    service = sctx.settings;
    if (typeof service?.register === "function") {
      try {
        scope = service.register(ns, Config, { base: snapshotSettings(resolved) });
      } catch {
        /* register rejected the schema — fall through to the declarative path */
      }
    }
    if (!scope && typeof service?.configure === "function") {
      // DSH 0.1.7+: no register(). Ask SettingsForms not to auto-generate an
      // empty generic page for this namespace (the client card provides the
      // UI). Harmless on hosts without configure().
      const svc = service;
      const configure = svc.configure;
      try {
        ctx.effect?.(() => configure!({ auto: false }, (ctx as unknown as { fiber?: unknown }).fiber));
      } catch {
        /* older settings service without configure() */
      }
    }
    mounted = true;
    // Persisted values are already folded into `resolved` by the loader; run
    // deferred boot work now that the settings service is definitely up.
    for (const cb of mountedCbs.splice(0)) cb();
  });

  return {
    read: () => ({
      ...snapshotSettings(scope?.get ? scope.get() : resolved),
      ...overlay,
    }),
    write: async (patch) => {
      if (!scope && !service) throw new Error("dsh-web-tools settings namespace is not mounted");
      Object.assign(overlay, patch);
      if (scope) await scope.update(patch as object);
      else await service!.update(ns, patch as object);
    },
    onMounted: (cb) => {
      if (mounted) cb();
      else mountedCbs.push(cb);
    },
  };
}
