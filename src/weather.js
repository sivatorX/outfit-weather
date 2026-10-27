// Pure weather logic: data in, data out. No network here,
// so every function can be tested without the internet.

// The three models we average. They often disagree a little;
// the average is usually closer to the truth than any single one.
export const MODELS = ["ecmwf_ifs025", "icon_seamless", "gfs_seamless"];

// The hourly fields we ask Open-Meteo for (for every model).
export const HOURLY_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation_probability",
  "precipitation",
  "snowfall",
  "wind_speed_10m",
  "wind_gusts_10m",
  "weather_code",
];

// The part of the day a person is outside: 07:00 to 21:00 (inclusive).
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 21;

// Limits for the advice
const RAIN_CHANCE_LIMIT = 50; // % from which we say "take an umbrella"
const RAIN_AMOUNT_LIMIT = 1; // mm in the day from which rain really matters
const HEAVY_RAIN_LIMIT = 10; // mm in the day: waterproof shoes
const STRONG_WIND = 10; // m/s, average wind
const STRONG_GUSTS = 15; // m/s, gusts
const BIG_SWING = 8; // degrees between the coldest and the warmest hour
const HOT_DAY = 28; // "feels like" degrees

// WMO weather codes -> short English text
const WEATHER_CODES = {
  0: "clear sky",
  1: "mostly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "freezing fog",
  51: "light drizzle",
  53: "drizzle",
  55: "heavy drizzle",
  56: "light freezing drizzle",
  57: "freezing drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  66: "light freezing rain",
  67: "freezing rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  77: "snow grains",
  80: "light showers",
  81: "showers",
  82: "heavy showers",
  85: "light snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with light hail",
  99: "thunderstorm with heavy hail",
};

const SNOW_CODES = [71, 73, 75, 77, 85, 86];
const STORM_FIRST_CODE = 95;

