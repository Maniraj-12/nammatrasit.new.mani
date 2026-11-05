import { describe, expect, it } from "vitest";
import type { CanonicalItinerary, JourneyLeg } from "./engine";
import {
  deduplicatePhysicalJourneys, samePhysicalJourney,
} from "./deduplicate-journeys";

const metro = (id: string, via: number[][], duration = 30, transfers = 1) =>
  ({
    id,
    origin: "Koyambedu",
    destination: "Chennai Airport",
    mode: "Metro",
    totalDurationMinutes: duration,
    transferCount: transfers,
    walkingMinutes: 0,
    legs: [
      { mode: "Metro", routeId: id, routeName: id, from: "Koyambedu", to: "Airport",
        stops: ["Koyambedu", "Alandur", "Chennai Airport"],
        stopCoordinates: via },
    ] as JourneyLeg[],
  }) as CanonicalItinerary;

const throughAlandur = [
  [13.0753, 80.1951], [13.05, 80.21],
  [13.0037, 80.2015], [12.980, 80.195], [12.981, 80.162],
];
const similarBranch = [
  [13.0756, 80.195], [13.0499, 80.2102],
  [13.0038, 80.2015], [12.9798, 80.195], [12.9809, 80.162],
];
const differentViaCentral = [
  [13.0753, 80.1951], [13.084, 80.22],
  [13.082, 80.274], [13.02, 80.26], [12.981, 80.162],
];

describe("Passenger-relevant journey deduplication", () => {
  it("collapses six alternative GTFS trip IDs along one Metro corridor into one card", () => {
    const duplicates = Array.from({ length: 6 }, (_, i) =>
      metro("CMRL-pattern-" + i, i % 2 ? similarBranch : throughAlandur, 30 + (i % 2), i % 3),
    );
    const results = deduplicatePhysicalJourneys(duplicates);
    expect(results).toHaveLength(1);
    expect(results[0]!.totalDurationMinutes).toBe(30);
  });

  it("retains a physically different Metro corridor with the same endpoints", () => {
    const a = metro("via-Alandur", throughAlandur);
    const b = metro("via-Central", differentViaCentral, 46);
    expect(samePhysicalJourney(a, b)).toBe(false);
    expect(deduplicatePhysicalJourneys([a, b])).toHaveLength(2);
  });

  it("keeps bus and Metro separate and does not merge different numbered MTC lines", () => {
    const m = metro("Metro-A", throughAlandur);
    const busLeg = (id: string) =>
      ({ ...m, id, mode: "Bus", legs: [{ ...m.legs[0]!, mode: "Bus",
        routeId: id, routeName: id }] }) as CanonicalItinerary;
    expect(deduplicatePhysicalJourneys([m, busLeg("MTC-70A"), busLeg("MTC-21G")])).toHaveLength(3);
  });

  it("does not mutate source options and falls back to exact station sequences", () => {
    const a = { ...metro("A", []), legs: [{
      mode: "Metro", routeId: "A", from: "Koyambedu", to: "Airport",
      stops: ["Koyambedu", "Alandur", "Airport"],
    }] as JourneyLeg[] } as CanonicalItinerary;
    const b = { ...metro("B", []), legs: [{
      ...a.legs[0]!, routeId: "B",
    }] as JourneyLeg[] } as CanonicalItinerary;
    const original = [a, b];
    expect(deduplicatePhysicalJourneys(original)).toHaveLength(1);
    expect(original).toHaveLength(2);
  });
});
