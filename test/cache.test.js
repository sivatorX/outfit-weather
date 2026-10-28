import { test } from "node:test";
import assert from "node:assert/strict";
import { createCache } from "../src/cache.js";

// A fake clock, so the test does not have to wait for real time
function fakeClock(start = 0) {
  let time = start;
  return { now: () => time, advance: (ms) => (time += ms) };
}

test("cache returns a value until it expires", () => {
  const clock = fakeClock();
  const cache = createCache({ ttlMs: 1000, now: clock.now });
  cache.set("bishkek", 42);
  assert.equal(cache.get("bishkek"), 42);
  clock.advance(999);
  assert.equal(cache.get("bishkek"), 42);
  clock.advance(1);
  assert.equal(cache.get("bishkek"), undefined);
});

test("cache forgets the oldest entry when full", () => {
  const cache = createCache({ ttlMs: 1000, maxEntries: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
  assert.equal(cache.size, 2);
});
