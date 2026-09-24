/**
 * dsh-web-tools — Host plugin entry.
 *
 * Registers:
 *  - the `dsh-web-tools` settings namespace (non-secret config)
 *  - a `ctx.web` search/fetch provider (multi-provider pools + fallback) so the
 *    model-facing `web_search`/`web_fetch` tools execute through it
 *  - a fenced `/web-tools/api` route prefix serving the browser settings card
 *    (config authority + credentials state + quota snapshots + test search)
 *
 * @module
 */
import type { WebToolsContext } from "./context-types.ts";
import { PROVIDER_ID } from "./registry.ts";
import type { SourceFetchOutcome } from "./sources/types.ts";
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "dsh-web-tools";
/** Services required by this plugin. */
export declare const inject: string[];
/**
 * Plugin-level config: the same schemastery schema as the settings namespace.
 * Cordis requires `Config` to be a schema instance (it calls `.validate` when
 * resolving plugin config); an empty object would crash at load.
 */
export declare const Config: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<NoInfer<{
    enabled: import("@deepseek-ai/schemastery").default<boolean, boolean, "volatile-defined">;
    defaultProvider: import("@deepseek-ai/schemastery").default<string, string, "volatile-defined">;
    providerAttemptTimeoutMs: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    fallbackOrder: import("@deepseek-ai/schemastery").default<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    providerBaseUrls: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/cosmokit").Dict<string, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<string, string>>, "volatile-defined">;
    providerEnabled: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, "volatile-defined">;
    platformEnabled: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, "volatile-defined">;
    providerOptions: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, "volatile-defined">;
    braveQuotaCache: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, "volatile-defined">;
    searchRoutingPolicy: import("@deepseek-ai/schemastery").default<"ordered" | "round-robin" | "random", "ordered" | "round-robin" | "random", "volatile-defined">;
    proxyUrl: import("@deepseek-ai/schemastery").default<string, string, "volatile-defined">;
    providerProxyDirect: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, "volatile-defined">;
    uiLanguage: import("@deepseek-ai/schemastery").default<"auto" | "zh" | "en", "auto" | "zh" | "en", "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: import("@deepseek-ai/schemastery").default<boolean, boolean, "volatile-defined">;
    defaultProvider: import("@deepseek-ai/schemastery").default<string, string, "volatile-defined">;
    providerAttemptTimeoutMs: import("@deepseek-ai/schemastery").default<number, number, "volatile-defined">;
    fallbackOrder: import("@deepseek-ai/schemastery").default<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    providerBaseUrls: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/cosmokit").Dict<string, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<string, string>>, "volatile-defined">;
    providerEnabled: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, "volatile-defined">;
    platformEnabled: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, "volatile-defined">;
    providerOptions: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, "volatile-defined">;
    braveQuotaCache: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<any, string>>, "volatile-defined">;
    searchRoutingPolicy: import("@deepseek-ai/schemastery").default<"ordered" | "round-robin" | "random", "ordered" | "round-robin" | "random", "volatile-defined">;
    proxyUrl: import("@deepseek-ai/schemastery").default<string, string, "volatile-defined">;
    providerProxyDirect: import("@deepseek-ai/schemastery").default<NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<boolean, string>>, "volatile-defined">;
    uiLanguage: import("@deepseek-ai/schemastery").default<"auto" | "zh" | "en", "auto" | "zh" | "en", "volatile-defined">;
}>>, "plain">;
export declare function toRoutedFetchResponse(url: string, outcome: SourceFetchOutcome): {
    url: string;
    statusCode: number;
    body: {
        kind: "text";
        content: string;
    };
    truncated: boolean;
};
export declare function apply(ctx: WebToolsContext, config?: unknown): void;
export { PROVIDER_ID };
