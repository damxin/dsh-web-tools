/**
 * dsh-web-tools — browser card: typed fetch client over the plugin's fenced
 * `/web-tools/api` routes.
 *
 * The browser never talks to provider APIs directly and never receives
 * credential values — only configured/writable state and quota snapshots
 * (which contain no secrets).
 * @module
 */
export const API_PREFIX = "/web-tools/api";
/** One wire failure. */
export class WebToolsApiError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
/** Call one API method; throws WebToolsApiError on failure. */
export async function call(method, payload) {
    let res;
    try {
        res = await fetch(`${API_PREFIX}/${method}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload ?? {}),
        });
    }
    catch (e) {
        throw new WebToolsApiError("network", `web-tools API unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Read text, not res.json(): a failure here is usually NOT a malformed body
    // but a response this card never got from the Host route at all — the SPA
    // fallback seat answers every unmatched request and gives a non-GET/HEAD one
    // a BODYLESS 405 (packages/host/frontend-static). Name that case, instead of
    // leaving "non-JSON (HTTP 405)" as the whole diagnosis.
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    }
    catch {
        const contentType = res.headers.get("content-type") ?? "none";
        const unregistered = res.status === 405 && text.trim() === "";
        throw new WebToolsApiError("bad-response", `web-tools API returned non-JSON (HTTP ${res.status}, content-type ${contentType}, ${text.length} bytes)` +
            (unregistered
                ? " — no /web-tools/api route is registered: the Host plugin did not activate (an inject name DSH does not register keeps the plugin dormant)"
                : "") +
            (text.trim() ? `: ${text.trim().slice(0, 120)}` : ""));
    }
    const body = json;
    if (!body.ok || body.value === undefined) {
        throw new WebToolsApiError(body.error?.code ?? "error", body.error?.message ?? "web-tools API error");
    }
    return body.value;
}
export const api = {
    configGet: () => call("config/get"),
    configSave: (payload) => call("config/save", payload),
    credentialsDescribe: () => call("credentials/describe"),
    credentialsSet: (provider, value) => call("credentials/set", { provider, value }),
    credentialsAddKey: (provider, value) => call("credentials/add-key", { provider, value }),
    credentialsRemoveKey: (provider, keyId) => call("credentials/remove-key", { provider, keyId }),
    testProvider: (provider, query) => call("test/provider", { provider, query }),
    testSearch: (query) => call("test/search", { query }),
    quotaDescribe: (force = false) => call("quota/describe", { force }),
    versionCheck: () => call("version/check"),
    searchModeGet: (sessionId) => call("search-mode/get", { sessionId }),
    searchModeSet: (sessionId, mode) => call("search-mode/set", { sessionId, mode }),
    providerOptionsSet: (provider, options) => call("provider-options/set", { provider, options }),
    providerOptionsReset: (provider) => call("provider-options/reset", { provider }),
    providerOptionsBatch: (providers) => call("provider-options/batch", { providers }),
    routingSet: (policy, orderedProviders) => call("routing/set", { policy, orderedProviders }),
    platformStatus: () => call("platform/status"),
    platformLogin: (platform) => call("platform/login", { platform }),
    platformStop: (platform) => call("platform/stop", { platform }),
    platformReset: (platform) => call("platform/reset", { platform }),
    sourcesDescribe: () => call("sources/describe"),
    sourceCreate: (source, credential, confirmTarget) => call("sources/create", { source, credential, confirmTarget }),
    sourceUpdate: (id, revision, patch, credential, confirmTarget) => call("sources/update", { id, revision, patch, credential, confirmTarget }),
    sourceDelete: (id) => call("sources/delete", { id }),
    sourceTest: (payload) => call("sources/test", payload),
    sourceEndpointSet: (provider, baseUrl, confirmForeign) => call("sources/endpoint-set", { provider, baseUrl, confirmForeign }),
};
