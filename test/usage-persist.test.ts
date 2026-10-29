/**
 * dsh-web-tools — per-day usage counter persistence tests.
 *
 * The card's "today / last 7 days" call counts must survive a restart and
 * never grow without bound, so the buckets merge additively across flushes
 * (unlike quota snapshots, which overwrite) and prune to a 7-day window.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createUsagePersist,
  localDateKey,
  pruneBuckets,
  recentDateKeys,
  type UsageBuckets,
} from "../src/host/usage-persist.ts";

/** Fixed local clock the tests can advance. */
function clock(start: Date) {
  let current = start;
  return {
    now: () => current,
    addDays(n: number) {
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + n, current.getHours());
    },
  };
}

test("localDateKey formats the local calendar day, not UTC", () => {
  // 23:30 local on a day whose UTC date may differ — the key must stay local.
  const late = new Date(2026, 9, 29, 23, 30);
  assert.equal(localDateKey(late), "2026-10-29");
});

test("recentDateKeys returns keepDays keys ending today, oldest first", () => {
  const keys = recentDateKeys(new Date(2026, 9, 29), 7);
  assert.equal(keys.length, 7);
  assert.equal(keys[0], "2026-10-23");
  assert.equal(keys[6], "2026-10-29");
});

test("record counts per provider into today's bucket", () => {
  const time = clock(new Date(2026, 9, 29, 10));
  const persist = createUsagePersist(() => {}, { now: time.now });
  persist.record("exa");
  persist.record("exa");
  persist.record("tavily");

  const view = persist.view();
  assert.equal(view.date, "2026-10-29");
  assert.deepEqual(view.perProvider["exa"], { today: 2, last7: 2 });
  assert.deepEqual(view.perProvider["tavily"], { today: 1, last7: 1 });
});

test("last7 sums past days including today; today excludes them", () => {
  const time = clock(new Date(2026, 9, 29, 10));
  const persist = createUsagePersist(() => {}, { now: time.now });

  time.addDays(-3);
  persist.record("exa", 4);
  time.addDays(-3); // six days ago — still inside the window
  persist.record("exa", 2);
  time.addDays(-1); // seven days ago — outside the window
  persist.record("exa", 100);
  time.addDays(7); // back to today

  const view = persist.view();
  assert.deepEqual(view.perProvider["exa"], { today: 0, last7: 6 });
});

test("day rollover moves yesterday's counts out of today's column", () => {
  const time = clock(new Date(2026, 9, 29, 23));
  const persist = createUsagePersist(() => {}, { now: time.now });
  persist.record("exa", 3);

  time.addDays(1);
  const view = persist.view();
  assert.equal(view.date, "2026-10-30");
  assert.deepEqual(view.perProvider["exa"], { today: 0, last7: 3 });
});

test("seed adopts persisted buckets and prunes stale or malformed entries", () => {
  const time = clock(new Date(2026, 9, 29, 10));
  const persist = createUsagePersist(() => {}, { now: time.now });
  persist.seed({
    "2026-10-28": { exa: 5 },
    "2026-10-01": { exa: 999 }, // outside the 7-day window
    "not-a-date": { exa: 7 }, // junk key
    "2026-10-27": { exa: -3, tavily: 1.9, jina: "x" }, // junk values
  });

  const view = persist.view();
  assert.deepEqual(view.perProvider["exa"], { today: 0, last7: 5 });
  assert.deepEqual(view.perProvider["tavily"], { today: 0, last7: 1 });
  assert.equal(view.perProvider["jina"], undefined);
});

test("flush merges increments additively on top of seeded buckets", () => {
  const time = clock(new Date(2026, 9, 29, 10));
  const writes: UsageBuckets[] = [];
  const persist = createUsagePersist((buckets) => writes.push(buckets), { now: time.now });
  persist.seed({ "2026-10-29": { exa: 10 } });

  persist.record("exa", 2);
  persist.flushNow();
  assert.equal(writes.length, 1);
  assert.equal(writes[0]["2026-10-29"]?.exa, 12, "seeded count plus increments");

  // A second flush with no new records must not write, and the merged total
  // stays the baseline for the next window.
  persist.record("exa", 1);
  persist.flushNow();
  assert.equal(writes.length, 2);
  assert.equal(writes[1]["2026-10-29"]?.exa, 13);
  persist.flushNow();
  assert.equal(writes.length, 2, "nothing pending → no write");
});

test("flushed write payload is pruned to the 7-day window", () => {
  const time = clock(new Date(2026, 9, 29, 10));
  const writes: UsageBuckets[] = [];
  const persist = createUsagePersist((buckets) => writes.push(buckets), { now: time.now });
  persist.seed({ "2026-10-01": { exa: 50 } }); // stale day
  persist.record("exa");

  persist.flushNow();
  assert.equal(writes.length, 1);
  assert.equal(writes[0]["2026-10-01"], undefined, "stale day must not persist");
  assert.equal(writes[0]["2026-10-29"]?.exa, 1);
});

test("coalesces many records into one write per quiet window", async () => {
  const writes: UsageBuckets[] = [];
  const persist = createUsagePersist((buckets) => writes.push(buckets), {
    now: () => new Date(2026, 9, 29, 10),
    delayMs: 20,
  });

  for (let i = 0; i < 25; i += 1) persist.record("exa");
  assert.equal(writes.length, 0, "nothing written inside the quiet window");
  assert.deepEqual(persist.pendingProviders(), ["exa"]);

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(writes.length, 1, "the window elapses and writes exactly once");
  assert.equal(writes[0]["2026-10-29"]?.exa, 25);
});

test("dispose flushes pending counters so teardown loses nothing", () => {
  const writes: UsageBuckets[] = [];
  const persist = createUsagePersist((buckets) => writes.push(buckets), {
    now: () => new Date(2026, 9, 29, 10),
  });
  persist.record("tavily", 3);
  assert.equal(writes.length, 0);
  persist.dispose();
  assert.equal(writes.length, 1);
  assert.equal(writes[0]["2026-10-29"]?.tavily, 3);
});

test("view and record ignore empty or non-positive inputs", () => {
  const persist = createUsagePersist(() => {}, { now: () => new Date(2026, 9, 29, 10) });
  persist.record("");
  persist.record("exa", 0);
  persist.record("exa", -1);
  persist.flushNow();
  assert.deepEqual(persist.view().perProvider, {});
});

test("pruneBuckets drops rows that become empty after value sanitation", () => {
  const pruned = pruneBuckets(
    { "2026-10-29": { exa: 0, tavily: "junk" }, "2026-10-28": { jina: 4 } },
    new Date(2026, 9, 29),
    7,
  );
  assert.deepEqual(Object.keys(pruned).sort(), ["2026-10-28"]);
  assert.deepEqual(pruned["2026-10-28"], { jina: 4 });
});
