import test from "node:test";
import assert from "node:assert/strict";
import {
  ZhipuProvider,
  buildZhipuSearchBody,
  normalizeZhipuCount,
  ZHIPU_SEARCH_URL,
} from "../src/host/providers/zhipu.ts";

// ---------------------------------------------------------------------------
// buildZhipuSearchBody — request compilation
// ---------------------------------------------------------------------------

test("Zhipu: builds the official request shape with defaults", () => {
  const body = buildZhipuSearchBody("DeepSeek Harness", 8, undefined, undefined);
  assert.equal(body.search_query, "DeepSeek Harness");
  assert.equal(body.search_engine, "search_std");
  assert.equal(body.search_intent, false);
  assert.equal(body.count, 8);
  assert.equal(body.search_recency_filter, "noLimit");
  assert.equal("search_domain_filter" in body, false);
});

test("Zhipu: cleanQuery wins, query is capped at 70 chars", () => {
  const long = "a".repeat(120);
  const body = buildZhipuSearchBody(long, 5, undefined, { cleanQuery: "clean", rawQuery: long });
  assert.equal(body.search_query, "clean");
  const body2 = buildZhipuSearchBody("x".repeat(90), 5, undefined, undefined);
  assert.equal(body2.search_query.length, 70);
});

test("Zhipu: freshness preset maps to the recency enum and beats the operator default", () => {
  const body = buildZhipuSearchBody("news", 5, { recencyFilter: "oneMonth" }, {
    cleanQuery: "news",
    rawQuery: "news",
    freshness: { preset: "day" },
  });
  assert.equal(body.search_recency_filter, "oneDay");

  const fallback = buildZhipuSearchBody("news", 5, { recencyFilter: "oneYear" }, undefined);
  assert.equal(fallback.search_recency_filter, "oneYear");

  const noLimit = buildZhipuSearchBody("news", 5, undefined, undefined);
  assert.equal(noLimit.search_recency_filter, "noLimit");
});

test("Zhipu: site: include domains compile to a comma-joined whitelist", () => {
  const body = buildZhipuSearchBody("query", 5, { domainFilter: "fallback.com" }, {
    cleanQuery: "query",
    rawQuery: "query",
    domains: { include: ["github.com", "docs.python.org"] },
  });
  assert.equal(body.search_domain_filter, "github.com,docs.python.org");

  // operator default used when the query carries no site: constraint
  const fallback = buildZhipuSearchBody("query", 5, { domainFilter: "example.com" }, undefined);
  assert.equal(fallback.search_domain_filter, "example.com");
});

test("Zhipu: operator options flow through (engine / intent / content_size / ids)", () => {
  const body = buildZhipuSearchBody("query", undefined, {
    searchEngine: "search_pro_quark",
    searchIntent: true,
    count: 20,
    contentSize: "high",
    requestId: "req-123456",
    userId: "user-123456",
  });
  assert.equal(body.search_engine, "search_pro_quark");
  assert.equal(body.search_intent, true);
  assert.equal(body.count, 20);
  assert.equal(body.content_size, "high");
  assert.equal(body.request_id, "req-123456");
  assert.equal(body.user_id, "user-123456");
});

test("Zhipu: too-short trace ids are omitted (API requires >=6 chars)", () => {
  const body = buildZhipuSearchBody("query", 5, { requestId: "abc", userId: "xyz" });
  assert.equal("request_id" in body, false);
  assert.equal("user_id" in body, false);
});

// ---------------------------------------------------------------------------
// normalizeZhipuCount — 1..50 range + Sogou snapping
// ---------------------------------------------------------------------------

test("Zhipu: count is clamped into 1..50", () => {
  assert.equal(normalizeZhipuCount(0, "search_std"), 1);
  assert.equal(normalizeZhipuCount(500, "search_std"), 50);
  assert.equal(normalizeZhipuCount(undefined, "search_std"), 10);
  assert.equal(normalizeZhipuCount(7, "search_std"), 7);
});

