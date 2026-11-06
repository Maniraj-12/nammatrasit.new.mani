import { respond, type ChatReply, type Context } from "./engine";
import { respondFromFullGtfs } from "./full-gtfs-chat";
import { normalizeCommuterMessage } from "./intent-recovery";
import { mergeTravellerContext } from "./judge-context";
import { isServiceUpdateRequest } from "./conversation-intents";
import { handleJourneyDialogue } from "./journey-dialogue";

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
  if (enriched.grievance || isServiceUpdateRequest(normalizedMessage) ||
      /\b(?:report (?:a |an |another )?(?:problem|issue)|file (?:a )?complaint|grievance|complaint)\b/i.test(normalizedMessage)) {
    // A service update request is not a GTFS journey query. Resolve it locally
    // in preview mode so the returned card is always an alert, never a route.
    return { reply: respond(normalizedMessage, enriched), transport: "local" };
  }
  // Explicitly starting a new journey must NOT reuse saved origins and
  // destinations. Fill missing slots in the current chat, then route only
  // when both new endpoints have been provided (works without server APIs).
  const dialogue = handleJourneyDialogue(normalizedMessage, enriched);
  if (dialogue?.kind === "prompt") {
    return { reply: dialogue.reply, transport: "local" };
  }
  if (dialogue?.kind === "complete") {
    const route = await respondFromFullGtfs(dialogue.query, dialogue.context);
    return {
      reply: route ?? respond(dialogue.query, dialogue.context),
      transport: "local",
    };
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
