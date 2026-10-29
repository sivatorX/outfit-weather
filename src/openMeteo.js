// Network calls to Open-Meteo (free, no API key), directly or through our Cloudflare Worker.
// All the thinking about the weather is in weather.js; here we only download.
import { createCache } from "./cache.js";
import { HOURLY_FIELDS, MODELS } from "./weather.js";

// Our host shares its internet address with many apps, so Open-Meteo sometimes says
// "too many requests" (429). Remembering answers means we ask less often.
const cityCache = createCache({ ttlMs: 24 * 60 * 60 * 1000 }); // cities don't move
const forecastCache = createCache({ ttlMs: 3 * 60 * 60 * 1000 }); // kept 3 h, but "fresh" only 30 min
const FORECAST_FRESH_MS = 30 * 60 * 1000;

const DIRECT_URLS = {
  geocoding: "https://geocoding-api.open-meteo.com/v1/search",
  forecast: "https://api.open-meteo.com/v1/forecast",
};
const REQUEST_TIMEOUT_MS = 10000;

// Middleman on Cloudflare (worker/worker.js). The address is not a secret, so it has a default.
// OPEN_METEO_PROXY_URL="" in the hosting settings turns it off. The optional key is a secret,
// so it only ever comes from the hosting settings.
const PROXY_URL = (process.env.OPEN_METEO_PROXY_URL ?? "https://outfit-weather-proxy.arminabizade.workers.dev").replace(
  /\/+$/,
  ""
);
const PROXY_KEY = process.env.OPEN_METEO_PROXY_KEY;

// An error with a message we can show to the user as it is
export class FriendlyError extends Error {}

// Ask Open-Meteo: through the middleman if we have one, directly if not (or if it fails)
async function askOpenMeteo(kind, query) {
  if (PROXY_URL) {
    try {
      const headers = PROXY_KEY ? { "x-proxy-key": PROXY_KEY } : {};
      return await fetchJson(`${PROXY_URL}/${kind}?${query}`, headers);
    } catch (error) {
      if (!(error instanceof FriendlyError)) throw error;
      console.error(`Proxy failed (${error.message}), trying Open-Meteo directly`);
    }
  }
  return fetchJson(`${DIRECT_URLS[kind]}?${query}`);
}

// Download JSON. A stuck server must not hang the tool forever, so we use a timeout.
async function fetchJson(url, headers = {}) {
  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    if (error.name === "TimeoutError") {
      throw new FriendlyError("The weather service is too slow right now. Please try again in a minute.");
    }
    throw new FriendlyError("Could not reach the weather service. Please try again later.");
  }
  if (!response.ok) {
    // Log what the service said (no city names), so we can see the reason in the hosting logs
    const body = await response.text().catch(() => "");
    console.error(`Open-Meteo ${new URL(url).hostname} answered ${response.status}: ${body.slice(0, 200)}`);
    // Open-Meteo explains errors in a "reason" field, e.g. which request limit was hit
    let reason = "";
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.reason === "string") reason = ` ${parsed.reason.slice(0, 160)}`;
    } catch {
      // not JSON: keep the short message
    }
    throw new FriendlyError(
      `The weather service is not available right now (code ${response.status}).${reason || " Please try again later."}`
    );
  }
  try {
    return await response.json();
  } catch {
    throw new FriendlyError("The weather service sent a broken answer. Please try again later.");
  }
}

// City name -> the best match with coordinates, or a FriendlyError.
export async function findCity(name) {
  const key = name.trim().toLowerCase();
  const cached = cityCache.get(key);
  if (cached) return cached;

  const place = await downloadCity(name);
  cityCache.set(key, place);
  return place;
}

async function downloadCity(name) {
  const data = await askOpenMeteo("geocoding", `name=${encodeURIComponent(name)}&count=1&language=en&format=json`);
  const place = Array.isArray(data?.results) ? data.results[0] : undefined;
  if (!place || typeof place.latitude !== "number" || typeof place.longitude !== "number") {
    throw new FriendlyError(`I could not find a city called "${name}". Check the spelling or add the country.`);
  }
  return {
    name: typeof place.name === "string" ? place.name : name,
    country: typeof place.country === "string" ? place.country : "",
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

// Hourly forecast for today and tomorrow from all three models in one request.
// The field names end with the model, like temperature_2m_icon_seamless.
export async function fetchForecast(place) {
  // About 1 km precision is plenty for weather and lets nearby requests share one answer
  const key = `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;
  const cached = forecastCache.get(key);
  if (cached && Date.now() - cached.savedAt < FORECAST_FRESH_MS) {
    return cached.forecast;
  }
  try {
    const forecast = await downloadForecast(place);
    forecastCache.set(key, { forecast, savedAt: Date.now() });
    return forecast;
  } catch (error) {
    // The service refused or failed: a forecast up to 3 hours old is still much better than nothing
    if (cached && error instanceof FriendlyError) {
      return cached.forecast;
    }
    throw error;
  }
}

async function downloadForecast(place) {
  const query =
    `latitude=${place.latitude}&longitude=${place.longitude}` +
    "&current=temperature_2m" + // only to learn the local time of the city
    `&hourly=${HOURLY_FIELDS.join(",")}` +
    `&models=${MODELS.join(",")}` +
    "&forecast_days=2&timezone=auto&wind_speed_unit=ms";
  const data = await askOpenMeteo("forecast", query);
  if (!data?.hourly || !Array.isArray(data.hourly.time) || typeof data.current?.time !== "string") {
    throw new FriendlyError("The weather service sent incomplete data. Please try again later.");
  }
  return { hourly: data.hourly, currentTime: data.current.time };
}
