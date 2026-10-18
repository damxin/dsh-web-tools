/**
 * Whether `urlStr` is one of THIS provider's official default endpoints.
 *
 * Trust is derived from the requesting provider's identity, never from a global
 * URL set: a Tavily override that happens to equal SearXNG's default address
 * (`http://127.0.0.1:8080/search`) must NOT be trusted, and Jina's dynamic
 * path requests (`https://s.jina.ai/<query>`) MUST be. Each endpoint is matched
 * on scheme + hostname + port, plus:
 *  - an exact path match, or
 *  - any path under the endpoint when the endpoint declares `dynamicPath`
 *    (Jina only), so the query-in-path form stays official without opening up
 *    "any path on the domain is exempt" for other providers.
 */
export declare function isOfficialForProvider(providerName: string, urlStr: string): boolean;
/** Optional per-call behavior for fetchWithProxy. */
export interface FetchWithProxyOptions {
    /**
     * Strict provider-API mode, scoped to ONE provider identity. Passed by the
     * hosted built-in adapters so ANY operator override runs the outbound
     * policy: per-provider endpoint trust, DNS preflight, socket pinning,
     * plaintext-http authorization, and fail-closed proxying. Trust is decided by
     * THIS provider's own endpoint table — another provider's default URL is
     * never trusted. Self-hosted providers (SearXNG) deliberately keep the
     * operator-trusted legacy path: their configured URL IS the instance.
     */
    provider?: string;
}
/** Where the effective proxy came from (settings-card display). */
export type ProxySource = "config" | "env" | "system";
/**
 * Plugin-side proxy settings handed over by the host through a live getter.
 */
export interface ProxySettings {
    /** Globally configured proxy URL ("" or undefined = unset). */
    proxyUrl?: string;
    /**
     * Providers whose HTTP calls must go DIRECT, ignoring every proxy source
     * (true = direct; absent/false = follow the global resolution).
     */
    directProviders?: Record<string, boolean>;
}
/**
 * Wire (or clear) the plugin proxy settings source. Call with `undefined` to
 * detach (used by tests; the host never needs to).
 */
export declare function setProxyConfigSource(getter: (() => ProxySettings | undefined) | undefined): void;
/**
 * Validate and normalize one candidate proxy URL: trims, and requires an
 * `http://` / `https://` URL (undici's ProxyAgent only tunnels HTTP CONNECT
 * proxies — SOCKS would need a different agent). Invalid values are SKIPPED
 * with a one-time warning (fetching must keep working, not crash); the save
 * route rejects them loudly before they can be persisted.
 * @returns the trimmed URL, or undefined when unset/invalid.
 */
export declare function normalizeProxyUrl(value: string | undefined): string | undefined;
/** The plugin-configured proxy (validated); undefined when unset/invalid. */
export declare function proxyFromConfig(): string | undefined;
/** Whether one provider is marked "direct" in the plugin settings. */
export declare function isDirectProvider(provider: string): boolean;
/**
 * The proxy ONE provider's outbound calls should use: the global resolution
 * (setting → env → system), except a provider marked direct in the settings
 * never tunnels — its requests always go out directly.
 */
export declare function effectiveProxyFor(provider?: string): {
    url: string;
    source: ProxySource;
} | undefined;
/** The effective proxy and where it came from; undefined = direct fetch. */
export declare function resolveProxy(): {
    url: string;
    source: ProxySource;
} | undefined;
/**
 * Proxy support status for the settings card:
 *  - configured: a proxy is present (plugin setting, env var, or Windows
 *    system proxy) — `url`/`source` say which one is active
 *  - degraded:   a proxy is configured but undici cannot be loaded, so calls
 *                fall back to direct fetch (no tunneling)
 * Never throws (undici absence is a reportable state, not a crash). The URL
 * surfaces with any `user:pass@` masked — it is display data, not a secret.
 */
export declare function proxyStatus(): Promise<{
    configured: boolean;
    degraded: boolean;
    url?: string;
    source?: ProxySource;
}>;
/**
 * Obtain an undici ProxyAgent dispatcher for the given proxy URL.
 * Used by secure outbound transport when proxied egress is permitted.
 */
export declare function getProxyDispatcher(proxyUrl: string): Promise<unknown>;
/** The first usable proxy from the standard env vars, or undefined. */
export declare function proxyFromEnv(): string | undefined;
/**
 * Windows system proxy from the registry (HKCU Internet Settings), used when
 * no env var is set. Node never reads the OS proxy, so GUI-launched DSH
 * processes (Clash etc. write only the registry, not env vars) would
 * otherwise try to reach provider APIs directly and fail.
 * @returns proxy URL ("http://host:port") or undefined when not configured.
 */
export declare function proxyFromSystem(): string | undefined;
/**
 * Whether a request should bypass the proxy. Loopback targets (localhost,
 * 127.0.0.1, ::1, *.local) NEVER go through a proxy — a local SearXNG
 * instance or the DSH web server itself must not be tunneled to the internet
 * proxy. Additionally honors `NO_PROXY` / `no_proxy` for exact hosts,
 * `.suffix` domains, and `<local>`.
 */
export declare function shouldBypassProxy(url: string | URL): boolean;
/**
 * Fetch a URL, honoring proxies (plugin setting, then env vars, then Windows
 * system proxy) unless `NO_PROXY` matches or the calling provider is marked
 * direct in the settings.
 *
 * Two modes:
 *  - legacy/page mode (default): unchanged proxy behavior. Used by web_fetch
 *    (generic-fetch preflights upstream) and the release checker.
 *  - `options.provider` mode: strict outbound policy for hosted built-in
 *    providers. ANY operator override runs the full gate — exact-endpoint
 *    trust, DNS preflight + socket pinning, plaintext-http authorization, and
 *    fail-closed proxying (a proxy's own DNS cannot be substantiated locally).
 *    The pinned dispatcher is kept alive until the response BODY has been
 *    consumed (adapters read it after fetch() resolves on the headers), so
 *    undici's destroy() can never terminate a mid-read body.
 *
 * The third argument accepts EITHER the options object (upstream callers) or a
 * bare provider name (the older per-provider proxy-control call style); both
 * select the same provider mode.
 */
export declare function fetchWithProxy(url: string | URL, init?: RequestInit, options?: FetchWithProxyOptions | string): Promise<Response>;
