import { describe, it, expect } from "vitest";
import {
  respond,
  planAllItineraries,
  planMetroItinerary,
  planSuburbanItinerary,
  planBusItinerary,
  planMixedModeItineraries,
  detectRequestedMode,
} from "./engine";

describe("TASK 1 — Intent and Mode Detection", () => {
  it("recognises all specified bus intent phrases", () => {
    expect(detectRequestedMode("Is there a bus route?")).toBe("Bus");
    expect(detectRequestedMode("Show me buses")).toBe("Bus");
    expect(detectRequestedMode("Any MTC bus available?")).toBe("Bus");
    expect(detectRequestedMode("I want to travel by bus")).toBe("Bus");
    expect(detectRequestedMode("Is there a bus?")).toBe("Bus");
  });

  it("recognises train / suburban railway intent phrases", () => {
    expect(detectRequestedMode("Is there a train?")).toBe("Suburban Rail");
    expect(detectRequestedMode("Show me the train route")).toBe("Suburban Rail");
    expect(detectRequestedMode("Show train routes")).toBe("Suburban Rail");
    expect(detectRequestedMode("Show suburban train")).toBe("Suburban Rail");
  });

  it("recognises metro intent phrases", () => {
    expect(detectRequestedMode("Show Metro")).toBe("Metro");
    expect(detectRequestedMode("What about Metro?")).toBe("Metro");
    expect(detectRequestedMode("Is there a metro?")).toBe("Metro");
  });

  it("recognises mixed-mode / multimodal intent phrases", () => {
    expect(detectRequestedMode("Show mixed routes")).toBe("Mixed");
    expect(detectRequestedMode("mixed mode")).toBe("Mixed");
    expect(detectRequestedMode("multimodal options")).toBe("Mixed");
    expect(detectRequestedMode("Show mixed")).toBe("Mixed");
  });

  it("recognises all / other options intent phrases", () => {
    expect(detectRequestedMode("Show all options")).toBe("All");
    expect(detectRequestedMode("Show other transport options")).toBe("All");
    expect(detectRequestedMode("Are there any other modes?")).toBe("All");
  });
});

