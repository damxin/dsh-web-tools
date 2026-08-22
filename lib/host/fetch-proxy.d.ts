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
 * direct in the settings. Signature matches the global fetch; callers pass
 * the same init, plus their provider name for per-provider proxy control.
 */
export declare function fetchWithProxy(url: string | URL, init?: RequestInit, provider?: string): Promise<Response>;