export function describeWeatherCode(code) {
  return WEATHER_CODES[code] ?? "unknown weather";
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Average of a list of numbers. null for an empty list.
export function averageOf(numbers) {
  if (numbers.length === 0) {
    return null;
  }
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function minOf(numbers) {
  return numbers.length === 0 ? null : Math.min(...numbers);
}

function maxOf(numbers) {
  return numbers.length === 0 ? null : Math.max(...numbers);
}

function round1(value) {
  return value === null ? null : Math.round(value * 10) / 10;
}

// One field at one hour from all models. A model with a broken list is skipped.
function valuesAt(hourly, field, index) {
  const values = [];
  for (const model of MODELS) {
    const list = hourly[`${field}_${model}`];
    if (Array.isArray(list) && list.length === hourly.time.length && isNumber(list[index])) {
      values.push(list[index]);
    }
  }
  return values;
}

// The weather code: the most common code of the models.
// On a tie the "wettest" (highest) code wins: better to warn than to surprise.
function pickWeatherCode(codes) {
  if (codes.length === 0) {
    return null;
  }
  const counts = new Map();
  for (const code of codes) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best = codes[0];
  for (const [code, count] of counts) {
    const bestCount = counts.get(best);
    if (count > bestCount || (count === bestCount && code > best)) {
      best = code;
    }
  }
  return best;
}

// Turn the raw Open-Meteo answer into a simple list of hours (models averaged).
export function buildHours(hourly) {
  if (!hourly || !Array.isArray(hourly.time)) {
    return [];
  }
  const hours = [];
  hourly.time.forEach((time, index) => {
    const temperature = averageOf(valuesAt(hourly, "temperature_2m", index));
    if (typeof time !== "string" || temperature === null) {
      return; // skip a broken hour
    }
    hours.push({
      time, // local time of the city, like "2026-10-27T15:00"
      temperature,
      apparent: averageOf(valuesAt(hourly, "apparent_temperature", index)),
      rainChance: averageOf(valuesAt(hourly, "precipitation_probability", index)),
      precipitation: averageOf(valuesAt(hourly, "precipitation", index)),
      snowfall: averageOf(valuesAt(hourly, "snowfall", index)),
      wind: averageOf(valuesAt(hourly, "wind_speed_10m", index)),
      gusts: averageOf(valuesAt(hourly, "wind_gusts_10m", index)),
      weatherCode: pickWeatherCode(valuesAt(hourly, "weather_code", index)),
    });
  });
  return hours;
}

function hourOf(time) {
  return Number(time.slice(11, 13));
}

// The date ("2026-10-27") of "today" or "tomorrow" in the city.
export function targetDate(currentTime, day) {
  const today = currentTime.slice(0, 10);
  if (day === "today") {
    return today;
  }
  // Noon in UTC: adding one day can never jump over a date because of the time zone
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// The outdoor hours of the chosen day. For today, hours already gone are skipped.
export function pickDayHours(hours, currentTime, day) {
  const date = targetDate(currentTime, day);
  const nowHour = currentTime.slice(0, 13); // "2026-10-27T15"
  return hours.filter((hour) => {
    if (hour.time.slice(0, 10) !== date) {
      return false;
    }
    const h = hourOf(hour.time);
    if (h < DAY_START_HOUR || h > DAY_END_HOUR) {
      return false;
    }
    return day !== "today" || hour.time.slice(0, 13) >= nowHour;
  });
}

// Morning, afternoon and evening, so the card can show how the day changes.
const DAY_PARTS = [
  { name: "morning", from: 7, to: 11 },
  { name: "afternoon", from: 12, to: 17 },
  { name: "evening", from: 18, to: 21 },
];

function summarizePart(hours, part) {
  const partHours = hours.filter((hour) => {
    const h = hourOf(hour.time);
    return h >= part.from && h <= part.to;
  });
  if (partHours.length === 0) {
    return null; // for example the morning of today is already over
  }
  return {
    name: part.name,
    temperature: round1(averageOf(partHours.map((hour) => hour.temperature))),
    apparent: round1(averageOf(partHours.map((hour) => hour.apparent).filter(isNumber))),
    weather: describeWeatherCode(pickWeatherCode(partHours.map((hour) => hour.weatherCode).filter(isNumber))),
  };
}

// The first hour (as "HH:MM") that matches a test, or null.
function firstClock(hours, test) {
  const hour = hours.find(test);
  return hour ? hour.time.slice(11, 16) : null;
}

// All numbers of the day that the advice needs.
export function summarizeDay(dayHours) {
  if (dayHours.length === 0) {
    return null;
  }
  const field = (name) => dayHours.map((hour) => hour[name]).filter(isNumber);
  const apparent = field("apparent");
  const codes = field("weatherCode");
  const isWetHour = (hour) =>
    (isNumber(hour.rainChance) && hour.rainChance >= RAIN_CHANCE_LIMIT) ||
    (isNumber(hour.precipitation) && hour.precipitation >= 0.5);

  return {
    from: dayHours[0].time.slice(11, 16),
    to: dayHours[dayHours.length - 1].time.slice(11, 16),
    minTemperature: round1(minOf(field("temperature"))),
    maxTemperature: round1(maxOf(field("temperature"))),
    // Without "feels like" data we fall back to the real temperature
    minApparent: round1(minOf(apparent.length > 0 ? apparent : field("temperature"))),
    maxApparent: round1(maxOf(apparent.length > 0 ? apparent : field("temperature"))),
    maxRainChance: round1(maxOf(field("rainChance"))),
    totalPrecipitation: round1(field("precipitation").reduce((sum, value) => sum + value, 0)),
    totalSnowfall: round1(field("snowfall").reduce((sum, value) => sum + value, 0)),
    maxWind: round1(maxOf(field("wind"))),
    maxGusts: round1(maxOf(field("gusts"))),
    hasSnow: codes.some((code) => SNOW_CODES.includes(code)) || field("snowfall").some((value) => value > 0),
    hasStorm: codes.some((code) => code >= STORM_FIRST_CODE),
    firstWetTime: firstClock(dayHours, isWetHour),
    parts: DAY_PARTS.map((part) => summarizePart(dayHours, part)).filter((part) => part !== null),
  };
}

// The main clothes. The COLDEST "feels like" hour decides,
// because you wear the same jacket in the morning and in the evening.
function chooseBaseOutfit(minApparent) {
  if (minApparent <= -15) {
    return {
      top: "thermal base layer, warm sweater and a heavy winter coat",
      bottom: "thermal leggings under warm trousers",
      shoes: "insulated winter boots",
      accessories: ["warm hat", "scarf", "insulated gloves"],
    };
  }
  if (minApparent <= -5) {
    return {
      top: "sweater and a winter coat",
      bottom: "warm trousers",
      shoes: "warm winter boots",
      accessories: ["hat", "scarf", "gloves"],
    };
  }
  if (minApparent <= 5) {
    return {
      top: "sweater and a warm jacket",
      bottom: "jeans or warm trousers",
      shoes: "closed boots or warm sneakers",
      accessories: ["light hat", "gloves"],
    };
  }
  if (minApparent <= 12) {
    return {
      top: "long sleeves and a jacket",
      bottom: "jeans or trousers",
      shoes: "closed shoes or sneakers",
      accessories: [],
    };
  }
  if (minApparent <= 18) {
    return {
      top: "long sleeves with a light jacket or sweater",
      bottom: "jeans or trousers",
      shoes: "sneakers",
      accessories: [],
    };
  }
  if (minApparent <= 24) {
    return {
      top: "T-shirt, maybe a light layer for later",
      bottom: "light trousers or a skirt",
      shoes: "sneakers",
      accessories: [],
    };
  }
  return {
    top: "light breathable T-shirt",
    bottom: "shorts or a light skirt",
    shoes: "sandals or light sneakers",
    accessories: [],
  };
}

// The advice for the whole day: main clothes + extra notes.
export function buildOutfit(summary) {
  const outfit = chooseBaseOutfit(summary.minApparent);
  const accessories = [...outfit.accessories];
  const notes = [];

  const rainMatters =
    (summary.maxRainChance !== null && summary.maxRainChance >= RAIN_CHANCE_LIMIT) ||
    summary.totalPrecipitation >= RAIN_AMOUNT_LIMIT;

  if (summary.hasSnow && summary.minTemperature !== null && summary.minTemperature <= 2) {
    notes.push(`Snow expected${summary.firstWetTime ? ` from about ${summary.firstWetTime}` : ""}: wear boots with a good grip.`);
  } else if (rainMatters) {
    accessories.push("umbrella");
    notes.push(`Rain likely${summary.firstWetTime ? ` from about ${summary.firstWetTime}` : ""}: take an umbrella.`);
    if (summary.totalPrecipitation >= HEAVY_RAIN_LIMIT) {
      notes.push("A lot of rain: waterproof shoes and a jacket with a hood are better.");
    }
  }

  if (summary.hasStorm) {
    notes.push("Thunderstorm possible: plan to be indoors when it comes.");
  }

  const windy =
    (summary.maxWind !== null && summary.maxWind >= STRONG_WIND) ||
    (summary.maxGusts !== null && summary.maxGusts >= STRONG_GUSTS);
  if (windy) {
    notes.push(`Strong wind (gusts up to ${Math.round(summary.maxGusts ?? summary.maxWind)} m/s): a windproof outer layer helps.`);
  }

  if (summary.maxApparent - summary.minApparent >= BIG_SWING) {
    notes.push(
      `It feels ${Math.round(summary.minApparent)}° at the coldest and ${Math.round(summary.maxApparent)}° at the warmest: dress in layers you can take off.`
    );
  }

  if (summary.maxApparent >= HOT_DAY) {
    accessories.push("sunglasses", "cap or sun hat", "water bottle");
    notes.push("Hot day: drink water and stay in the shade at midday.");
  }

  return { ...outfit, accessories, notes };
}

// A short text answer for ChatGPT, built from the summary and the outfit.
export function buildAnswerText(place, dayLabel, summary, outfit) {
  const lines = [
    `${place} ${dayLabel} (${summary.from}–${summary.to}): ${Math.round(summary.minTemperature)}…${Math.round(summary.maxTemperature)}°C, feels like ${Math.round(summary.minApparent)}…${Math.round(summary.maxApparent)}°C.`,
    `Wear: ${outfit.top}; ${outfit.bottom}; ${outfit.shoes}.`,
  ];
  if (outfit.accessories.length > 0) {
    lines.push(`Take: ${outfit.accessories.join(", ")}.`);
  }
  lines.push(...outfit.notes);
  return lines.join("\n");
}
