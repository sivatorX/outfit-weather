// The MCP server: ChatGPT (or MCP Inspector) sends requests to /mcp,
// and we answer with the result of our tool.
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { fetchForecast, findCity, FriendlyError } from "./openMeteo.js";
import { buildAnswerText, buildHours, buildOutfit, pickDayHours, summarizeDay, targetDate } from "./weather.js";

const PORT = Number(process.env.PORT) || 3000;

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
    // Structured data for the card we will draw at step 4
    data: { place: placeName, day, date: targetDate(forecast.currentTime, day), summary, outfit },
  };
}

// A fresh MCP server per request: "stateless" mode, simple and safe for hosting.
function buildMcpServer() {
  const server = new McpServer({ name: "outfit-weather", version: "1.0.0" });

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
