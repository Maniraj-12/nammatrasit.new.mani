/** Connect full GTFS routing to the existing multi-turn chatbot.
 * Other intents (accessibility, fares, grievances, option selection) remain
 * handled by the existing conversational engine.
 */
import type { ChatReply, Context, CanonicalItinerary } from "./engine";
import { findFullStops, loadFullGtfs, lookupGtfsRoutes, planFullGtfs, type FullSearchMode } from "./full-gtfs";
import { filterRouteOptions } from "./route-options";
import { normalizeCommuterMessage, resolveStopName } from "./intent-recovery";
import { deduplicatePhysicalJourneys } from "./deduplicate-journeys";

function requestedMode(text: string): FullSearchMode {
  const t = text.toLowerCase();
  const hasBus = /\b(bus|buses|mtc)\b/.test(t);
  const hasMetro = /\b(metro|cmrl)\b/.test(t);
  const hasRail = /\b(train|suburban|railway|rail|emu)\b/.test(t);
  if (/\b(mixed|multi.modal|combined|intermodal)\b/.test(t) ||
    [hasBus, hasMetro, hasRail].filter(Boolean).length >= 2) return "Mixed";
  if (/\b(all|other modes|other options)\b/.test(t)) return "All";
  if (hasBus) return "Bus";
  if (hasRail) return "Suburban Rail";
  if (hasMetro) return "Metro";
  return "All";
}

function cleanStationLabel(label: string) {
  return label
    .replace(/^.*?\b(?:from|between)\s+/i, "")
    .replace(/^(?:how\s+do\s+i\s+(?:go|travel|get)|show|find|give|plan|route|journey|travel)\s+/i, "")
    .replace(/\s+\b(?:by|using|via)\s+(?:bus|metro|suburban|train|rail|mtc)\b.*$/i, "")
    .replace(/[?.!,]+$/g, "")
    .trim();
}

function endpoints(text: string, ctx: Context) {
  const pair = text.match(/(.+?)\s+\bto\b\s+(.+)/i);
  if (pair) {
    return {
      origin: cleanStationLabel(pair[1] ?? "") || ctx.origin,
      destination: cleanStationLabel(pair[2] ?? "") || ctx.destination,
      explicit: true,
    };
  }
  const changeOrigin = text.match(/\b(?:starting|start|depart|boarding)\s+(?:from|at)\s+(.+)/i);
  if (changeOrigin) {
    return { origin: cleanStationLabel(changeOrigin[1] ?? ""), destination: ctx.destination, explicit: true };
  }
  const changeDestination = text.match(/\b(?:destination|going to|heading to)\s+(.+)/i);
  if (changeDestination) {
    return { origin: ctx.origin, destination: cleanStationLabel(changeDestination[1] ?? ""), explicit: true };
  }
  return { origin: ctx.origin, destination: ctx.destination, explicit: false };
}

function selectUseful(routes: CanonicalItinerary[], limit = 6) {
  // Route IDs and stop-time variants are NOT separate choices if they use
  // the same corridor. Keep distinct bus numbers, modes and physical paths.
  const all = deduplicatePhysicalJourneys(routes);
  const picks: CanonicalItinerary[] = [];
  for (const mode of ["Metro", "Bus", "Suburban Rail", "Mixed"] as const) {
    const first = all.find((it) => it.mode === mode);
    if (first) picks.push(first);
  }
  for (const it of all) {
    if (picks.length >= limit) break;
    if (!picks.includes(it)) picks.push(it);
  }
  picks.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes);
  return picks.slice(0, limit).map((it, i) => ({
    ...it, optionIndex: i + 1, isFastest: picks.length > 1 && i === 0,
  }));
}

