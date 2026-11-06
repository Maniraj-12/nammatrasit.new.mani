import { describe, expect, it, vi } from "vitest";
import { requestTransitResponse } from "./chat-client";
import { handleJourneyDialogue, isNewJourneyRequest, parseJourneyLocations } from "./journey-dialogue";
import type { Context } from "./engine";

const oldJourney: Context = {
  origin: "Koyambedu", destination: "Guindy",
  passengers: 2, concessionType: "senior", concessionPassengers: 1,
  wheelchairRequired: true, preferredLanguage: "tanglish",
  activeItineraryId: "previous-trip", selectedFilter: "Bus",
  recommendedFastestId: "previous-trip", modePreference: "Bus",
  availableItineraries: [], arrivalBy: "10:00 AM",
};
const noServer = vi.fn(async () => { throw new Error("No Google AI Studio server"); });

describe("Conversational new-journey slot filling", () => {
  it.each([
    "Plan another journey", "plan a journey", "Plan a new trip",
    "Please plan another route", "I need a new journey",
    "Let's plan a journey", "i want to go somewhere else",
  ])("recognises '%s' as a request requiring NEW locations", (message) => {
    expect(isNewJourneyRequest(message)).toBe(true);
  });

  it.each([
    "Which is faster?", "Show all options", "Show another option",
    "Report a problem", "Show service updates", "What is the fare?",
    "From Koyambedu to Guindy", "Bus routes", "Cancel complaint",
  ])("does not reset journey for '%s'", (message) => {
    expect(isNewJourneyRequest(message)).toBe(false);
  });

  it.each([
    ["from Guindy", { origin: "Guindy" }],
    ["Starting from Tambaram", { origin: "Tambaram" }],
    ["My starting point is Tambaram", { origin: "Tambaram" }],
    ["I'm at Guindy", { origin: "Guindy" }],
    ["to Chennai Airport", { destination: "Chennai Airport" }],
    ["My destination is Guindy", { destination: "Guindy" }],
    ["from Tambaram to Chennai Beach", { origin: "Tambaram", destination: "Chennai Beach" }],
    ["Ramapuram to Tidel Park", { origin: "Ramapuram", destination: "Tidel Park" }],
  ] as const)("extracts new locations from '%s'", (text, locations) => {
    expect(parseJourneyLocations(text)).toEqual(locations);
  });

  it.each(["place", "metro", "from", "to", "don't know", "where", "by Metro", "I want a ticket"])(
    "does not silently accept '%s' as a station name",
    (text) => {
      expect(parseJourneyLocations(text, "origin").origin).toBeUndefined();
    },
  );

  it("asks the starting point, clears old route and preserves traveller details", async () => {
    noServer.mockClear();
    const result = await requestTransitResponse("Plan another journey", oldJourney, noServer);
    expect(result.transport).toBe("local");
    expect(noServer).not.toHaveBeenCalled();
    expect(result.reply.cards).toEqual([]);
    expect(result.reply.reply).toMatch(/where will you be starting/i);
    const ctx = result.reply.context;
    expect(ctx.origin).toBeUndefined();
    expect(ctx.destination).toBeUndefined();
    expect(ctx.activeItineraryId).toBeUndefined();
    expect(ctx.availableItineraries).toEqual([]);
    expect(ctx.pendingJourney).toEqual({});
    expect(ctx.passengers).toBe(2);
    expect(ctx.concessionType).toBe("senior");
    expect(ctx.wheelchairRequired).toBe(true);
    expect(ctx.preferredLanguage).toBe("tanglish");
    expect(ctx.arrivalBy).toBeUndefined(); // Time for old trip must not carry into a new journey.
  });

  it("asks destination after a plain place name, and routes only after both are provided", async () => {
    noServer.mockClear();
    const started = await requestTransitResponse("Plan another journey", oldJourney, noServer);
    const from = await requestTransitResponse("Tambaram", started.reply.context, noServer);
    expect(from.reply.cards).toEqual([]);
    expect(from.reply.reply).toMatch(/where would you like to travel to/i);
    expect(from.reply.context.pendingJourney?.origin).toBe("Tambaram");
    expect(from.reply.context.pendingJourney?.destination).toBeUndefined();
    const route = await requestTransitResponse("Chennai Beach", from.reply.context, noServer);
    expect(route.reply.context.origin).toBe("Tambaram");
    expect(route.reply.context.destination).toBe("Chennai Beach");
    expect(route.reply.context.pendingJourney).toBeUndefined();
    expect(route.reply.cards.some(x => x.kind === "route_options")).toBe(true);
    expect(noServer).not.toHaveBeenCalled();
  });

  it("accepts destination first and asks only for missing origin", async () => {
    const start = await requestTransitResponse("Plan another journey to Chennai Airport", oldJourney, noServer);
    expect(start.reply.cards).toEqual([]);
    expect(start.reply.reply).toMatch(/where will you start from/i);
    expect(start.reply.context.pendingJourney).toEqual({ origin: undefined, destination: "Chennai Airport" });
    const completed = await requestTransitResponse("from Guindy", start.reply.context, noServer);
    expect(completed.reply.context.origin).toBe("Guindy");
    expect(completed.reply.context.destination).toBe("Chennai Airport");
    expect(completed.reply.cards.some(x => x.kind === "route_options")).toBe(true);
  });

  it("handles both locations in a new-journey request without asking redundant questions", async () => {
    const result = await requestTransitResponse("Plan another journey from Guindy to Chennai Airport", oldJourney, noServer);
    expect(result.reply.context.pendingJourney).toBeUndefined();
    expect(result.reply.context.origin).toBe("Guindy");
    expect(result.reply.context.destination).toBe("Chennai Airport");
    expect(result.reply.cards.some(x => x.kind === "route_options")).toBe(true);
  });

  it("supports a Tanglish follow-up while gathering stops", async () => {
    const first = await requestTransitResponse("Plan another journey", oldJourney, noServer);
    const next = await requestTransitResponse("Ramapuram lendhu Tidel Park by 10 AM", first.reply.context, noServer);
    expect(next.reply.context.pendingJourney).toBeUndefined();
    expect(next.reply.context.origin).toBe("Ramapuram");
    expect(next.reply.context.destination).toBe("Tidel Park");
    expect(next.reply.context.arrivalBy).toBe("10:00 AM");
    // GTFS routes appear if full data is available. If only the tiny curated
    // fallback is loaded, it must NOT invent a different destination.
    if (next.reply.cards.some(x => x.kind === "route_options")) {
      expect(next.reply.context.destination).toBe("Tidel Park");
    } else {
      expect(next.reply.status).toBe("NO_MATCH_IN_DATASET");
      expect(next.reply.reply).toMatch(/full ChennaiGTFS route data is unavailable/i);
    }
  });

  it("does not assume 'metro' is a location and allows correcting previous origin", async () => {
    const began = await requestTransitResponse("Plan another journey", oldJourney, noServer);
    const wrong = await requestTransitResponse("Metro", began.reply.context, noServer);
    expect(wrong.reply.cards).toEqual([]);
    expect(wrong.reply.context.pendingJourney?.origin).toBeUndefined();
    const location = await requestTransitResponse("from Guindy", wrong.reply.context, noServer);
    const correction = await requestTransitResponse("from Tambaram", location.reply.context, noServer);
    expect(correction.reply.context.pendingJourney?.origin).toBe("Tambaram");
    expect(correction.reply.context.pendingJourney?.destination).toBeUndefined();
  });

  it("preserves a pending new journey through service updates", async () => {
    const first = await requestTransitResponse("Plan another journey", oldJourney, noServer);
    const alerts = await requestTransitResponse("Show service updates", first.reply.context, noServer);
    expect(alerts.reply.cards[0]?.kind).toBe("alerts");
    expect(alerts.reply.context.pendingJourney).toEqual({});
    const from = await requestTransitResponse("Tambaram", alerts.reply.context, noServer);
    expect(from.reply.context.pendingJourney?.origin).toBe("Tambaram");
  });

  it("preserves wheelchair/passenger details given between the locations", async () => {
    const started = await requestTransitResponse("Plan a journey", {}, noServer);
    const updated = await requestTransitResponse("2 passengers with wheelchair", started.reply.context, noServer);
    expect(updated.reply.context.pendingJourney).toEqual({});
    expect(updated.reply.context.passengers).toBe(2);
    expect(updated.reply.context.wheelchairRequired).toBe(true);
    expect(updated.reply.cards).toEqual([]);
    const from = await requestTransitResponse("from Guindy", updated.reply.context, noServer);
    expect(from.reply.context.pendingJourney?.origin).toBe("Guindy");
  });

  it("avoids planning from a location to itself", async () => {
    const started = await requestTransitResponse("Plan another journey", oldJourney, noServer);
    const from = await requestTransitResponse("Guindy", started.reply.context, noServer);
    const same = await requestTransitResponse("to Guindy", from.reply.context, noServer);
    expect(same.reply.cards).toEqual([]);
    expect(same.reply.context.pendingJourney?.origin).toBe("Guindy");
    expect(same.reply.context.pendingJourney?.destination).toBeUndefined();
  });

  it("does not interpret cancel as the new station", async () => {
    const started = await requestTransitResponse("Plan another journey", oldJourney, noServer);
    const cancelled = await requestTransitResponse("Cancel journey", started.reply.context, noServer);
    expect(cancelled.reply.cards).toEqual([]);
    expect(cancelled.reply.context.pendingJourney).toBeUndefined();
    expect(cancelled.reply.context.origin).toBeUndefined();
    expect(cancelled.reply.reply).toMatch(/cancelled/i);
  });

  it("does not hijack the grievance workflow if complaint starts mid journey", async () => {
    const started = await requestTransitResponse("Plan another journey", oldJourney, noServer);
    const complaint = await requestTransitResponse("Report a problem", started.reply.context, noServer);
    expect(complaint.reply.context.grievance).toBeDefined();
    expect(complaint.reply.context.pendingJourney).toEqual({});
    expect(complaint.reply.cards).toEqual([]);
    const operator = await requestTransitResponse("Metro", complaint.reply.context, noServer);
    expect(operator.reply.context.grievance?.step).toBe("location");
    expect(operator.reply.cards.some(x => x.kind === "route_options")).toBe(false);
  });

  it("leaves existing route comparison and fare questions to their usual handlers", async () => {
    expect(handleJourneyDialogue("Which is faster?", oldJourney)).toBeNull();
    expect(handleJourneyDialogue("What is the fare?", oldJourney)).toBeNull();
    expect(handleJourneyDialogue("Show service updates", oldJourney)).toBeNull();
  });
});
