import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sliceGtfsShape } from "./gtfs-shapes";
import { decodeOsrmRoadGeometry } from "./road-routing";
import { indexFullGtfs, planFullGtfs, type FullGtfsData } from "./full-gtfs";
import { itineraryMapSegments } from "./route-map-data";

describe("GTFS and road-aligned route mapping", () => {
  it("extracts directed GTFS shape points without reversing the route", () => {
    const shape: Array<[number, number]> = [
      [13.000, 80.100], [13.001, 80.102], [13.003, 80.103],
      [13.004, 80.105], [13.006, 80.107],
    ];
    const result = sliceGtfsShape(shape, [13.001, 80.102], [13.006, 80.107]);
    expect(result).toHaveLength(4);
    expect(result?.[0]).toEqual(shape[1]);
    expect(sliceGtfsShape(shape, [13.006, 80.107], [13.001, 80.102])).toBeNull();
    expect(sliceGtfsShape(shape, [15.000, 80.100], [13.006, 80.107])).toBeNull();
  });

  it("rejects invalid, mismatched or distant OSRM results", () => {
    const stops: Array<[number, number]> = [[13.08, 80.21], [13.07, 80.21]];
    const good = {
      code: "Ok",
      waypoints: [{ distance: 12 }, { distance: 15 }],
      routes: [{
        distance: 1500,
        geometry: {
          type: "LineString",
          coordinates: [[80.21, 13.08], [80.208, 13.075], [80.21, 13.07]] as Array<[number, number]>,
        },
      }],
    };
    expect(decodeOsrmRoadGeometry(good, stops)).toEqual([
      [13.08, 80.21], [13.075, 80.208], [13.07, 80.21],
    ]);
    expect(decodeOsrmRoadGeometry({
      ...good, waypoints: [{ distance: 600 }, { distance: 15 }],
    }, stops)).toBeNull();
    expect(decodeOsrmRoadGeometry({
      ...good, code: "NoRoute",
    }, stops)).toBeNull();
  });

  it("uses imported Metro shapes for the actual Koyambedu–Airport trip", () => {
    const feed = JSON.parse(
      readFileSync("public/data/chennai-full-network.json", "utf8"),
    ) as FullGtfsData;
    expect(Object.keys(feed.shapes ?? {}).length).toBeGreaterThan(0);
    expect(feed.metadata.shapeCount).toBeGreaterThan(0);
    const index = indexFullGtfs(feed);
    const journeys = planFullGtfs(index, "Koyambedu", "Chennai Airport", "Metro", 3);
    expect(journeys).toHaveLength(1);
    const mapLegs = itineraryMapSegments(journeys[0]!);
    expect(mapLegs.some((leg) =>
      leg.mode === "Metro" && leg.geometrySource === "gtfs-shape" &&
      (leg.geometry?.length ?? 0) > 2,
    )).toBe(true);
  }, 20000);

  it("never treats plain stop coordinates as a completed bus or suburban route shape", () => {
    const feed = JSON.parse(
      readFileSync("public/data/chennai-full-network.json", "utf8"),
    ) as FullGtfsData;
    const index = indexFullGtfs(feed);
    const candidates = planFullGtfs(index, "Koyambedu", "Guindy", "All", 5);
    for (const journey of candidates) {
      for (const segment of itineraryMapSegments(journey)) {
        if (!segment.geometrySource) expect(segment.geometry).toBeUndefined();
      }
    }
  }, 20000);
});
