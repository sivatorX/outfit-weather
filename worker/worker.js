// Cloudflare Worker: a small "middleman" between our Render server and Open-Meteo.
// Render shares its internet address with many apps, so Open-Meteo's daily limit for that
// address is often used up. The Worker asks Open-Meteo from Cloudflare's addresses instead.
//
// It only passes on the two Open-Meteo addresses we need, so it can't be used for anything else.
// If the PROXY_KEY secret is set (`wrangler secret put PROXY_KEY`), requests must also carry it.

const KEEP_AWAKE_URL = "https://outfit-weather.onrender.com/";

const ROUTES = {
  "/geocoding": "https://geocoding-api.open-meteo.com/v1/search",
  "/forecast": "https://api.open-meteo.com/v1/forecast",
};

export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return new Response("Method not allowed\n", { status: 405 });
    }
    // The key is optional and never in the code (the repo is public)
    if (env.PROXY_KEY && request.headers.get("x-proxy-key") !== env.PROXY_KEY) {
      return new Response("Forbidden\n", { status: 403 });
    }

    const url = new URL(request.url);
    const target = ROUTES[url.pathname];
    if (!target) {
      return new Response("Not found\n", { status: 404 });
    }

    // Same question to Open-Meteo, same answer back (status code included)
    const answer = await fetch(`${target}${url.search}`, {
      headers: { "User-Agent": "outfit-weather (https://outfit-weather.onrender.com)" },
    });
    return new Response(answer.body, {
      status: answer.status,
      headers: { "Content-Type": answer.headers.get("Content-Type") || "application/json" },
    });
  },

  // Runs on the schedule in wrangler.toml ([triggers] crons).
  // Render's free plan puts the server to sleep after 15 minutes without requests,
  // and the first visitor then waits up to a minute. A small knock every 10 minutes keeps it awake.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      fetch(KEEP_AWAKE_URL, {
        method: "HEAD",
        headers: { "User-Agent": "outfit-weather-keep-awake" },
        signal: AbortSignal.timeout(60_000),
      }).catch((error) => console.log(`keep-awake failed: ${error}`))
    );
  },
};