describe("TASK 12 — 15 Mandatory Automated Vitest Scenarios", () => {
  // Test 1: Metro-only journey
  it("Scenario 1: plans a valid Metro-only journey", () => {
    const it = planMetroItinerary("Chennai Central", "Chennai Airport");
    expect(it).not.toBeNull();
    expect(it?.mode).toBe("Metro");
    expect(it?.legs.every((l) => l.mode === "Metro")).toBe(true);
    expect(it?.fare.fareSource).toContain("CMRL");
    expect(it?.fare.totalFare).toBeGreaterThan(0);
    expect(it?.inVehicleMinutes).toBeGreaterThan(0);
    expect(it?.totalDurationMinutes).toBeGreaterThan(it?.inVehicleMinutes ?? 0);
  });

  // Test 2: MTC bus-only journey
  it("Scenario 2: plans a valid MTC bus-only journey", () => {
    const it = planBusItinerary("Koyambedu", "Guindy");
    expect(it).not.toBeNull();
    expect(it?.mode).toBe("Bus");
    expect(it?.legs.every((l) => l.mode === "Bus")).toBe(true);
    expect(it?.legs[0]?.routeId).toMatch(/^MTC-/);
    expect(it?.fare.totalFare).toBeGreaterThan(0);
  });

  // Test 3: Suburban rail-only journey
  it("Scenario 3: plans a valid Suburban rail-only journey", () => {
    const it = planSuburbanItinerary("Guindy", "Chennai Beach");
    expect(it).not.toBeNull();
    expect(it?.mode).toBe("Suburban Rail");
    expect(it?.legs.every((l) => l.mode === "Suburban Rail")).toBe(true);
    expect(it?.fare.totalFare).toBe(10); // Official second class suburban tariff for 9 stations
    expect(it?.totalStops).toBe(9);
  });

  // Test 4: Valid bus + Metro journey (e.g. Anna Nagar Tower to Airport via Vadapalani)
  it("Scenario 4: plans a valid bus + Metro mixed-mode journey", () => {
    const mixed = planMixedModeItineraries("Anna Nagar Tower", "Chennai Airport");
    expect(mixed.length).toBeGreaterThan(0);
    const busMetro = mixed.find(
      (m) =>
        m.modesInvolved?.includes("Bus") &&
        m.modesInvolved?.includes("Metro") &&
        m.transferPoints.length > 0,
    );
    expect(busMetro).toBeDefined();
    expect(busMetro?.mode).toBe("Mixed");
    expect(busMetro?.transferMinutes).toBeGreaterThan(0);
    expect(busMetro?.legs.some((l) => l.mode === "Bus")).toBe(true);
    expect(busMetro?.legs.some((l) => l.mode === "Metro")).toBe(true);
    // Canonical fare is sum of components
    const sumComponents = busMetro!.fare.components.reduce((acc, c) => acc + c.amount, 0);
    expect(busMetro!.fare.totalFare).toBe(sumComponents);
  });

  // Test 5: Valid Metro + suburban rail journey (e.g. Koyambedu to Chennai Beach via Central/Park)
  it("Scenario 5: plans a valid Metro + suburban rail journey via Central/Park interchange", () => {
    const mixed = planMixedModeItineraries("Koyambedu", "Chennai Beach");
    expect(mixed.length).toBeGreaterThan(0);
    const metroRail = mixed.find(
      (m) => m.modesInvolved?.includes("Metro") && m.modesInvolved?.includes("Suburban Rail"),
    );
    expect(metroRail).toBeDefined();
    expect(metroRail?.transferPoints).toContain("Chennai Central");
    expect(metroRail?.legs[0]?.mode).toBe("Metro");
    expect(metroRail?.legs[1]?.mode).toBe("Suburban Rail");
    // Verify pedestrian subway transfer
    expect(metroRail?.transferMinutes).toBe(3); // 220m subway corridor
    expect(metroRail?.fare.totalFare).toBe(45); // Metro ₹40 + Suburban ₹5
  });

  // Test 6: Switching between two available journey options
  it("Scenario 6: switches between two available journey options and preserves state", () => {
    const t1 = respond("How do I travel from Koyambedu to Guindy?");
    expect(t1.context.availableItineraries?.length).toBeGreaterThanOrEqual(2);
    const opt1 = t1.context.availableItineraries![0]!;
    const opt2 = t1.context.availableItineraries![1]!;

    expect(t1.context.activeItineraryId).toBe(opt1.id);

    // Switch to option 2
    const t2 = respond("Select Option 2", t1.context);
    expect(t2.context.activeItineraryId).toBe(opt2.id);
    expect(t2.context.lastReferencedItineraryId).toBe(opt1.id);
    expect(t2.context.origin).toBe("Koyambedu");
    expect(t2.context.destination).toBe("Guindy");
  });

  // Test 7: Selecting an option using chat commands ("Select Option 2")
  it("Scenario 7: selects an option using chat commands ('Select Option 2')", () => {
    const t1 = respond("How do I travel from Anna Nagar Tower to Chennai Airport?");
    expect(t1.context.availableItineraries?.length).toBeGreaterThanOrEqual(2);

    const t2 = respond("Select Option 2", t1.context);
    expect(t2.reply).toContain("Selected **Option 2");
    expect(t2.cards.some((c) => c.kind === "journey")).toBe(true);
    expect(t2.cards.some((c) => c.kind === "route_options")).toBe(true);
  });

  // Test 8: Filtering to mixed-mode routes ("Show mixed routes")
  it("Scenario 8: filters to mixed-mode routes ('Show mixed routes')", () => {
    const t1 = respond("How do I travel from Anna Nagar Tower to Chennai Airport?");
    const t2 = respond("Show mixed routes", t1.context);

    expect(t2.status).toBe("OK");
    expect(t2.requestedMode).toBe("Mixed");
    expect(t2.itineraries?.length).toBeGreaterThan(0);
    expect(t2.itineraries?.every((it) => it.mode === "Mixed")).toBe(true);
    expect(t2.cards.length).toBeGreaterThan(0);
  });

  // Test 9: Filtering to bus-only routes ("Is there a bus route?")
  it("Scenario 9: filters to bus-only routes strictly without returning railway or metro cards", () => {
    // Guindy to Chennai Beach has NO bus in the dataset
    const t1 = respond("How do I travel from Guindy to Chennai Beach?");
    const t2 = respond("Is there a bus route?", t1.context);

    expect(t2.status).toBe("NO_MATCH_IN_DATASET");
    expect(t2.requestedMode).toBe("Bus");
    expect(t2.cards.length).toBe(0); // STRICT: NO cards leaked!
    expect(t2.reply).toContain("No matching MTC bus journey was found");

    // But Koyambedu to Guindy DOES have bus route
    const t3 = respond("Is there a bus route from Koyambedu to Guindy?");
    expect(t3.status).toBe("OK");
    expect(t3.requestedMode).toBe("Bus");
    expect(t3.cards.length).toBe(1);
    if (t3.cards[0]!.kind === "journey") {
      expect(t3.cards[0]!.itinerary.mode).toBe("Bus");
    }
  });

  // Test 10: Asking which route is fastest ("Which one is fastest?")
  it("Scenario 10: asks which route is fastest and highlights the fastest option", () => {
    const t1 = respond("How do I travel from Koyambedu to Guindy?");
    const t2 = respond("Which one is fastest?", t1.context);

    expect(t2.status).toBe("OK");
    expect(t2.intent).toBe("comparison");
    expect(t2.reply).toContain("fastest option");
    expect(t2.activeItineraryId).toBe(t2.recommendedFastestId);
    if (t2.cards[1]?.kind === "journey") {
      expect(t2.cards[1].itinerary.isFastest).toBe(true);
    }
  });

  // Test 11: Asking the fare of the currently selected route ("How much will that cost?")
  it("Scenario 11: asks the fare of currently selected route and returns canonical fare", () => {
    const t1 = respond("How do I travel from Koyambedu to Guindy?");
    const activeIt = t1.context.availableItineraries?.find(
      (it) => it.id === t1.context.activeItineraryId,
    );
    expect(activeIt).toBeDefined();

    const t2 = respond("How much will that cost?", t1.context);
    expect(t2.reply).toContain(`₹${activeIt!.fare.totalFare}`);
    expect(t2.cards[0]?.kind).toBe("fare_breakdown");
    if (t2.cards[0]?.kind === "fare_breakdown") {
      expect(t2.cards[0].itinerary.fare.totalFare).toBe(activeIt!.fare.totalFare);
    }
  });

  // Test 12: Changing starting location while preserving destination ("What about starting from Koyambedu?")
  it("Scenario 12: changes starting location while preserving destination", () => {
    const t1 = respond("How do I travel from Guindy to Chennai Beach?");
    expect(t1.context.origin).toBe("Guindy");
    expect(t1.context.destination).toBe("Chennai Beach");

    // Change origin only
    const t2 = respond("What about starting from Koyambedu?", t1.context);
    expect(t2.context.origin).toBe("Koyambedu");
    expect(t2.context.destination).toBe("Chennai Beach"); // PRESERVED!
    expect(t2.context.availableItineraries?.length).toBeGreaterThan(0);
    expect(t2.context.availableItineraries![0]!.destination).toBe("Chennai Beach");
  });

  // Test 13: Evaluate available mixed-mode candidates, without hardcoding this
  // city pair as unavailable merely because a direct railway option also exists.
  it("Scenario 13: only returns composed mixed routes with complete leg data", () => {
    const t1 = respond("How do I travel from Guindy to Chennai Beach?");
    const t2 = respond("Show mixed routes", t1.context);

    const mixed = planMixedModeItineraries("Guindy", "Chennai Beach");
    if (mixed.length === 0) {
      expect(t2.status).toBe("NO_MATCH_IN_DATASET");
      expect(t2.cards).toHaveLength(0);
    } else {
      expect(t2.status).toBe("OK");
      expect(t2.itineraries?.length).toBeGreaterThan(0);
      for (const journey of mixed) {
        expect(journey.mode).toBe("Mixed");
        expect(new Set(journey.legs.map((leg) => leg.mode)).size).toBeGreaterThan(1);
        expect(journey.legs[0]!.from).toBe("Guindy");
        expect(journey.legs[journey.legs.length - 1]!.to).toBe("Chennai Beach");
        expect(journey.transferCount).toBe(journey.legs.length - 1);
        expect(journey.totalDurationMinutes).toBe(
          journey.inVehicleMinutes + journey.walkingMinutes + journey.waitingMinutes,
        );
      }
    }
  });

  // Test 14: Preventing duplicate route cards
  it("Scenario 14: prevents duplicate route cards in planAllItineraries", () => {
    const itineraries = planAllItineraries("Anna Nagar Tower", "Chennai Airport");
    expect(itineraries.length).toBeGreaterThan(0);
    expect(itineraries.length).toBeLessThanOrEqual(5);

    // Ensure all IDs are unique
    const ids = itineraries.map((it) => it.id);
    const uniqueIds = Array.from(new Set(ids));
    expect(ids.length).toBe(uniqueIds.length);
  });

  // Test 15: Returning to previously available route options ("Show me the previous option")
  it("Scenario 15: returns to previously selected route option ('Show me the previous option')", () => {
    const t1 = respond("How do I travel from Anna Nagar Tower to Chennai Airport?");
    const opt1Id = t1.context.availableItineraries![0]!.id;
    const opt2Id = t1.context.availableItineraries![1]!.id;

    // Switch to option 2
    const t2 = respond("Select Option 2", t1.context);
    expect(t2.context.activeItineraryId).toBe(opt2Id);
    expect(t2.context.lastReferencedItineraryId).toBe(opt1Id);

    // Return to previous option
    const t3 = respond("Show me the previous option", t2.context);
    expect(t3.context.activeItineraryId).toBe(opt1Id);
    expect(t3.reply).toContain("Returned to previous option");
  });
});

