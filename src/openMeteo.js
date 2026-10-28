// Network calls to Open-Meteo (free, no API key).
// All the thinking about the weather is in weather.js; here we only download.
import { HOURLY_FIELDS, MODELS } from "./weather.js";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 10000;

// An error with a message we can show to the user as it is
export class FriendlyError extends Error {}

// Download JSON. A stuck server must not hang the tool forever, so we use a timeout.
async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
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
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
  const data = await fetchJson(url);
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
  const url =
    `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&current=temperature_2m" + // only to learn the local time of the city
    `&hourly=${HOURLY_FIELDS.join(",")}` +
    `&models=${MODELS.join(",")}` +
    "&forecast_days=2&timezone=auto&wind_speed_unit=ms";
  const data = await fetchJson(url);
  if (!data?.hourly || !Array.isArray(data.hourly.time) || typeof data.current?.time !== "string") {
    throw new FriendlyError("The weather service sent incomplete data. Please try again later.");
  }
  return { hourly: data.hourly, currentTime: data.current.time };
}
