import { describe, expect, it } from "vitest";
import type { CanonicalItinerary } from "./engine";
import { filterRouteOptions, routeFilterCounts, routeHighlights } from "./route-options";

const make = (
  id: string,
  mode: CanonicalItinerary["mode"],
  time: number,
  fare: number,
  walking: number,
  isFastest = false,
): CanonicalItinerary =>
  ({
    id,
    origin: "Koyambedu",
    destination: "Chennai Airport",
    mode,
    routeName: id,
    legs: [],
    fare: { totalFare: fare, components: [], fareDataStatus: "estimated", fareSource: "Test", lastVerificationDate: "" },
    totalDurationMinutes: time,
    walkingMinutes: walking,
    isFastest,
  }) as CanonicalItinerary;

const routes = [
  make("m", "Metro", 30, 40, 4, true),
  make("b", "Bus", 50, 12, 5),
  make("mix", "Mixed", 37, 25, 2),
  make("r", "Suburban Rail", 44, 10, 8),
];

describe("route gallery filters and badges", () => {
  it("shows only the requested single-mode category in every filter", () => {
    expect(filterRouteOptions(routes, "All")).toHaveLength(4);
    expect(filterRouteOptions(routes, "Metro").map((r) => r.id)).toEqual(["m"]);
    expect(filterRouteOptions(routes, "Bus").map((r) => r.id)).toEqual(["b"]);
    expect(filterRouteOptions(routes, "Suburban Rail").map((r) => r.id)).toEqual(["r"]);
    expect(filterRouteOptions(routes, "Mixed").map((r) => r.id)).toEqual(["mix"]);
  });

  it("tracks category counts without double-counting mixed routes", () => {
    expect(routeFilterCounts(routes)).toEqual({
      All: 4, Fastest: 1, Metro: 1, Bus: 1, "Suburban Rail": 1, Mixed: 1,
    });
  });

  it("derives fastest, lowest estimated fare, and least-walking from route objects", () => {
    expect(routeHighlights(routes)).toEqual({
      fastestId: "m", cheapestId: "r", leastWalkingId: "mix",
    });
  });

  it("does not call a single option fastest in a comparison", () => {
    const single = [routes[0]!];
    expect(routeHighlights(single).fastestId).toBeUndefined();
    expect(filterRouteOptions(single, "Fastest")).toEqual([]);
  });

  it("does not mutate route ordering while switching tabs", () => {
    const before = routes.map((r) => r.id);
    filterRouteOptions(routes, "Fastest");
    filterRouteOptions(routes, "Mixed");
    expect(routes.map((r) => r.id)).toEqual(before);
  });
});