describe("Original Regression Scenarios — Guindy to Chennai Beach Conversation Flow", () => {
  it("guarantees full bug fix for Guindy -> Chennai Beach and strict mode transitions", () => {
    const t1 = respond("How do I travel from Guindy to Chennai Beach?");
    expect(t1.context.origin).toBe("Guindy");
    expect(t1.context.destination).toBe("Chennai Beach");

    const t2 = respond("Is there a bus route?", t1.context);
    expect(t2.status).toBe("NO_MATCH_IN_DATASET");
    expect(t2.cards.length).toBe(0);
    expect(t2.reply).toContain("No matching MTC bus journey was found");

    const t3 = respond("Show me the train route", t2.context);
    expect(t3.status).toBe("OK");
    expect(t3.cards.length).toBe(1);
    expect(t3.context.modePreference).toBe("Suburban Rail");

    const t4 = respond("Show all options", t3.context);
    expect(t4.context.modePreference).toBe("All");
    expect(t4.cards.length).toBeGreaterThanOrEqual(1);
  });
});


describe("Estimated fare labeling regression", () => {
  it("labels MTC stop-count fare estimates as unverified", () => {
    const bus = planBusItinerary("Koyambedu", "Guindy");
    expect(bus).not.toBeNull();
    expect(bus?.fare.fareDataStatus).toBe("estimated");

    const first = respond("Koyambedu to Guindy");
    const selected = respond("Is there a bus route?", first.context);
    expect(selected.requestedMode).toBe("Bus");
    const fare = respond("How much is the fare?", selected.context);
    expect(fare.reply.toLowerCase()).toContain("unverified");
    expect(fare.cards[0]?.kind).toBe("fare_breakdown");
  });
});


