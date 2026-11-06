/**
 * Local, deterministic slot-filling dialogue for *new* journeys.
 * Never silently reuse the previous journey when the user says
 * "Plan another journey". Preserve traveller preferences across journeys,
 * but clear stale stops, GTFS options, selected routes and clarification state.
 * Runs before GTFS discovery and unavailable AI Studio server functions.
 */
import type { ChatReply, Context } from "./engine";

export type PendingJourney = { origin?: string; destination?: string };

export type JourneyDialogueOutcome =
  | { kind: "prompt"; reply: ChatReply }
  | { kind: "complete"; origin: string; destination: string; context: Context; query: string }
  | null;

const newJourneyPattern =
  /^(?:please\s+)?(?:(?:can|could)\s+you\s+)?(?:(?:help\s+me\s+|i\s+(?:want|need)\s+to\s+))?(?:plan|start|make|find)\s+(?:me\s+)?(?:(?:a|an)\s+)?(?:(?:another|new|different|next)\s+)?(?:journey|trip|route)\b/i;
const newJourneyAlternative =
  /^(?:i\s+(?:need|want)\s+(?:a\s+)?(?:new|another|different)\s+(?:journey|trip|route)|(?:let'?s|let\s+us)\s+(?:plan|start)\s+(?:a\s+|another\s+|new\s+)?(?:journey|trip)|i\s+want\s+to\s+go\s+somewhere\s+else)\b/i;

export function isNewJourneyRequest(text: string): boolean {
  return newJourneyPattern.test(text.trim()) || newJourneyAlternative.test(text.trim());
}

const refuseAsStop =
  /^(?:yes|no|ok|okay|sure|hello|hi|hey|none|nothing|not sure|don't know|dont know|unknown|skip|place|location|station|stop|here|there|anywhere|metro|bus|train|suburban|all|somewhere|another journey)$/i;
const nonLocationQuestion =
  /^(?:can you|could you|show|check|report|tell me|compare|how|what|when|why|which|does|are|is|book|ticket|fare|price|cost|cancel)\b/i;

function cleanedLocation(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const location = value
    .trim().replace(/^(?:at|in)\s+/i, "")
    .replace(/\s+(?:by|using|via)\s+(?:metro|bus|mtc|train|suburban(?: rail)?)\b.*$/i, "")
    .replace(/\s+(?:before|by)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b.*$/i, "")
    .replace(/[.?!,;:]+$/g, "").trim();
  if (location.length < 3 || location.length > 90 || refuseAsStop.test(location) ||
      nonLocationQuestion.test(location)) return undefined;
  return location;
}

/** Accept free-text station names, from/to phrases and one-message pairs. */
export function parseJourneyLocations(message: string, waitingFor?: "origin" | "destination"): PendingJourney {
  const text = message.trim().replace(/[?!,;]+$/g, "");
  // "Plan another journey from Tambaram to Chennai Airport" and the Tanglish
  // normalised form "Ramapuram to Tidel Park" both work.
  const paired = text.match(/\bfrom\s+(.+?)\s+\bto\b\s+(.+)$/i) ??
    text.match(/^(.+?)\s+\bto\b\s+(.+)$/i);
  if (paired) {
    const origin = cleanedLocation(paired[1]);
    const destination = cleanedLocation(paired[2]);
    if (origin && destination) return { origin, destination };
  }
  const from = text.match(/\b(?:from|starting\s+from|leaving\s+from|departing\s+from|origin\s+(?:is|:)|start\s+(?:is|at))\s+(.+)$/i);
  const destination = text.match(/\b(?:to|going\s+to|heading\s+to|destination\s+(?:is|:))\s+(.+)$/i);
  if (from) return { origin: cleanedLocation(from[1]) };
  if (destination) return { destination: cleanedLocation(destination[1]) };
  if (waitingFor) {
    // A short place name on its own answers the previously asked field,
    // not an instruction to search the old journey.
    const location = cleanedLocation(text);
    if (location) return { [waitingFor]: location };
  }
  return {};
}

function resetRoute(ctx: Context): Context {
  return {
    ...ctx,
    origin: undefined, destination: undefined,
    originId: undefined, destinationId: undefined,
    modePreference: undefined, requestedMode: undefined,
    activeItineraryId: undefined, lastReferencedItineraryId: undefined,
    recommendedFastestId: undefined, selectedFilter: undefined,
    availableItineraries: [], pendingStopClarification: undefined,
    activeDisruption: undefined,
    lastStation: undefined,
  };
}

function prompt(ctx: Context, slots: PendingJourney): JourneyDialogueOutcome {
  const origin = slots.origin;
  const destination = slots.destination;
  const question = origin
    ? "Starting from **" + origin + "**. Where would you like to travel to?"
    : destination
      ? "Got it — your destination is **" + destination + "**. Where will you start from?"
      : "Sure! Where will you be starting your new journey? You can type a stop or station, such as **Tambaram**.";
  const suggestions = origin
    ? ["To Chennai Airport", "To Guindy", "To Chennai Central", "To Tambaram"]
    : ["From Tambaram", "From Guindy", "From Koyambedu", "From Chennai Central"];
  return {
    kind: "prompt",
    reply: {
      reply: question, cards: [], suggestions,
      intent: "route_search",
      context: {
        ...ctx, origin, destination, availableItineraries: [],
        pendingJourney: { origin, destination },
      },
    },
  };
}

/**
 * Return null for unrelated conversation branches: grievance, service updates,
 * ordinary fare followups, existing-route comparison etc.
 */
export function handleJourneyDialogue(message: string, ctx: Context): JourneyDialogueOutcome {
  const t = message.trim();
  const starting = isNewJourneyRequest(t);
  const pending = ctx.pendingJourney;

  if (!starting && !pending) {
    // First journey from scratch: "I want to plan a journey" is handled
    // above. Incomplete messages "from Guindy" also need the missing slot.
    if (ctx.origin || ctx.destination ||
        !/^(?:(?:i\s+(?:am|will\s+be)\s+)?(?:from|to)\s+|(?:starting|leaving)\s+from\s+|destination\s+(?:is|:)\s+)/i.test(t)) {
      return null;
    }
  }

  if (pending && /^(?:cancel(?:\s+(?:the|this|my))?\s+(?:journey|trip|route|planning)|never\s?mind|stop planning)$/i.test(t)) {
    return {
      kind: "prompt",
      reply: {
        reply: "Okay, I've cancelled the new journey request. What would you like help with?",
        cards: [], suggestions: ["Plan a journey", "Show service updates", "Report a problem"],
        intent: "general",
        context: { ...resetRoute(ctx), pendingJourney: undefined },
      },
    };
  }

  // A new request overrides any old half-completed new-journey dialogue.
  const base = starting ? resetRoute(ctx) : ctx;
  const carried: PendingJourney = starting ? {} : { ...pending };
  const unprefixed = starting
    ? t.replace(newJourneyPattern,"").replace(newJourneyAlternative,"").trim()
    : t;
  const awaiting: "origin" | "destination" = carried.origin ? "destination" : "origin";
  const inputs = parseJourneyLocations(unprefixed, awaiting);
  const slots: PendingJourney = { ...carried, ...inputs };

  if (!slots.origin || !slots.destination) return prompt(base, slots);

  // Do not issue a fictitious journey from a place to itself.
  if (slots.origin.trim().toLowerCase() === slots.destination.trim().toLowerCase()) {
    return prompt(base, { origin: slots.origin });
  }
  const nextContext: Context = {
    ...base, origin: slots.origin, destination: slots.destination,
    pendingJourney: undefined,
    pendingStopClarification: undefined,
  };
  return {
    kind: "complete", origin: slots.origin, destination: slots.destination,
    context: nextContext,
    query: slots.origin + " to " + slots.destination,
  };
}
