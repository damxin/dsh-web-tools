/**
 * dsh-web-tools — Zhipu AI (智谱) web search provider adapter.
 *
 * Official API reference: https://docs.bigmodel.cn/api-reference/工具-api/网络搜索
 * - Endpoint: POST https://open.bigmodel.cn/api/paas/v4/web_search
 * - Auth: `Authorization: Bearer <api key>` (keys issued in the BigModel console)
 * - Engines: `search_std` (basic) / `search_pro` (high-tier) /
 *            `search_pro_sogou` (Sogou) / `search_pro_quark` (Quark)
 * - Search-only: this API has NO native URL extraction endpoint, so web_fetch
 *   falls back to the built-in generic HTTP fetcher (Defuddle).
 * - Response is a FLAT JSON object: `search_result[]` with
 *   { title, content, link, media, icon, refer, publish_date }.
 * - Business failures may arrive as HTTP 200 with `{ error: { code, message } }`
 *   (e.g. code 1001 / 1002 = authentication) as well as plain HTTP statuses.
 *
 * @module
 */
import { providerError, classifyHttpStatus, resolveContext, parseRetryAfter } from "./types.js";
import { fetchWithProxy } from "../fetch-proxy.js";
export const ZHIPU_SEARCH_URL = "https://open.bigmodel.cn/api/paas/v4/web_search";
export const ZHIPU_META = {
    name: "zhipu",
    label: "Zhipu AI",
    description: "GLM web search (multi-engine)",
    credSuffix: "ZHIPU",
    fetchCapable: false,
    needsBaseUrl: false,
    defaultBaseUrl: "https://open.bigmodel.cn",
};
/** Map SearchHints freshness presets onto the API's recency enum. */
const FRESHNESS_TO_RECENCY = {
    day: "oneDay",
    week: "oneWeek",
    month: "oneMonth",
    year: "oneYear",
};
/**
 * Clamp count into the API range 1–50. `search_pro_sogou` only accepts
 * 10/20/30/40/50, so non-multiples are snapped UP to the next multiple of 10
 * (never down, so the agent still gets at least what it asked for).
 */
export function normalizeZhipuCount(count, engine) {
    const raw = Math.max(1, Math.min(50, Math.round(count ?? 10)));
    if (engine === "search_pro_sogou") {
        if (raw <= 10)
            return 10;
        return Math.min(50, Math.ceil(raw / 10) * 10);
    }
    return raw;
}
/**
 * Build the POST body for the Zhipu web_search API.
 * Adapts SearchHints:
 *  - cleanQuery → search_query (API caps at 70 chars)
 *  - freshness preset → search_recency_filter (query wins over operator default)
 *  - explicit `site:` include domains → search_domain_filter (comma joined);
 *    otherwise the operator-configured domainFilter is used as the default
 *  - operator options → search_engine / search_intent / count / content_size /
 *    request_id / user_id
 */
