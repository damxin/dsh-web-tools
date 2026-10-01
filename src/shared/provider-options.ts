/**
 * dsh-web-tools — Provider-native typed execution options.
 *
 * Dedicated typed settings per provider. No universal SearchOptions.
 * @module
 */

export interface ExaProviderOptions {
  searchType?: "auto" | "fast" | "instant" | "deep-lite" | "deep" | "deep-reasoning";
  maxAgeHours?: number;
}

export interface TavilyProviderOptions {
  searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
  chunksPerSource?: 1 | 2 | 3;
  autoParameters?: boolean;
  /** Extract depth for /extract (web_fetch). */
  fetchExtractDepth?: "basic" | "advanced";
}

export interface BraveProviderOptions {
  endpointPreference?: "auto" | "llm-context" | "web-search";
  contextThresholdMode?: "strict" | "balanced" | "lenient" | "disabled";
  contextTokenBudget?: number;
}

export interface YouProviderOptions {
  extractionMode?: "highlights" | "none";
  fetchCrawlTimeoutSec?: number;
  fetchMaxAgeSec?: number;
}

export interface FirecrawlProviderOptions {
  fetchOnlyMainContent?: boolean;
  fetchMaxAgeMs?: number;
}

export interface ParallelProviderOptions {
  mode?: "turbo" | "fast" | "basic" | "advanced";
  maxCharsTotal?: number;
}

export interface JinaProviderOptions {
  /**
   * Reader page loading engine.
   * undefined / auto = Jina default.
   */
  fetchEngine?: "auto" | "curl" | "browser";
  /**
   * Max acceptable cache age in seconds.
   * undefined = Jina default. 0 = force fresh (X-No-Cache equivalent).
   */
  fetchCacheToleranceSec?: number;
  /**
   * Trim output rather than reject — the normal context-size guard.
   */
  fetchMaxTokens?: number;
  /**
   * Hard budget guard; Jina rejects the request if the page would exceed it.
   */
  fetchTokenBudget?: number;
  /**
   * Higher-quality HTML→Markdown conversion (ReaderLM-v2); ~3x Reader tokens.
   */
  fetchReaderLmV2?: boolean;
}

/**
 * Zhipu AI (智谱) web search options — native params of the standalone
 * `POST /api/paas/v4/web_search` API (search-only; no native extraction).
 * Reference: https://docs.bigmodel.cn/api-reference/工具-api/网络搜索
 */
export interface ZhipuProviderOptions {
  /** Search engine backend. Default `search_std`. */
  searchEngine?: "search_std" | "search_pro" | "search_pro_sogou" | "search_pro_quark";
  /** Run intent recognition before executing the search. Default false. */
  searchIntent?: boolean;
  /**
   * Result count 1–50 (default 10). `search_pro_sogou` only accepts
   * 10/20/30/40/50 — the adapter snaps non-multiples of 10 up.
   */
  count?: number;
  /** Publish-time window filter. Default `noLimit`. */
  recencyFilter?: "noLimit" | "oneDay" | "oneWeek" | "oneMonth" | "oneYear";
  /**
   * Domain whitelist (comma separated). Query-level `site:` hints win over
   * this operator default whenever present.
   */
  domainFilter?: string;
  /** Returned snippet length: `medium` (default) or `high`. */
  contentSize?: "medium" | "high";
  /** Request trace id (6–64 chars); omitted when unset or too short. */
  requestId?: string;
  /** End-user id (6–128 chars); omitted when unset or too short. */
  userId?: string;
}

export interface ProviderOptionsMap {
  exa: ExaProviderOptions;
  tavily: TavilyProviderOptions;
  brave: BraveProviderOptions;
  you: YouProviderOptions;
  firecrawl: FirecrawlProviderOptions;
  parallel: ParallelProviderOptions;
  jina: JinaProviderOptions;
  zhipu: ZhipuProviderOptions;
}

export type KnownProviderWithOptions = keyof ProviderOptionsMap;

export type StoredProviderOptions = Partial<{
  [K in keyof ProviderOptionsMap]: ProviderOptionsMap[K];
}>;

export interface ProviderOptionView<T extends object = Record<string, unknown>> {
  overrides: Partial<T>;
  effective: T;
  customized: boolean;
  isDefault: boolean;
}
