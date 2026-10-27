// Tests for the pure weather logic. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { averageOf, buildHours, buildOutfit, pickDayHours, summarizeDay, targetDate } from "../src/weather.js";

// A fake Open-Meteo answer: 2 days of hours, every model gives the same numbers
// except the temperature, where the models disagree (so we can test the average).
function fakeHourly({ temperature, apparent, rainChance = 0, precipitation = 0, code = 0, wind = 3 }) {
  const time = [];
  for (const date of ["2026-10-27", "2026-10-28"]) {
    for (let h = 0; h < 24; h++) {
      time.push(`${date}T${String(h).padStart(2, "0")}:00`);
    }
  }
  const hourly = { time };
  const models = { ecmwf_ifs025: -1, icon_seamless: 0, gfs_seamless: 1 };
  for (const [model, shift] of Object.entries(models)) {
    hourly[`temperature_2m_${model}`] = time.map((t, i) => temperature(i % 24) + shift);
    hourly[`apparent_temperature_${model}`] = time.map((t, i) => apparent(i % 24));
    hourly[`precipitation_probability_${model}`] = time.map(() => rainChance);
    hourly[`precipitation_${model}`] = time.map(() => precipitation);
    hourly[`snowfall_${model}`] = time.map(() => 0);
    hourly[`wind_speed_10m_${model}`] = time.map(() => wind);
    hourly[`wind_gusts_10m_${model}`] = time.map(() => wind * 1.5);
    hourly[`weather_code_${model}`] = time.map(() => code);
  }
  return hourly;
}

test("averageOf", () => {
  assert.equal(averageOf([1, 2, 3]), 2);
  assert.equal(averageOf([]), null);
});

test("buildHours averages the three models", () => {
  const hours = buildHours(fakeHourly({ temperature: () => 10, apparent: () => 8 }));
  assert.equal(hours.length, 48);
  assert.equal(hours[0].temperature, 10); // (9 + 10 + 11) / 3
});

test("buildHours skips a model with a broken list", () => {
  const hourly = fakeHourly({ temperature: () => 10, apparent: () => 8 });
  hourly.temperature_2m_gfs_seamless = [1, 2]; // wrong length
  assert.equal(buildHours(hourly)[0].temperature, 9.5); // (9 + 10) / 2
});

test("targetDate handles tomorrow across a month end", () => {
  assert.equal(targetDate("2026-10-31T09:15", "tomorrow"), "2026-11-01");
  assert.equal(targetDate("2026-10-31T09:15", "today"), "2026-10-31");
});

test("pickDayHours: today skips past hours, tomorrow is 07–21", () => {
  const hours = buildHours(fakeHourly({ temperature: () => 10, apparent: () => 8 }));
  const today = pickDayHours(hours, "2026-10-27T15:30", "today");
  assert.equal(today[0].time, "2026-10-27T15:00");
  assert.equal(today.at(-1).time, "2026-10-27T21:00");
  const tomorrow = pickDayHours(hours, "2026-10-27T15:30", "tomorrow");
  assert.equal(tomorrow.length, 15);
  assert.equal(tomorrow[0].time, "2026-10-28T07:00");
  assert.equal(pickDayHours(hours, "2026-10-27T23:10", "today").length, 0);
});

test("cold morning, warm afternoon: coat for the morning and a layers note", () => {
  // Feels like 0° at 7:00, rising 1° per hour to 14° at 21:00
  const hourly = fakeHourly({ temperature: (h) => h - 5, apparent: (h) => h - 7 });
  const summary = summarizeDay(pickDayHours(buildHours(hourly), "2026-10-27T06:00", "today"));
  assert.equal(summary.minApparent, 0);
  assert.equal(summary.maxApparent, 14);
  assert.equal(summary.parts.length, 3);
  const outfit = buildOutfit(summary);
  assert.match(outfit.top, /warm jacket/);
  assert.ok(outfit.notes.some((note) => note.includes("layers")));
  assert.ok(!outfit.accessories.includes("umbrella"));
});

test("rainy day: umbrella with the time it starts", () => {
  const hourly = fakeHourly({ temperature: () => 15, apparent: () => 14, rainChance: 80, precipitation: 1, code: 63 });
  const summary = summarizeDay(pickDayHours(buildHours(hourly), "2026-10-27T06:00", "tomorrow"));
  const outfit = buildOutfit(summary);
  assert.ok(outfit.accessories.includes("umbrella"));
  assert.ok(outfit.notes.some((note) => note.includes("from about 07:00")));
  assert.ok(outfit.notes.some((note) => note.includes("waterproof"))); // 15 mm in the day
});

test("hot day: sun things", () => {
  const hourly = fakeHourly({ temperature: () => 33, apparent: () => 35 });
  const summary = summarizeDay(pickDayHours(buildHours(hourly), "2026-10-27T06:00", "today"));
  const outfit = buildOutfit(summary);
  assert.match(outfit.bottom, /shorts/);
  assert.ok(outfit.accessories.includes("water bottle"));
});

test("strong wind note", () => {
  const hourly = fakeHourly({ temperature: () => 10, apparent: () => 6, wind: 12 });
  const outfit = buildOutfit(summarizeDay(pickDayHours(buildHours(hourly), "2026-10-27T06:00", "today")));
  assert.ok(outfit.notes.some((note) => note.includes("windproof")));
});

test("summarizeDay of no hours is null", () => {
  assert.equal(summarizeDay([]), null);
});
