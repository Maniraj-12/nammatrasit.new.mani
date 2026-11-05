import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fareText } from "./engine";
import { filterRouteOptions, routeHighlights } from "./route-options";
import {
  findFullStops, indexFullGtfs, lookupGtfsRoutes, planFullGtfs, type FullGtfsData,
} from "./full-gtfs";

const raw = JSON.parse(
  readFileSync(new URL("../../../public/data/chennai-full-network.json", import.meta.url), "utf8"),
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
    expect(journeys[0]?.fare.fareDataStatus).toBe("unavailable");
    expect(fareText(journeys[0]!.fare)).toBe("Fare unavailable");
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
    expect(routeHighlights(result).cheapestId).toBeUndefined();
  });
});
