/**
 * dsh-web-tools — network fetch helper.
 *
 * Node's global fetch (undici) does NOT honor `HTTPS_PROXY` / `HTTP_PROXY`
 * environment variables, unlike .NET/curl. On networks where provider APIs
 * require a proxy (e.g. api.search.brave.com behind a Clash gateway), every
 * provider call would hang and time out. This helper detects the standard
 * proxy env vars and routes requests through undici's ProxyAgent when set.
 *
 * Proxy resolution order (first match wins):
 *   1. the plugin setting `proxyUrl` (Settings → Web Search → Advanced) —
 *      explicit operator intent beats every ambient source; empty = unset
 *   2. `HTTPS_PROXY` / `https_proxy` / `HTTP_PROXY` / `http_proxy` env vars
 *   3. the Windows system proxy (registry) — for GUI-launched DSH processes
 *      that inherit no env vars but have a system proxy configured
 * A provider marked in `providerProxyDirect` (per-provider setting) NEVER
 * uses a proxy — its calls go out directly regardless of the order above.
 * `NO_PROXY` / `no_proxy` entries bypass the proxy for matching hosts
 * (e.g. `localhost`, internal instances).
 *
 * `undici` is loaded LAZILY: it is a declared dependency, but a profile that
 * was linked before the dependency was declared (or a broken install) may not
 * provide it. A static top-level import would then crash the entire plugin
 * tree at load time. Lazy loading + a plain-fetch fallback keeps the plugin
 * usable (without proxy support) instead of failing to start.
 *
 * The proxy agent is created lazily once per proxy URL and reused.
 * @module
 */
import { execFileSync } from "node:child_process";

/** Structural ProxyAgent type (we never import undici statically). */
type ProxyAgentLike = new (proxy: string) => unknown;

/** Lazy per-proxy agents (a proxy URL change across calls re-creates). */
const agentCache = new Map<string, unknown>();

/** Cached undici ProxyAgent ctor; null = unavailable, undefined = not tried. */
let proxyAgentCtor: ProxyAgentLike | null | undefined;

