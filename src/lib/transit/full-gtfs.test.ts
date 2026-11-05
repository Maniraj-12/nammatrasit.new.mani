import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fareText, type JourneyLeg } from "./engine";
import { estimateFullGtfsFare } from "./estimated-fares";
import { normalizeCommuterMessage, resolveStopName } from "./intent-recovery";
import { filterRouteOptions, routeHighlights } from "./route-options";
import {
  findFullStops, indexFullGtfs, lookupGtfsRoutes, planFullGtfs, type FullGtfsData,
} from "./full-gtfs";

const raw = JSON.parse(
  readFileSync("public/data/chennai-full-network.json", "utf8"),
) as FullGtfsData;
const network = indexFullGtfs(raw);

describe("Complete Chennai unified GTFS feed", () => {
  it("imports all route IDs, stations, trip stop patterns and intermodal walk edges", () => {
    expect(raw.metadata.routeCount).toBe(5402);
    expect(raw.metadata.stopCount).toBe(6542);
    expect(raw.metadata.tripCount).toBeGreaterThan(48000);
    expect(raw.metadata.patternCount).toBeGreaterThan(4000);
    expect(raw.walks.length).toBeGreaterThan(1000);
    const counts = raw.routes.reduce((sum, route) => {
      sum[route[3]] = (sum[route[3]] ?? 0) + 1;
      return sum;
    }, {} as Record<string, number>);
    expect(counts.Bus).toBeGreaterThan(4500);
    expect(counts.Metro).toBeGreaterThan(20);
    expect(counts["Suburban Rail"]).toBeGreaterThan(700);
  });

  it("finds a valid MTC route pattern from the original stop sequence", () => {
    const sample = raw.patterns.find(
      (pattern) => raw.routes[pattern[0]]?.[3] === "Bus" && pattern[1].length >= 5,
    );
    expect(sample).toBeDefined();
    const origin = raw.stops[sample![1][0]!]![1];
    const destination = raw.stops[sample![1][sample![1].length - 1]!]![1];
    expect(findFullStops(network, origin).length).toBeGreaterThan(0);
    expect(findFullStops(network, destination).length).toBeGreaterThan(0);
    const journeys = planFullGtfs(network, origin, destination, "Bus", 3);
    expect(journeys.length).toBeGreaterThan(0);
    expect(journeys[0]?.legs.every((leg) => leg.mode === "Bus")).toBe(true);
    expect(journeys[0]?.fare.fareDataStatus).toBe("estimated");
    expect(fareText(journeys[0]!.fare)).toContain("₹");
    expect(journeys[0]?.fare.estimateRange?.min).toBeGreaterThan(0);
  });

  it("indexes route numbers without making up fake route variants", () => {
    const lines = lookupGtfsRoutes(network, "70A");
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((r) => r[1].toLowerCase() === "70a")).toBe(true);
  });

  it("does not award lowest-fare to a route with missing fare data", () => {
    const sample = raw.patterns.find((p) => raw.routes[p[0]]?.[3] === "Bus" && p[1].length >= 5)!;
    const from = raw.stops[sample[1][0]!]![1];
    const to = raw.stops[sample[1][sample[1].length - 1]!]![1];
    const result = planFullGtfs(network, from, to, "Bus", 2);
    expect(result.length).toBeGreaterThan(0);
    expect(filterRouteOptions(result, "Metro")).toHaveLength(0);
    if (result.every((r) => r.fare.fareDataStatus === "unavailable")) {
      expect(routeHighlights(result).cheapestId).toBeUndefined();
    }
  });
});

describe("Chennai commuter journey smoke checks", () => {
  it("searches the real unified feed for Koyambedu to Chennai Airport", () => {
    const routes = planFullGtfs(network, "Koyambedu", "Chennai Airport", "All", 4);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes[0]?.legs.length).toBeGreaterThan(0);
    expect(routes.some((r) => r.fare.fareDataStatus === "estimated")).toBe(true);
  }, 15000);

  it("finds suburban travel from Guindy to Chennai Beach", () => {
    const routes = planFullGtfs(network, "Guindy", "Chennai Beach", "Suburban Rail", 3);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((r) => r.legs.every((leg) => leg.mode === "Suburban Rail"))).toBe(true);
  }, 15000);
});

describe("Fare estimates and intent recovery", () => {
  it("stores dated CMRL fare matrix records from original GTFS", () => {
    expect(Object.keys(raw.metroFareByZone ?? {}).length).toBeGreaterThan(1000);
  });

  it("calculates a historical Metro fare reference from station IDs without calling it verified", () => {
    const firstPair = Object.entries(raw.metroFareByZone ?? {}).find(([, fare]) => fare > 0);
    expect(firstPair).toBeDefined();
    const [a, b] = firstPair![0].split("|");
    const from = raw.stops.findIndex((stop) => stop[0] === a || stop[5] === a || stop[6] === a);
    const to = raw.stops.findIndex((stop) => stop[0] === b || stop[5] === b || stop[6] === b);
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThanOrEqual(0);
    const leg: JourneyLeg = {
      mode: "Metro", routeId: "CMRL-test", routeName: "Metro",
      from: raw.stops[from]![1], to: raw.stops[to]![1],
      direction: "Test", stops: [raw.stops[from]![1], raw.stops[to]![1]],
      durationMinutes: 5, distanceKm: 2, frequencyMinutes: 0,
    };
    const estimate = estimateFullGtfsFare(network, [leg], [[from, to]]);
    expect(estimate.fareDataStatus).toBe("estimated");
    expect(estimate.estimateRange?.min).toBeGreaterThan(0);
    expect(estimate.components[0]!.notes).toContain("Historical");
  });

  it("gives explicit bounded ranges for estimated bus and suburban fares", () => {
    const a = raw.stops.findIndex((s) => s[4] === "Bus");
    const b = raw.stops.findIndex((s) => s[4] === "Bus" && s[0] !== raw.stops[a]![0]);
    const leg: JourneyLeg = {
      mode: "Bus", routeId: "MTC-demo", routeName: "MTC",
      from: "Bus Origin", to: "Bus Destination",
      direction: "Demo", stops: ["Bus Origin", "Bus Destination"],
      durationMinutes: 10, distanceKm: 9.5, frequencyMinutes: 0,
    };
    const fare = estimateFullGtfsFare(network, [leg], [[a, b]]);
    expect(fare.estimateRange?.min).toBeGreaterThanOrEqual(5);
    expect(fare.estimateRange?.max).toBeGreaterThan(fare.estimateRange!.min);
    expect(fareText(fare)).toContain("est.");

    const rail = { ...leg, mode: "Suburban Rail" as const, distanceKm: 12 };
    const railFare = estimateFullGtfsFare(network, [rail], [[a, b]]);
    expect(railFare.fareDataStatus).toBe("estimated");
    expect(railFare.estimateRange?.min).toBe(5);
  });

  it("corrects common intent typos and suggests near-miss Chennai stop names", () => {
    expect(normalizeCommuterMessage("Any buss roote?")).toBe("Any bus route?");
    expect(normalizeCommuterMessage("metroo far")).toBe("metro fare");
    const airport = resolveStopName(network, "Chenai Airport");
    expect(["exact", "corrected", "uncertain"]).toContain(airport.kind);
    const nearMiss = resolveStopName(network, "Koyammbedu");
    expect(["corrected", "uncertain"]).toContain(nearMiss.kind);
    if (airport.kind !== "unknown" && airport.kind !== "exact") {
      expect(airport.options.some((name) => name.toLowerCase().includes("airport"))).toBe(true);
    }
  });
});
