/**
 * Activation regression guard — the failure this file exists for was SILENT.
 *
 * Cordis keeps a fiber permanently INACTIVE while any name in its static
 * `inject` array has no implementation: no throw, no log, `apply()` simply
 * never runs. When `inject` carried `webRuntime` (the CLASS name of the `web`
 * service, not a service name), the plugin loaded, exported its tools' names,
 * rendered its settings card in the browser — and did nothing on the host.
 * Neither the search provider nor the `/web-tools/api` route ever existed.
 *
 * This test runs the real `apply()` inside a real cordis context that provides
 * exactly the services the plugin declares, and asserts it really activates:
 * the fenced route lands in the webserver's prefix table and the search/fetch
 * providers land in the web service. Any future phantom inject name — or a
 * removal of one of these seams — fails here instead of in production.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Context, Service } from "@deepseek-ai/cordis";
import { apply, inject } from "../src/host/index.ts";

/** The webserver face the plugin registers against (routes.ts `register`). */
class FakeWebServer extends Service {
  readonly routes: Array<{ kind: string; path: string }> = [];
  constructor(ctx: Context) {
    super(ctx, "webServer");
  }
  register(route: { kind: string; path: string }): () => void {
    this.routes.push({ kind: route.kind, path: route.path });
    return () => {
      this.routes.splice(this.routes.indexOf(route), 1);
    };
  }
  registerUpgrade(): () => void {
    return () => {};
  }
}

/** The web seam: provider registry the model-facing tools resolve against. */
class FakeWeb extends Service {
  readonly searchProviders: Array<{ id: string }> = [];
  readonly fetchProviders: Array<{ id: string }> = [];
  constructor(ctx: Context) {
    super(ctx, "web");
  }
  registerSearchProvider(provider: { id: string }): () => void {
    this.searchProviders.push(provider);
    return () => {
      this.searchProviders.splice(this.searchProviders.indexOf(provider), 1);
    };
  }
  registerFetchProvider(provider: { id: string }): () => void {
    this.fetchProviders.push(provider);
    return () => {
      this.fetchProviders.splice(this.fetchProviders.indexOf(provider), 1);
    };
  }
}

class FakeCredentials extends Service {
  constructor(ctx: Context) {
    super(ctx, "credentials");
  }
  async resolve() {
    return undefined;
  }
  async set() {}
  async unset() {}
}

class FakeAgents extends Service {
  constructor(ctx: Context) {
    super(ctx, "agents");
  }
}

class FakeCommands extends Service {
  constructor(ctx: Context) {
    super(ctx, "commands");
  }
  register() {
    return () => {};
  }
}

/** Boot a root context with exactly the declared services, then run apply(). */
async function activate() {
  const root = new Context();
  for (const service of [FakeWebServer, FakeCredentials, FakeWeb, FakeAgents, FakeCommands]) {
    root.plugin(service);
  }
  const applied = { done: false };
  await new Promise<void>((resolve) => {
    root.plugin(
      {
        name: "dsh-web-tools",
        inject,
        apply: (ctx: Context, config?: unknown) => {
          applied.done = true;
          apply(ctx as never, config);
        },
      },
      { enabled: true, defaultProvider: "zhipu" },
    );
    setImmediate(resolve);
  });
  return { root, applied };
}

test("a phantom inject name would hide this failure — assert the real one activates", async () => {
  const { applied } = await activate();
  assert.equal(applied.done, true, "apply() never ran: an inject name has no service implementation");
});

test("activation registers the fenced /web-tools/api prefix route", async () => {
  const { root } = await activate();
  const server = root.get("webServer") as unknown as FakeWebServer;
  const route = server.routes.find((r) => r.path === "/web-tools/api");
  assert.ok(route, "the card's API prefix must be registered on the answering webserver");
  assert.equal(route!.kind, "prefix", "sub-paths (/web-tools/api/config/get) only match a prefix route");
});

test("activation registers the routed search and fetch providers into ctx.web", async () => {
  const { root } = await activate();
  const web = root.get("web") as unknown as FakeWeb;
  assert.ok(
    web.searchProviders.some((p) => p.id === "dsh-web-tools"),
    "the id the host profile points the `web` service at",
  );
  assert.ok(web.fetchProviders.some((p) => p.id === "dsh-web-tools-fetch"));
});

test("the plugin declares no service name DSH does not register", () => {
  // The mechanism above is only safe while this holds; the exhaustive version
  // (with monorepo paths) lives in inject-contract.test.ts.
  for (const name of inject) {
    assert.match(
      name,
      /^(webServer|credentials|web|agents|commands)$/,
      `unexpected inject name "${name}" — verify it against the DSH monorepo before adding it`,
    );
  }
});