/** Lazily resolve undici's ProxyAgent. Never throws — null on failure. */
async function getProxyAgentCtor(): Promise<ProxyAgentLike | null> {
  if (proxyAgentCtor !== undefined) return proxyAgentCtor;
  try {
    const undici = (await import("undici")) as { ProxyAgent?: unknown };
    proxyAgentCtor = typeof undici.ProxyAgent === "function" ? (undici.ProxyAgent as ProxyAgentLike) : null;
  } catch {
    proxyAgentCtor = null;
  }
  return proxyAgentCtor;
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
 * Live getter for the plugin proxy settings. The host wires this to the
 * `proxyUrl` / `providerProxyDirect` settings; it is consulted on every
 * request, so settings edits apply without a restart.
 */
let proxySettingsSource: (() => ProxySettings | undefined) | undefined;

/**
 * Wire (or clear) the plugin proxy settings source. Call with `undefined` to
 * detach (used by tests; the host never needs to).
 */
export function setProxyConfigSource(getter: (() => ProxySettings | undefined) | undefined): void {
  proxySettingsSource = getter;
}

/** Invalid values already warned about — one console line per distinct value. */
const warnedInvalidProxies = new Set<string>();

/**
 * Validate and normalize one candidate proxy URL: trims, and requires an
 * `http://` / `https://` URL (undici's ProxyAgent only tunnels HTTP CONNECT
 * proxies — SOCKS would need a different agent). Invalid values are SKIPPED
 * with a one-time warning (fetching must keep working, not crash); the save
 * route rejects them loudly before they can be persisted.
 * @returns the trimmed URL, or undefined when unset/invalid.
 */
export function normalizeProxyUrl(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (v === "") return undefined;
  let protocol: string;
  try {
    protocol = new URL(v).protocol;
  } catch {
    protocol = "";
  }
  if (protocol !== "http:" && protocol !== "https:") {
    if (!warnedInvalidProxies.has(v)) {
      warnedInvalidProxies.add(v);
      console.warn(`[dsh-web-tools] ignoring invalid proxy URL "${v}" — expected http://host:port or https://host:port`);
    }
    return undefined;
  }
  return v;
}

/** Current plugin proxy settings (undefined when no source is wired). */
function currentProxySettings(): ProxySettings | undefined {
  return proxySettingsSource?.();
}

/** The plugin-configured proxy (validated); undefined when unset/invalid. */
export function proxyFromConfig(): string | undefined {
  return normalizeProxyUrl(currentProxySettings()?.proxyUrl);
}

/** Whether one provider is marked "direct" in the plugin settings. */
export function isDirectProvider(provider: string): boolean {
  return currentProxySettings()?.directProviders?.[provider] === true;
}

/**
 * The proxy ONE provider's outbound calls should use: the global resolution
 * (setting → env → system), except a provider marked direct in the settings
 * never tunnels — its requests always go out directly.
 */
export function effectiveProxyFor(provider?: string): { url: string; source: ProxySource } | undefined {
  if (provider !== undefined && isDirectProvider(provider)) return undefined;
  return resolveProxy();
}

/** Adorn one candidate with its source, dropping unset/invalid values. */
function asProxy(source: ProxySource, url: string | undefined): { url: string; source: ProxySource } | undefined {
  const normalized = normalizeProxyUrl(url);
  return normalized === undefined ? undefined : { url: normalized, source };
}

/** The effective proxy and where it came from; undefined = direct fetch. */
export function resolveProxy(): { url: string; source: ProxySource } | undefined {
  return asProxy("config", currentProxySettings()?.proxyUrl) ?? asProxy("env", proxyFromEnv()) ?? asProxy("system", proxyFromSystem());
}

/**
 * Proxy support status for the settings card:
 *  - configured: a proxy is present (plugin setting, env var, or Windows
 *    system proxy) — `url`/`source` say which one is active
 *  - degraded:   a proxy is configured but undici cannot be loaded, so calls
 *                fall back to direct fetch (no tunneling)
 * Never throws (undici absence is a reportable state, not a crash). The URL
 * surfaces with any `user:pass@` masked — it is display data, not a secret.
 */
export async function proxyStatus(): Promise<{ configured: boolean; degraded: boolean; url?: string; source?: ProxySource }> {
  const resolved = resolveProxy();
  if (resolved === undefined) return { configured: false, degraded: false };
  const ctor = await getProxyAgentCtor();
  return { configured: true, degraded: ctor === null, url: maskProxyUrl(resolved.url), source: resolved.source };
}

/** Mask any `user:pass@` userinfo before a proxy URL is displayed. */
function maskProxyUrl(url: string): string {
  return url.replace(/(https?:\/\/)([^@/\s]+@)/i, "$1***@");
}

/** The first usable proxy from the standard env vars, or undefined. */
export function proxyFromEnv(): string | undefined {
  for (const name of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]) {
    const v = process.env[name];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

/** Cached Windows system-proxy probe (registry read is slow-ish; TTL 30s). */
let systemProxyCache: { at: number; value?: string } | undefined;
const SYSTEM_PROXY_TTL_MS = 30_000;

/**
 * Windows system proxy from the registry (HKCU Internet Settings), used when
 * no env var is set. Node never reads the OS proxy, so GUI-launched DSH
 * processes (Clash etc. write only the registry, not env vars) would
 * otherwise try to reach provider APIs directly and fail.
 * @returns proxy URL ("http://host:port") or undefined when not configured.
 */
export function proxyFromSystem(): string | undefined {
  if (process.platform !== "win32") return undefined;
  const now = Date.now();
  if (systemProxyCache && now - systemProxyCache.at < SYSTEM_PROXY_TTL_MS) return systemProxyCache.value;
  const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
  let value: string | undefined;
  try {
    const enabled = execFileSync("reg", ["query", key, "/v", "ProxyEnable"], { encoding: "utf8", windowsHide: true, timeout: 2000 });
    if (!/0x1\b/.test(enabled)) {
      systemProxyCache = { at: now };
      return undefined;
    }
    const server = execFileSync("reg", ["query", key, "/v", "ProxyServer"], { encoding: "utf8", windowsHide: true, timeout: 2000 });
    const m = /ProxyServer\s+REG_SZ\s+(\S+)/.exec(server);
    if (m) {
      // The registry value may be a bare "host:port" or a per-protocol list
      // like "http=host:8080;https=host:8080" — normalize to a URL.
      const raw = m[1].split(";").find((p) => /^https?=/i.test(p))?.split("=")[1] ?? m[1];
      value = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    }
  } catch {
    // registry unreadable (non-Windows tooling, restricted env) → no system proxy
  }
  systemProxyCache = { at: now, value };
  return value;
}

/**
 * Whether a request should bypass the proxy. Loopback targets (localhost,
 * 127.0.0.1, ::1, *.local) NEVER go through a proxy — a local SearXNG
 * instance or the DSH web server itself must not be tunneled to the internet
 * proxy. Additionally honors `NO_PROXY` / `no_proxy` for exact hosts,
 * `.suffix` domains, and `<local>`.
 */
export function shouldBypassProxy(url: string | URL): boolean {
  let host: string;
  let isIpv4Loopback = false;
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    isIpv4Loopback = u.protocol === "http:" || u.protocol === "https:"
      ? /^127\.\d+\.\d+\.\d+$/.test(host) || host === "::1" || host === "[::1]" || host === "0:0:0:0:0:0:0:1"
      : false;
  } catch {
    return true;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local") || isIpv4Loopback) return true;
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy;
  if (typeof noProxy !== "string" || noProxy.trim() === "") return false;
  return noProxy
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0)
    .some((entry) => {
      if (entry === "<local>") return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
      if (entry.startsWith(".")) return host === entry.slice(1) || host.endsWith(entry);
      return host === entry || host.endsWith(`.${entry}`);
    });
}

/**
 * Fetch a URL, honoring proxies (plugin setting, then env vars, then Windows
 * system proxy) unless `NO_PROXY` matches or the calling provider is marked
 * direct in the settings. Signature matches the global fetch; callers pass
 * the same init, plus their provider name for per-provider proxy control.
 */
export async function fetchWithProxy(url: string | URL, init?: RequestInit, provider?: string): Promise<Response> {
  if (shouldBypassProxy(url)) return fetch(url, init);
  const resolved = effectiveProxyFor(provider);
  if (resolved === undefined) return fetch(url, init);
  const Ctor = await getProxyAgentCtor();
  if (Ctor === null) return fetch(url, init); // undici missing → plain fetch
  let agent = agentCache.get(resolved.url);
  if (!agent) {
    agent = new Ctor(resolved.url);
    agentCache.set(resolved.url, agent);
  }
  const { dispatcher, ...rest } = (init ?? {}) as RequestInit & { dispatcher?: unknown };
  void dispatcher; // ignore any caller-supplied dispatcher (we own the proxy)
  // undici's dispatcher is not part of the standard RequestInit type; cast
  // through a structural type so ProxyAgent is accepted at runtime.
  return fetch(url, { ...rest, dispatcher: agent } as unknown as RequestInit);
}