test("Zhipu: search_pro_sogou snaps count up to a multiple of 10", () => {
  assert.equal(normalizeZhipuCount(8, "search_pro_sogou"), 10);
  assert.equal(normalizeZhipuCount(11, "search_pro_sogou"), 20);
  assert.equal(normalizeZhipuCount(45, "search_pro_sogou"), 50);
  assert.equal(normalizeZhipuCount(60, "search_pro_sogou"), 50);
});

// ---------------------------------------------------------------------------
// ZhipuProvider.search — wire behavior
// ---------------------------------------------------------------------------

test("ZhipuProvider search parses the flat search_result shape", async () => {
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  let capturedBody: any = null;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    capturedBody = JSON.parse(init?.body as string);
    return {
      status: 200,
      ok: true,
      json: async () => ({
        id: "task-1",
        created: 123,
        request_id: "req-1",
        search_result: [
          {
            title: "GLM 新闻",
            content: "这是一段摘要内容。",
            link: "https://example.com/1",
            media: "示例媒体",
            icon: "https://example.com/icon.png",
            refer: 1,
            publish_date: "2026-09-30",
          },
          {
            title: "No link item — must be dropped",
            content: "x",
          },
        ],
      }),
    } as unknown as Response;
  }) as typeof globalThis.fetch;

  try {
    const outcome = await ZhipuProvider.search("智谱 GLM", 10, "zhipu-key", undefined);

    assert.equal(capturedUrl, ZHIPU_SEARCH_URL);
    assert.equal(capturedHeaders.authorization, "Bearer zhipu-key");
    assert.equal(capturedBody.search_query, "智谱 GLM");
    assert.equal(capturedBody.count, 10);

    assert.equal(outcome.sources.length, 1);
    assert.equal(outcome.sources[0].url, "https://example.com/1");
    assert.equal(outcome.sources[0].title, "GLM 新闻");
    assert.equal(outcome.sources[0].snippet, "这是一段摘要内容。");
    assert.equal(outcome.sources[0].publishedAt, "2026-09-30");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ZhipuProvider search tolerates a data-wrapped response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    status: 200,
    ok: true,
    json: async () => ({
      data: {
        search_result: [{ title: "T", link: "https://example.com/wrapped", content: "C" }],
      },
    }),
  }) as unknown as Response) as typeof globalThis.fetch;

  try {
    const outcome = await ZhipuProvider.search("q", 5, "k", undefined);
    assert.equal(outcome.sources.length, 1);
    assert.equal(outcome.sources[0].url, "https://example.com/wrapped");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ZhipuProvider search classifies HTTP 200 business errors (auth 1001)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    status: 200,
    ok: true,
    json: async () => ({ error: { code: "1001", message: "鉴权失败" } }),
  }) as unknown as Response) as typeof globalThis.fetch;

  try {
    await assert.rejects(
      ZhipuProvider.search("q", 5, "bad-key", undefined),
      (err: any) => err?.code === "auth",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ZhipuProvider search classifies HTTP 429 as rate-limit", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    status: 429,
    ok: false,
    headers: new Headers({ "retry-after": "30" }),
    json: async () => ({ error: { code: "1300", message: "rate limited" } }),
  }) as unknown as Response) as typeof globalThis.fetch;

  try {
    await assert.rejects(
      ZhipuProvider.search("q", 5, "k", undefined),
      (err: any) => err?.code === "rate-limit" && err?.retryAfterMs === 30000,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ZhipuProvider search rejects a missing API key as config", async () => {
  await assert.rejects(
    ZhipuProvider.search("q", 5, "", undefined),
    (err: any) => err?.code === "config",
  );
});

test("ZhipuProvider fetch is unsupported (generic fetcher fallback)", async () => {
  await assert.rejects(
    ZhipuProvider.fetch("https://example.com", "k", undefined),
    (err: any) => err?.code === "config",
  );
});
