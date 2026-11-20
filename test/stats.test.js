import assert from "node:assert/strict";
import { test } from "node:test";
import { createStats } from "../src/stats.js";

function clock(start) {
  let t = new Date(start);
  return { now: () => t, set: (iso) => (t = new Date(iso)) };
}

test("counts per day, newest day first, with totals", () => {
  const c = clock("2026-11-20T10:00:00Z");
  const stats = createStats({ now: c.now });
  stats.bump("toolCalls");
  stats.bump("answers");
  c.set("2026-11-21T09:00:00Z");
  stats.bump("toolCalls");
  stats.bump("errors");
  const r = stats.report();
  assert.equal(r.days[0].date, "2026-11-21");
  assert.equal(r.days[1].date, "2026-11-20");
  assert.deepEqual(r.total, { toolCalls: 2, answers: 1, errors: 1, cardLoads: 0 });
});

test("keeps only the last keepDays days", () => {
  const c = clock("2026-11-01T00:00:00Z");
  const stats = createStats({ now: c.now, keepDays: 2 });
  for (const d of ["01", "02", "03"]) {
    c.set(`2026-11-${d}T12:00:00Z`);
    stats.bump("cardLoads");
  }
  assert.deepEqual(stats.report().days.map((d) => d.date), ["2026-11-03", "2026-11-02"]);
});

test("refuses unknown counter names", () => {
  assert.throws(() => createStats().bump("cities"));
});
