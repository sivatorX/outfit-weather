// Cloudflare Worker: a small "middleman" between our Render server and Open-Meteo.
// Render shares its internet address with many apps, so Open-Meteo's daily limit for that
// address is often used up. The Worker asks Open-Meteo from Cloudflare's addresses instead.
//
// It only passes on the two Open-Meteo addresses we need, and only for requests that
// carry our secret key, so nobody else can use it.

const ROUTES = {
  "/geocoding": "https://geocoding-api.open-meteo.com/v1/search",
  "/forecast": "https://api.open-meteo.com/v1/forecast",
};

export default {
  async fetch(request, env) {
    if (request.method !== "GET") {
      return new Response("Method not allowed\n", { status: 405 });
    }
    // The key is set with `wrangler secret put PROXY_KEY` and is never in the code
    if (!env.PROXY_KEY || request.headers.get("x-proxy-key") !== env.PROXY_KEY) {
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
};