export async function respondFromFullGtfs(message: string, ctx: Context): Promise<ChatReply | null> {
  const normalized = normalizeCommuterMessage(message);
  const t = normalized.trim().toLowerCase();
  if (/\b(live tracking|track (?:my |the )?(?:bus|metro|train)|where is (?:my |the )?(?:bus|train|metro)|(?:bus|train|metro).*(?:arriv|eta|live)|next bus|next train)\b/.test(t)) {
    return {
      reply: "Live bus, Metro and suburban vehicle positions or arrival ETAs are not connected to this prototype. MTC provides passenger tracking at https://mtcbus.tn.gov.in/ and Chennai One offers passenger information. The journey cards below are static route estimates, not live tracking.",
      cards: [], suggestions: ["Show my route", "Show all options"],
      context: ctx, status: "OK", intent: "general",
    };
  }
  // Never intercept special conversational intents. Existing logic uses the
  // selected itinerary, so we must preserve it for follow-up fare questions.
  if (/\b(fare|how much|cost|price|ticket|cheapest|complaint|report|accessible|lift|alert|disruption|service update|where should i change|which is faster|which is fastest|select option|option \d|previous route|go back)\b/.test(t)) {
    return null;
  }

  let from = endpoints(normalized, ctx);
  const listing = /^\s*(?:list|show|find)\s+(?:all\s+)?(?:mtc\s+)?(?:bus|buses|metro|suburban|train|rail)\s*(?:routes|services)?\s*$/i.test(normalized);
  const routeNumber = normalized.match(/^\s*(?:find\s+)?(?:mtc\s+)?(?:bus\s+)?route\s+([a-z0-9\s]{1,12})\s*$/i);

  const travelIntent =
    from.explicit ||
    /\b(show|find|give|plan|travel|route|routes|options|bus|metro|suburban|train|mixed|compare)\b/.test(t);
  if (!travelIntent && !listing && !routeNumber && !ctx.pendingStopClarification) return null;

  const index = await loadFullGtfs();
  if (!index) return null;

  // Let commuters respond "1", "option 2", or the actual station name
  // after a clarification instead of repeating the complete journey.
  if (ctx.pendingStopClarification) {
    const pending = ctx.pendingStopClarification;
    const numbered = t.match(/^(?:option\s*)?([1-4])$/);
    const option = numbered
      ? pending.options[Number(numbered[1]) - 1]
      : pending.options.find((candidate) => candidate.toLowerCase() === t);
    if (option) {
      const origin = pending.kind === "origin" ? option : pending.origin;
      const destination = pending.kind === "destination" ? option : pending.destination;
      const modeSuffix = pending.mode === "All" ? "" : " by " + pending.mode;
      return respondFromFullGtfs(
        origin + " to " + destination + modeSuffix,
        { ...ctx, pendingStopClarification: undefined },
      );
    }
  }

  if (routeNumber) {
    const routeQuery = routeNumber[1]!.trim();
    const matches = lookupGtfsRoutes(index, routeQuery, "All", 12);
    return {
      reply: matches.length
        ? "ChennaiGTFS route records matching " + routeQuery + ":\n" +
          matches.map((r) => "• " + (r[1] || r[0]) + " — " + r[2] + " (" + r[3] + ")").join("\n") +
          "\nThese are static feed records; operating status has not been verified."
        : "No route numbered " + routeQuery + " was found in the available ChennaiGTFS feed.",
      cards: [], suggestions: ["Plan a journey", "Show all options"], context: ctx,
      status: matches.length ? "OK" : "NO_MATCH_IN_DATASET",
      intent: "general",
    };
  }

  if (listing && !from.origin && !from.destination) {
    const mode = requestedMode(normalized);
    const matches = index.data.routes.filter((r) => mode === "All" || r[3] === mode);
    const head = matches.slice(0, 12).map((r) => "• " + (r[1] || r[0]) + " — " + r[2]).join("\n");
    return {
      reply:
        "The full ChennaiGTFS index contains " + matches.length + " " + mode +
        " route records. Here are some examples:\n" + head +
        "\nAsk for an exact route number (for example, 'Route 70A') or give an origin and destination. This is not a live Chennai One service list.",
      cards: [], suggestions: ["Route 70A", "Guindy to Chennai Airport"], context: ctx,
      intent: "general", status: "OK",
    };
  }

  if (!from.origin || !from.destination) return null;
  for (const kind of ["origin", "destination"] as const) {
    const current = from[kind]!;
    const resolved = resolveStopName(index, current);
    if (resolved.kind === "exact") continue;
    if (resolved.kind === "corrected") {
      from = { ...from, [kind]: resolved.name };
      continue;
    }
    if (resolved.kind === "uncertain") {
      const other = from[kind === "origin" ? "destination" : "origin"]!;
      const display = resolved.options.map((name, i) => (i + 1) + ". " + name).join("\n");
      const suggestions = resolved.options.map((name) =>
        kind === "origin" ? name + " to " + other : other + " to " + name
      );
      return {
        reply: "I couldn't confidently match the " + kind + ' "' + current + '". Did you mean:\n' +
          display + "\nChoose a number or one of the suggestions.",
        cards: [], suggestions, intent: "route_search", status: "NO_MATCH_IN_DATASET",
        context: {
          ...ctx,
          pendingStopClarification: {
            kind, options: resolved.options, origin: from.origin!,
            destination: from.destination!, mode: requestedMode(normalized),
          },
        },
      };
    }
  }
  if (!findFullStops(index, from.origin).length || !findFullStops(index, from.destination).length) {
    // If there is no supported stop-name match, don't fabricate a route.
    if (!from.explicit) return null;
    return {
      reply: "I could not match one or both locations in the complete ChennaiGTFS stop catalogue. Please enter the GTFS stop or station name more precisely.",
      cards: [], context: ctx, suggestions: ["Guindy to Chennai Airport", "Tambaram to Chennai Beach"],
      intent: "route_search", status: "NO_MATCH_IN_DATASET",
    };
  }

  const mode = requestedMode(normalized);
  let routes: CanonicalItinerary[];
  if (mode === "All") {
    const candidates = [
      ...planFullGtfs(index, from.origin, from.destination, "All", 6),
      ...planFullGtfs(index, from.origin, from.destination, "Metro", 2),
      ...planFullGtfs(index, from.origin, from.destination, "Bus", 2),
      ...planFullGtfs(index, from.origin, from.destination, "Suburban Rail", 2),
      ...planFullGtfs(index, from.origin, from.destination, "Mixed", 2),
    ];
    routes = selectUseful(candidates, 6);
  } else {
    routes = selectUseful(planFullGtfs(index, from.origin, from.destination, mode, 6), 6);
    if (mode === "Mixed") routes = filterRouteOptions(routes, "Mixed");
  }
  if (!routes.length) {
    return {
      reply: "No " + mode + " journey could be constructed from " + from.origin + " to " + from.destination +
        " from the available GTFS stop sequences. That does not prove the service does not operate.",
      cards: [], suggestions: ["Show all options", "Try another station"], intent: "route_search",
      status: "NO_MATCH_IN_DATASET", requestedMode: mode,
      context: {
        ...ctx, origin: from.origin, destination: from.destination,
        availableItineraries: [], activeItineraryId: undefined, modePreference: mode,
      },
    };
  }
  const first = routes[0]!;
  return {
    reply:
      "I found " + routes.length + " " + mode +
      " journey option(s) using the complete ChennaiGTFS route-pattern index for " +
      from.origin + " to " + from.destination +
      ". Select a route below to see all stops and vehicle changes. Journey durations are approximate; current service times and fares are not verified.",
    cards: [
      ...(routes.length > 1 ? [{
        kind: "route_options" as const, options: routes,
        activeItineraryId: first.id, origin: from.origin,
        destination: from.destination, selectedFilter: mode,
      }] : []),
      { kind: "journey" as const, itinerary: first },
    ],
    suggestions: ["Show all options", "Show mixed routes", "Which is faster?", "Show the fare breakdown"],
    context: {
      ...ctx, origin: from.origin, destination: from.destination,
      pendingStopClarification: undefined,
      availableItineraries: routes, activeItineraryId: first.id,
      recommendedFastestId: routes.find((r) => r.isFastest)?.id,
      modePreference: mode,
    },
    origin: from.origin, destination: from.destination,
    requestedMode: mode, activeItineraryId: first.id,
    itineraries: routes, intent: "route_search", status: "OK",
  };
}
