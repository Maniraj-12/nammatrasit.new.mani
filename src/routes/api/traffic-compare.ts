import { createFileRoute } from "@tanstack/react-router";

/**
 * The live-traffic feature is retired from the hackathon demo.
 * Fail closed before loading any provider modules or reading secret keys.
 * The dormant adapter modules remain for a future explicitly approved
 * integration, but this public endpoint makes zero external API calls.
 */
export const Route = createFileRoute("/api/traffic-compare")({
  server: {
    handlers: {
      POST: async () => Response.json(
        { status: "UNAVAILABLE", error: "Live road traffic comparison is disabled in NammaTransit AI." },
        { status: 410, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
      ),
    },
  },
});
