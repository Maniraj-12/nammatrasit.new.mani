import { createFileRoute } from "@tanstack/react-router";
import { parseRealtimeQuery } from "@/lib/transit/realtime/contract";
import { configuredRealtimeAdapters, getRealtimeSnapshot } from "@/lib/transit/realtime/provider";

/** Read-only, same-origin, no-store endpoint for authorised live providers. */
export const Route = createFileRoute("/api/realtime")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const query = parseRealtimeQuery(new URL(request.url).searchParams);
        if (!query) {
          return Response.json(
            { error: "Valid mode, matching GTFS routeId and stopIds are required." },
            { status: 400, headers: { "Cache-Control": "no-store" } },
          );
        }
        const result = await getRealtimeSnapshot(query, configuredRealtimeAdapters());
        return Response.json(result, {
          headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        });
      },
    },
  },
});
