/**
 * Inject-contract regression guard.
 *
 * Bug history (fixed here): the static `inject` array once listed `webRuntime`,
 * a name NO DSH service has ever registered. Cordis does not reject an unknown
 * inject name — it keeps that fiber permanently INACTIVE, so `apply()` never ran
 * and nothing was logged. Both user-visible symptoms followed from that one
 * line:
 *   - `web_search` failed with `configured web provider "dsh-web-tools" is not
 *     registered` (the provider was never registered into `ctx.web`);
 *   - the settings card failed with `web-tools API returned non-JSON (HTTP 405)`
 *     (the `/web-tools/api` prefix route was never in the webserver table, so
 *     the SPA fallback seat answered the POST with a BODYLESS 405).
 *
 * These tests pin the contract so the next unknown name fails here instead of
 * silently disabling the whole plugin in production.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { inject } from "../src/host/index.ts";

/**
 * Every name the static inject may carry, with the DSH monorepo file that
 * registers it via `super(ctx, "<name>")`. Re-verify these paths on an SDK
 * upgrade: a renamed or dropped service must be handled deliberately.
 */
const VERIFIED_SERVICES: Record<string, string> = {
  webServer: "packages/host/webserver/src/index.ts",
  credentials: "packages/credentials/credentials/src/index.ts",
  web: "packages/web/web/src/index.ts",
  agents: "packages/core/agent/src/index.ts",
  commands: "packages/interaction/commands/src/index.ts",
};

/**
 * Names whose owning SDK package is not a devDependency here, so the runtime
 * cross-check below cannot prove them from node_modules. Verified in the
 * monorepo instead (see VERIFIED_SERVICES).
 */
const NOT_INSTALLED_HERE = new Set(["webServer", "agents", "commands"]);

/**
 * Service names registered by the INSTALLED `@deepseek-ai/*` packages: every
 * `super(<ctx>, "<name>")` in their built output. Proof that a name is a real
 * service rather than a plausible-looking one.
 */
function scanInstalledServiceNames(): Set<string> {
  const root = join(process.cwd(), "node_modules", "@deepseek-ai");
  const names = new Set<string>();
  let packages: string[];
  try {
    packages = readdirSync(root);
  } catch {
    return names;
  }
  const pattern = /super\(\s*[A-Za-z_$][\w$]*\s*,\s*["']([^"']+)["']\s*\)/g;
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules") continue;
      const full = join(dir, entry);
      let isDir: boolean;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) visit(full);
      else if (entry.endsWith(".js")) {
        const source = readFileSync(full, "utf8");
        for (const match of source.matchAll(pattern)) names.add(match[1]);
      }
    }
  };
  for (const pkg of packages) {
    const lib = join(root, pkg, "lib");
    try {
      if (statSync(lib).isDirectory()) visit(lib);
    } catch {
      /* package ships no built output */
    }
  }
  return names;
}

test("static inject names exactly the verified DSH host services", () => {
  assert.deepEqual(
    [...inject].sort(),
    Object.keys(VERIFIED_SERVICES).sort(),
    "inject drifted from the verified service list — a new name must be checked against the DSH monorepo first",
  );
});

test("every inject name an installed SDK package can prove is a real service", () => {
  const registered = scanInstalledServiceNames();
  for (const name of inject) {
    if (registered.has(name) || NOT_INSTALLED_HERE.has(name)) continue;
    assert.fail(
      `inject name "${name}" is registered by no installed @deepseek-ai package — ` +
        "if it is a real host service, add its monorepo path to VERIFIED_SERVICES and NOT_INSTALLED_HERE; " +
        "otherwise remove it, because cordis leaves the fiber dormant without any error",
    );
  }
});

test("phantom and wrongly-scoped names stay out of inject", () => {
  // `webRuntime` was the bug: it is the CLASS name of the web service, which is
  // registered as `ctx.web` (`export class WebRuntime` + `super(ctx, 'web')`,
  // packages/web/web/src/index.ts:76,93). An inject name matches only the string
  // passed to `super(ctx, …)`, so this one left the fiber dormant forever.
  // `web-runtime` is a CLIENT contribution and `webhookRuntime` is an unrelated
  // service — neither is ours to require.
  assert.equal(inject.includes("webRuntime"), false);
  assert.equal(
    inject.some((name) => /^(web-)?runtime$/i.test(name)),
    false,
    "client-side contributions are not host services",
  );
  // `settings` is optional by DSH contract: a plugin that ships its own page
  // takes it through `ctx.inject(["settings"], …)` inside apply(), so the
  // business plugin still runs on a host without it
  // (packages/settings/settings/README.md).
  assert.equal(inject.includes("settings"), false, "settings must stay an optional child inject");
});
