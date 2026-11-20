// Anonymous usage counters: how many times per day the plugin was used.
// Only numbers per day: no city, no answer, nothing about who asked (see site/privacy.html).
// They live in memory, so a restart (a new deploy) starts from zero again.

const COUNTERS = ["toolCalls", "answers", "errors", "cardLoads"];

export function createStats({ now = () => new Date(), keepDays = 60 } = {}) {
  const days = new Map(); // "2026-11-20" -> { toolCalls, answers, errors, cardLoads }
  const startedAt = now().toISOString();

  function bump(name) {
    if (!COUNTERS.includes(name)) {
      throw new Error(`unknown counter: ${name}`);
    }
    const day = now().toISOString().slice(0, 10); // UTC day
    if (!days.has(day)) {
      days.set(day, Object.fromEntries(COUNTERS.map((c) => [c, 0])));
      // Keep only the last keepDays days, so memory never grows without limit
      const sorted = [...days.keys()].sort();
      for (const old of sorted.slice(0, Math.max(0, sorted.length - keepDays))) {
        days.delete(old);
      }
    }
    days.get(day)[name] += 1;
  }

  // Newest day first, plus totals since the server started
  function report() {
    const list = [...days.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, c]) => ({ date, ...c }));
    const total = Object.fromEntries(COUNTERS.map((c) => [c, list.reduce((sum, d) => sum + d[c], 0)]));
    return { startedAt, total, days: list };
  }

  return { bump, report };
}
