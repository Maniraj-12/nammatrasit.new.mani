import { respond, type ChatReply, type Context } from "./engine";
import { respondFromFullGtfs } from "./full-gtfs-chat";
import { normalizeCommuterMessage } from "./intent-recovery";
import { mergeTravellerContext } from "./judge-context";
import { isExplicitIncidentReport, isServiceUpdateRequest } from "./conversation-intents";

export type ChatTransport = "server" | "local";

export type ChatResult = {
  reply: ChatReply;
  transport: ChatTransport;
};

/**
 * Use the server-backed assistant when the host supports server functions.
 * Some applet previews only serve the UI, leaving the server-function POST
 * unreachable. Our curated transit planner is self-contained, so in that
 * case we can answer from bundled data rather than breaking every chat.
 *
 * Local mode is not a live transit API and must be visibly labelled.
 */
export async function requestTransitResponse(
  message: string,
  context: Context,
  sendToServer: (message: string, context: Context) => Promise<ChatReply>,
): Promise<ChatResult> {
  // Apply new user slots before calling either full GTFS or the fallback
  // responder, so every branch inherits sticky preferences across turns.
  const enriched = mergeTravellerContext(message, context);
  const normalizedMessage = normalizeCommuterMessage(message);
  // Pending multi-turn dialogue takes precedence over GTFS keywords. "Metro"
  // after "Which operator?" is an answer to the grievance, not a route query.
  // Process this locally so it remains reliable in AI Studio preview even if
  // the TanStack server function is unavailable.
  if (enriched.grievance || isServiceUpdateRequest(normalizedMessage) || isExplicitIncidentReport(normalizedMessage)) {
    // Explicit service alerts and active complaint questions must not be
    // intercepted by the GTFS route search, including AI Studio preview.
    return { reply: respond(normalizedMessage, enriched), transport: "local" };
  }
  const fullGtfsReply = await respondFromFullGtfs(normalizedMessage, enriched);
  if (fullGtfsReply) return { reply: fullGtfsReply, transport: "local" };

  try {
    return { reply: await sendToServer(normalizedMessage, enriched), transport: "server" };
  } catch (error) {
    console.warn("Transit server request failed; switching to static local planner.", error);
    return { reply: respond(normalizedMessage, enriched), transport: "local" };
  }
}
