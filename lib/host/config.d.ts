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
import type { WebToolsContext } from "./context-types.ts";
import type { QuotaSnapshot } from "./quota.ts";
import type { StoredProviderOptions } from "../shared/provider-options.ts";
import type { SearchRoutingPolicy } from "../shared/api-types.ts";
/** Persistent search routing policy id (shared with the client card). */
export type ToolSearchRoutingPolicy = SearchRoutingPolicy;
/** Settings namespace for this plugin (= the cordis.patch.yml insert row id). */
export declare const SETTINGS_NS = "dsh-web-tools";
/** Default provider when nothing is configured. Changed from tavily to exa
 *  based on P5 evaluation: Exa achieves 72.2% Top-1, 97.2% Top-3 evidence,
 *  75% official source hit, 0% generic, 0% error across 36 tasks.
 *  This only affects new installs — existing users keep their saved provider. */
export declare const DEFAULT_PROVIDER = "exa";
/**
 * Explicit defaults — the single source of truth mirrored onto the schema
 * fields below (`.default(...)`); the loader folds them into the resolved
 * config, and read() falls back to them when no resolved config is available.
 */
export declare const DEFAULT_SETTINGS: {
    enabled: boolean;
    defaultProvider: string;
    providerAttemptTimeoutMs: number;
    fallbackOrder: string[];
    providerBaseUrls: Record<string, string>;
    providerEnabled: Record<string, boolean>;
    platformEnabled: Record<string, boolean>;
    providerOptions: StoredProviderOptions;
    braveQuotaCache: Record<string, QuotaSnapshot>;
    searchRoutingPolicy: ToolSearchRoutingPolicy;
    proxyUrl: string;
    providerProxyDirect: Record<string, boolean>;
    uiLanguage: "auto" | "zh" | "en";
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
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    defaultProvider: z<string, string, "volatile-defined">;
    providerAttemptTimeoutMs: z<number, number, "volatile-defined">;
    fallbackOrder: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    providerBaseUrls: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<string, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<string, string>>, "volatile-defined">;
    providerEnabled: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, "volatile-defined">;
    platformEnabled: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, "volatile-defined">;
    providerOptions: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, "volatile-defined">;
    braveQuotaCache: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, "volatile-defined">;
    searchRoutingPolicy: z<"ordered" | "round-robin" | "random", "ordered" | "round-robin" | "random", "volatile-defined">;
    proxyUrl: z<string, string, "volatile-defined">;
    providerProxyDirect: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, "volatile-defined">;
    uiLanguage: z<"auto" | "zh" | "en", "auto" | "zh" | "en", "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "volatile-defined">;
    defaultProvider: z<string, string, "volatile-defined">;
    providerAttemptTimeoutMs: z<number, number, "volatile-defined">;
    fallbackOrder: z<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    providerBaseUrls: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<string, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<string, string>>, "volatile-defined">;
    providerEnabled: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, "volatile-defined">;
    platformEnabled: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, "volatile-defined">;
    providerOptions: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, "volatile-defined">;
    braveQuotaCache: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, "volatile-defined">;
    searchRoutingPolicy: z<"ordered" | "round-robin" | "random", "ordered" | "round-robin" | "random", "volatile-defined">;
    proxyUrl: z<string, string, "volatile-defined">;
    providerProxyDirect: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, "volatile-defined">;
    uiLanguage: z<"auto" | "zh" | "en", "auto" | "zh" | "en", "volatile-defined">;
}>>, "plain">;
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
/**
 * Build the config handle. `resolved` is the loader-resolved plugin config
 * handed to `apply(ctx, config)` — volatile fields arrive as live refs, so
 * read() reflects settings edits immediately. Writes go through the settings
 * service (`SettingsForms.update`), which persists into the profile patch and
 * reconciles the live refs; it only accepts volatile paths, which every
 * schema field above declares.
 */
export declare function installConfig(ctx: WebToolsContext, resolved?: unknown): ConfigHandle;
