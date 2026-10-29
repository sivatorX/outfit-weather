# Outfit Weather: project guide for Claude

## What this project is
A **ChatGPT plugin** (OpenAI's name for apps in the ChatGPT directory) that answers "what should I wear?" with a precise, whole-day weather forecast and a nice neon card.
It is the author's **third project** ("level 3"). Earlier projects:
- Level 1: Battleship game https://github.com/sivatorX/neon-armada
- Level 2: Weather app https://github.com/sivatorX/neon-weather (its `insights.js`, 3-model averaging and WMO codes are reused here)

**Main learning goals:** a real server (Node.js), MCP (how ChatGPT calls your code), hosting with HTTPS, publishing to the ChatGPT plugin directory. Later: accounts, database, payments.

## Product (version 1.0 first, the rest later)
- **v1.0 (free):** one tool `outfit_today`: what an adult should wear today/tomorrow in a city, looking at the WHOLE day (morning → evening), "feels like", rain/snow/wind, from the 3-model average (ECMWF, ICON, GFS via Open-Meteo). Answer = short text + a card.
- Later free tools: `outfit_trip` (packing list for several days), `outfit_event` (an event at a given time), child profile.
- Later paid features ONLY on our own website (morning notifications, family profiles, my wardrobe). Users sign in to that paid account inside ChatGPT.
- Languages: English first, then Russian and Kyrgyz.

## OpenAI rules we must follow (developers.openai.com/plugins, read 2026-10-27; re-check before submitting)
- No selling inside ChatGPT: "plugins may conduct commerce only for physical goods"; subscriptions/digital goods are not allowed. Allowed: "Users may sign in to an existing paid account and access features already included in their subscription"; a link to an informational plans page (never to checkout).
- No ads, no "trial or demo" plugins. Do not ask for raw location/coordinates in tool inputs: ask for a city name.
- Submission needs: verified OpenAI organization (individual or business), privacy policy URL, support contact, public HTTPS MCP server we host ourselves, domain verification, 5 positive + 3 negative test cases, demo video.

## About the author (important)
- A beginner who wants to become a professional developer. **Teach, don't just code.**
- **Always answer in Russian.** Simple words, short sentences, real-life examples. Code and names stay in English.
- Explain each new idea (server, MCP, npm, package.json, environment variables, HTTPS, deploy) in 1–3 simple sentences the first time.
- Modes: "I'll do it myself" (one small step at a time, then check) or "Do it yourself" (write, test, then explain).
- Edits in **Cursor**; unsaved changes there can overwrite files on disk.

## Tech choices
- **Node.js** (installed: v24 LTS at `C:\Program Files\nodejs`). Plain JavaScript (ES modules), no TypeScript at first, no frameworks unless the MCP SDK needs them.
- Weather data: Open-Meteo (free, no key). Never put secret keys in the repo; use environment variables (`.env`, in `.gitignore`).
- Keep the weather logic pure (no network inside), so it can be tested without the internet.

## Code style
- 2-space indent, `const`/`let`, no `var`, clear English names, short "why" comments.
- Validate everything from outside (tool inputs from ChatGPT, API answers).
- Every network call: timeout + friendly error message.

## Workflow
- Small steps; commit after each finished step. git works only in **bash**, not PowerShell.
- GitHub CLI (not on PATH): `/c/Users/armin/AppData/Local/Microsoft/WinGet/Packages/GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe/bin/gh.exe` (logged in as sivatorX).
- Always say what you checked before saying something works.

## Hosting (Render)
- Web Service `outfit-weather`, Free instance, build `npm ci`, start `npm start`; Render sets `PORT`. `render.yaml` holds the same settings.
- Free plan sleeps after 15 minutes without requests; the first request then takes up to about a minute.
- Render's shared outbound addresses hit Open-Meteo's daily limit (429 "Daily API request limit exceeded"). So Open-Meteo is asked through a Cloudflare Worker (`worker/`, `https://outfit-weather-proxy.arminabizade.workers.dev`, deploy: `cd worker && npx wrangler deploy`, logged in as the author). It only forwards `/geocoding` and `/forecast`; the server falls back to direct calls if it fails, and caches cities (24 h) and forecasts (30 min fresh, 3 h on errors).
- Optional protection: `wrangler secret put PROXY_KEY` on the Worker + the same value as `OPEN_METEO_PROXY_KEY` in Render → Environment. Not set yet (2026-10-29): the author could not find the Render setting.
- After changing tools or the card: push, wait for "Live", then Refresh the plugin in ChatGPT. The address never changes.

## Testing in ChatGPT (temporary tunnel, only for local experiments now)
- Tunnel: cloudflared (uninstalled 2026-10-28; reinstall with `winget install --id Cloudflare.cloudflared -e`, uninstall needs admin). Quick tunnels need no account:
  `"/c/Program Files (x86)/cloudflared/cloudflared.exe" tunnel --no-autoupdate --url http://localhost:3000`
  The `https://<random>.trycloudflare.com` address changes on every start and can die after some hours. Prefer Render.
- ChatGPT: Settings → Plugins → + → Add custom MCP server. Developer mode is no longer needed. Connection: Server URL (not "Tunnel", that is OpenAI's own tunnel), URL ends with `/mcp`, Authentication: none.
- The server logs one line per request; ChatGPT shows up as `openai-mcp/1.0.0`. ChatGPT sometimes answers from web search instead of the tool: tell it "Use Outfit Weather".

## Roadmap (version 1.0)
1. ✅ Node.js installed, project folder created.
2. ✅ MCP server with one tool `outfit_today`, tested with MCP Inspector on this PC (`npm start`, `npm test`, `npm run inspect`).
3. ✅ Tested inside ChatGPT through a temporary HTTPS tunnel (2026-10-27): ChatGPT called `outfit_today` and showed our numbers.
4. ✅ Neon card UI inside ChatGPT (2026-10-28): `src/widget/outfit-card.html`, MCP Apps standard. Bump the `vN` in `CARD_URI` when the card changes.
5. 🟡 Hosted on Render (free plan): https://outfit-weather.onrender.com/mcp, repo `sivatorX/outfit-weather` (public). Every push to `main` redeploys. Still to do: own domain.
6. ✅ Website on the same server (2026-10-28): `/` home, `/privacy`, `/support` from `site/`. Support email: outfitweather9@gmail.com (`SUPPORT_EMAIL` in `src/server.js`). Plugin package with icon for submission: `plugin/`.
7. Submit to the ChatGPT plugin directory.
8. Later: accounts and paid features on the website.
