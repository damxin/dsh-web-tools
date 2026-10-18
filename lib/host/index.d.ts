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
/**
 * Services required before `apply()` runs.
 *
 * EVERY name here MUST be a host service some plugin registers with
 * `super(ctx, "<name>")`. Cordis keeps a fiber whose inject map still has an
 * unresolved name permanently INACTIVE (`_refresh()` in
 * @deepseek-ai/cordis): `apply()` never runs and nothing is reported — no
 * thrown error, no log line. `webRuntime` used to sit in this list: it is the
 * CLASS name of the web service (`export class WebRuntime`, registered as
 * `ctx.web` — packages/web/web/src/index.ts:76,93), not a service name, and a
 * name here matches only the string handed to `super(ctx, …)`. The whole
 * plugin therefore stayed dormant:
 *   - `ctx.web.registerSearchProvider()` never ran, so the host's configured
 *     provider failed every search with
 *     `configured web provider "dsh-web-tools" is not registered`;
 *   - `registerRoutes()` never ran, so `/web-tools/api` was never in the
 *     webserver prefix table. The SPA fallback seat owns every unmatched
 *     request and answers a non-GET/HEAD one with a BODYLESS 405
 *     (packages/host/frontend-static/src/index.ts:124-127), which the card
 *     could only report as `web-tools API returned non-JSON (HTTP 405)`.
 *
 * Verified service names (DSH monorepo):
 *   webServer  — packages/host/webserver/src/index.ts
 *   credentials— packages/credentials/credentials/src/index.ts
 *   web        — packages/web/web/src/index.ts
 *   agents     — packages/core/agent/src/index.ts
 *   commands   — packages/interaction/commands/src/index.ts
 *
 * `settings` is deliberately NOT here: it is an OPTIONAL child inject inside
 * installConfig(), which is the contract DSH documents for a plugin that ships
 * its own settings page — "the business plugin runs without Settings"
 * (packages/settings/settings/README.md:39).
 */
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