export function buildZhipuSearchBody(query, maxResults, options, hints) {
    const engine = options?.searchEngine ?? "search_std";
    const cleanQ = (hints?.cleanQuery ? hints.cleanQuery : query).trim().slice(0, 70);
    const body = {
        search_query: cleanQ,
        search_engine: engine,
        search_intent: options?.searchIntent ?? false,
        count: normalizeZhipuCount(maxResults ?? options?.count, engine),
    };
    // 1. Recency: a query freshness hint is a hard constraint and wins over the
    //    operator default; otherwise fall back to the configured filter.
    const preset = hints?.freshness?.preset;
    body.search_recency_filter = preset
        ? FRESHNESS_TO_RECENCY[preset]
        : options?.recencyFilter ?? "noLimit";
    // 2. Domain whitelist: explicit `site:` hints win; operator default otherwise.
    const includeDomains = hints?.domains?.include ?? [];
    const domainFilter = includeDomains.length > 0
        ? includeDomains.join(",")
        : options?.domainFilter?.trim() ?? "";
    if (domainFilter)
        body.search_domain_filter = domainFilter;
    // 3. Optional snippet size.
    if (options?.contentSize)
        body.content_size = options.contentSize;
    // 4. Trace ids (API requires ≥6 chars; skip invalid operator values).
    if (options?.requestId && options.requestId.length >= 6 && options.requestId.length <= 64) {
        body.request_id = options.requestId;
    }
    if (options?.userId && options.userId.length >= 6 && options.userId.length <= 128) {
        body.user_id = options.userId;
    }
    return body;
}
/** Classify a Zhipu business error body (`{ error: { code, message } }`). */
function classifyZhipuBusinessError(errorBody) {
    const code = typeof errorBody?.code === "string" || typeof errorBody?.code === "number" ? String(errorBody.code) : "";
    const message = typeof errorBody?.message === "string" && errorBody.message ? errorBody.message : "";
    const haystack = `${code} ${message}`;
    // 1001 / 1002 are the documented auth failure codes; message hints are a
    // defensive second layer (the platform may reuse the number for other calls).
    if (/1001|1002/.test(haystack) || /鉴权|认证|unauthorized|invalid.*(api[ -]?key|token)|permission denied/i.test(haystack)) {
        return providerError("auth", `Zhipu: ${message || "authentication failed"}`);
    }
    if (/余额|额度|quota|insufficient.*(balance|credit)|欠费/i.test(haystack)) {
        return providerError("quota", `Zhipu: ${message || "quota exhausted"}`);
    }
    return providerError("bad-request", `Zhipu: ${message || code || "business error"}`);
}
/**
 * Parse a web_search response, classifying failures uniformly:
 *  - non-OK HTTP status is AUTHORITATIVE (429 → rate-limit, 401/403 → auth,
 *    5xx → server) even when the body also carries a business error object
 *  - HTTP 200 with a business `error` object → message/code-based classification
 *    (documented auth codes 1001 / 1002, quota wording, otherwise bad-request)
 */
async function readZhipuResponse(res) {
    let body = {};
    try {
        body = (await res.json());
    }
    catch {
        body = {};
    }
    if (!res.ok) {
        const code = classifyHttpStatus(res.status);
        const retryAfterMs = code === "rate-limit" ? parseRetryAfter(res) : undefined;
        throw providerError(code, `Zhipu web search failed (HTTP ${res.status}, ${code})`, res.status, retryAfterMs);
    }
    const errorObj = body?.error;
    if (errorObj && typeof errorObj === "object" && errorObj !== null) {
        throw classifyZhipuBusinessError(errorObj);
    }
    return body;
}
export const ZhipuProvider = {
    ...ZHIPU_META,
    async search(query, maxResults, apiKey, _baseUrl, contextOrSignal) {
        const { signal, options, hints } = resolveContext(contextOrSignal);
        const token = (apiKey ?? "").trim();
        if (!token)
            throw providerError("config", "Zhipu API key is not configured");
        const requestBody = buildZhipuSearchBody(query, maxResults, options, hints);
        const res = await fetchWithProxy(ZHIPU_SEARCH_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(requestBody),
            signal,
        });
        const raw = await readZhipuResponse(res);
        // Official shape is flat `search_result`; tolerate a `data` wrapper too.
        const results = Array.isArray(raw?.search_result)
            ? raw.search_result
            : Array.isArray(raw?.data?.search_result)
                ? raw.data.search_result
                : [];
        const sources = results
            .map((r) => {
            const url = typeof r?.link === "string" ? r.link : "";
            if (!url)
                return null;
            const s = { url };
            if (typeof r.title === "string" && r.title)
                s.title = r.title;
            if (typeof r.content === "string" && r.content) {
                s.snippet = r.content.length > 1200 ? `${r.content.slice(0, 1200)}…` : r.content;
            }
            const published = typeof r.publish_date === "string" ? r.publish_date : typeof r.date === "string" ? r.date : "";
            if (published)
                s.publishedAt = published;
            return s;
        })
            .filter((x) => x !== null);
        return { sources };
    },
    async fetch(_url, _apiKey, _baseUrl, _signal) {
        throw providerError("config", "Zhipu web search does not provide native fetch; use the generic path");
    },
};