// Multimodal composition must preserve intermediate boardings, not just legs[0].
describe("Complete mixed-mode itinerary regression", () => {
  it("retains nested Metro transfers in a Bus + Metro journey", () => {
    const options = planMixedModeItineraries("Koyambedu", "Chennai Airport");
    const busMetro = options.find(
      (it) =>
        it.modesInvolved?.includes("Bus") &&
        it.modesInvolved?.includes("Metro") &&
        it.legs.length >= 3,
    );

    expect(busMetro).toBeDefined();
    expect(busMetro!.legs[0]!.from).toBe("Koyambedu");
    expect(busMetro!.legs[busMetro!.legs.length - 1]!.to).toBe("Chennai Airport");
    expect(busMetro!.transferCount).toBe(busMetro!.legs.length - 1);
    expect(busMetro!.inVehicleMinutes).toBe(
      busMetro!.legs.reduce((sum, leg) => sum + leg.durationMinutes, 0),
    );
    expect(busMetro!.totalDurationMinutes).toBe(
      busMetro!.inVehicleMinutes + busMetro!.walkingMinutes + busMetro!.waitingMinutes,
    );
    expect(busMetro!.fare.totalFare).toBe(
      busMetro!.fare.components.reduce((sum, item) => sum + item.amount, 0),
    );
    expect(busMetro!.fare.fareDataStatus).toBe("estimated");
  });

  it("never truncates a mixed itinerary in its stop counts or fare components", () => {
    const options = planMixedModeItineraries("Anna Nagar Tower", "Chennai Airport");
    expect(options.length).toBeGreaterThan(0);
    for (const itinerary of options) {
      expect(itinerary.legs.length).toBeGreaterThanOrEqual(2);
      expect(itinerary.totalStops).toBe(
        itinerary.legs.reduce((sum, leg) => sum + Math.max(0, leg.stops.length - 1), 0),
      );
      expect(itinerary.transferCount).toBe(itinerary.legs.length - 1);
      expect(itinerary.totalDurationMinutes).toBe(
        itinerary.inVehicleMinutes + itinerary.waitingMinutes + itinerary.walkingMinutes,
      );
      expect(itinerary.fare.totalFare).toBe(
        itinerary.fare.components.reduce((sum, item) => sum + item.amount, 0),
      );
    }
  });
});
