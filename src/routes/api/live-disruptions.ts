import { createFileRoute } from "@tanstack/react-router";
import { getOperatorAlertSnapshot } from "@/lib/transit/operator-alert-source.server";

/** Public, read-only status. No anonymous visitor can select the upstream URL. */
export const Route = createFileRoute("/api/live-disruptions")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const snapshot = await getOperatorAlertSnapshot();
          return Response.json(snapshot, {
            headers: {
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return Response.json({
            error: "Official notices could not be checked at this moment.",
          }, {status:503,headers:{"Cache-Control":"no-store"}});
        }
      },
    },
  },
});
