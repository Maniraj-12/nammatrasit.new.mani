import { respond, type ChatReply, type Context } from "./engine";
import { respondFromFullGtfs } from "./full-gtfs-chat";

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
  const fullGtfsReply = await respondFromFullGtfs(message, context);
  if (fullGtfsReply) return { reply: fullGtfsReply, transport: "local" };

  try {
    return { reply: await sendToServer(message, context), transport: "server" };
  } catch (error) {
    console.warn("Transit server request failed; switching to static local planner.", error);
    return { reply: respond(message, context), transport: "local" };
  }
}
