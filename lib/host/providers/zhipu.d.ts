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
import { type ProviderAdapter } from "./types.ts";
import type { ZhipuProviderOptions } from "../../shared/provider-options.ts";
import type { SearchHints } from "../search-hints.ts";
export declare const ZHIPU_SEARCH_URL = "https://open.bigmodel.cn/api/paas/v4/web_search";
export declare const ZHIPU_META: {
    readonly name: "zhipu";
    readonly label: "Zhipu AI";
    readonly description: "GLM web search (multi-engine)";
    readonly credSuffix: "ZHIPU";
    readonly fetchCapable: false;
    readonly needsBaseUrl: false;
    readonly defaultBaseUrl: "https://open.bigmodel.cn";
};
/**
 * Clamp count into the API range 1–50. `search_pro_sogou` only accepts
 * 10/20/30/40/50, so non-multiples are snapped UP to the next multiple of 10
 * (never down, so the agent still gets at least what it asked for).
 */
export declare function normalizeZhipuCount(count: number | undefined, engine: string): number;
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
export declare function buildZhipuSearchBody(query: string, maxResults: number | undefined, options?: Readonly<ZhipuProviderOptions>, hints?: Readonly<SearchHints>): Record<string, unknown>;
export declare const ZhipuProvider: ProviderAdapter;
