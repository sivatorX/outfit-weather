// The MCP server: ChatGPT (or MCP Inspector) sends requests to /mcp,
// and we answer with the result of our tool.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { fetchForecast, findCity, FriendlyError } from "./openMeteo.js";
import { buildAnswerText, buildHours, buildOutfit, pickDayHours, summarizeDay, targetDate } from "./weather.js";

const PORT = Number(process.env.PORT) || 3000;

// The neon card ChatGPT shows under the answer (MCP Apps standard).
// ChatGPT caches the card by this address: change "v1" when the HTML changes.
const CARD_URI = "ui://widget/outfit-card-v2.html";
const CARD_MIME_TYPE = "text/html;profile=mcp-app";
const CARD_HTML = readFileSync(new URL("./widget/outfit-card.html", import.meta.url), "utf8");

// The work of the tool, without anything MCP-specific
async function outfitToday({ city, day }) {
  const place = await findCity(city);
  const forecast = await fetchForecast(place);
  const hours = buildHours(forecast.hourly);
  const summary = summarizeDay(pickDayHours(hours, forecast.currentTime, day));
  const placeName = place.country ? `${place.name}, ${place.country}` : place.name;

  if (!summary) {
    throw new FriendlyError(`The day in ${placeName} is already over. Ask about tomorrow instead.`);
  }
  const outfit = buildOutfit(summary);
  return {
    text: buildAnswerText(placeName, day, summary, outfit),
    // Structured data for the neon card (src/widget/outfit-card.html)
    data: { place: placeName, day, date: targetDate(forecast.currentTime, day), summary, outfit },
  };
}

// A fresh MCP server per request: "stateless" mode, simple and safe for hosting.
function buildMcpServer() {
  const server = new McpServer({ name: "outfit-weather", version: "1.0.0" });

  // The card's HTML. It uses no outside scripts, fonts or APIs, so the security policy (CSP) stays empty.
  server.registerResource("outfit-card", CARD_URI, { title: "Outfit card", mimeType: CARD_MIME_TYPE }, async () => ({
    contents: [
      {
        uri: CARD_URI,
        mimeType: CARD_MIME_TYPE,
        text: CARD_HTML,
        _meta: {
          ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } },
          "openai/widgetDescription":
            "A card with the day's temperature range, feels-like, morning/afternoon/evening weather and the outfit. " +
            "It already shows all the details, so do not repeat them in a long list.",
        },
      },
    ],
  }));

  server.registerTool(
    "outfit_today",
    {
      title: "What to wear today",
      description:
        "Tells an adult what to wear today or tomorrow in a city, based on the whole day (07:00–21:00): " +
        "temperature, feels-like, rain, snow and wind, averaged from three weather models (ECMWF, ICON, GFS).",
      inputSchema: {
        city: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .describe("City name, optionally with the country, e.g. 'Bishkek' or 'Paris, France'"),
        day: z.enum(["today", "tomorrow"]).default("today").describe("Which day to dress for"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
      _meta: {
        ui: { resourceUri: CARD_URI }, // the standard way to link the card
        "openai/outputTemplate": CARD_URI, // the same for older ChatGPT versions
        "openai/toolInvocation/invoking": "Checking the whole day's weather…",
        "openai/toolInvocation/invoked": "Outfit ready",
      },
    },
    async (input) => {
      try {
        const result = await outfitToday(input);
        return { content: [{ type: "text", text: result.text }], structuredContent: result.data };
      } catch (error) {
        // Friendly errors go to the user; anything else is our bug, so log it
        if (!(error instanceof FriendlyError)) {
          console.error(error);
        }
        const message = error instanceof FriendlyError ? error.message : "Something went wrong. Please try again.";
        return { content: [{ type: "text", text: message }], isError: true };
      }
    }
  );
  return server;
}

const httpServer = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  // One line per request, so we can see if ChatGPT really calls us
  console.log(`${new Date().toISOString()} ${req.method} ${path} ${req.headers["user-agent"] ?? ""}`);

  if (path === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Outfit Weather MCP server is running. MCP endpoint: /mcp\n");
    return;
  }
  if (path !== "/mcp") {
    res.writeHead(404).end("Not found\n");
    return;
  }
  // Stateless servers only answer POST (no long-lived streams, no sessions)
  if (req.method !== "POST") {
    res.writeHead(405, { Allow: "POST" }).end("Method not allowed\n");
    return;
  }

  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500).end("Server error\n");
    }
  }
});

httpServer.listen(PORT, () => {
  console.log(`Outfit Weather MCP server: http://localhost:${PORT}/mcp`);
});
