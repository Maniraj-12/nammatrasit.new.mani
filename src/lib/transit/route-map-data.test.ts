import { describe, expect, it } from "vitest";
import type { CanonicalItinerary } from "./engine";
import { itineraryMapSegments, recoverItineraryMapSegments, lookupGtfsStopPoint, safeLiveSnapshot } from "./route-map-data";
import type { FullGtfsIndex } from "./full-gtfs";
import { normalizeCommuterMessage } from "./intent-recovery";

const sample = {
  id: "test", legs: [
    { mode: "Bus", routeName: "MTC 70", stopCoordinates: [[13.08, 80.21], [13.04, 80.2]] },
    { mode: "Metro", routeName: "CMRL", stopCoordinates: [[13.04, 80.2], [13.0, 80.2]] },
  ],
} as CanonicalItinerary;

describe("Selected transit route map data", () => {
  it("preserves bus and metro geographic stops in journey order", () => {
    const segments = itineraryMapSegments(sample);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.mode).toBe("Bus");
    expect(segments[1]?.mode).toBe("Metro");
    expect(segments[1]?.coordinates[1]).toEqual([13.0, 80.2]);
  });

  it("rejects non-geographic points instead of drawing false markers", () => {
    const broken = { ...sample, legs: [{ mode: "Bus", routeName: "Unknown",
      stopCoordinates: [[999, 999], [13.0, 80.2]] }] } as CanonicalItinerary;
    expect(itineraryMapSegments(broken)).toHaveLength(0);
  });

  it("never treats absent provider data as a live vehicle or arrival", () => {
    expect(safeLiveSnapshot(undefined)).toEqual({
      status: "unavailable", vehicles: [], arrivals: [],
    });
  });

  it("marks delayed or implausibly future snapshots as stale", () => {
    const now = Date.parse("2026-11-06T06:00:00Z");
    const packet = {
      status: "live" as const,
      source: "Authorised demo provider",
      receivedAt: "2026-11-06T05:58:00Z",
      vehicles: [{ routeId: "MTC-70", lat: 13.0, lon: 80.2, timestamp: "2026-11-06T05:58:00Z" }],
      arrivals: [],
    };
    expect(safeLiveSnapshot(packet, now).status).toBe("stale");
    expect(safeLiveSnapshot(packet, now).vehicles).toHaveLength(0);
  });

  it("passes through recent authorised positions only after validity checks", () => {
    const now = Date.parse("2026-11-06T06:00:00Z");
    const packet = {
      status: "live" as const,
      source: "Authorised provider",
      receivedAt: "2026-11-06T05:59:45Z",
      vehicles: [
        { routeId: "MTC-70", lat: 13.0, lon: 80.2, timestamp: "2026-11-06T05:59:45Z" },
        { routeId: "MTC-70", lat: 500, lon: 500, timestamp: "2026-11-06T05:59:45Z" },
      ],
      arrivals: [],
    };
    expect(safeLiveSnapshot(packet, now).vehicles).toHaveLength(1);
  });
});


describe("Tanglish journey map coordinate fallback", () => {
  // Synthetic GTFS stop locations only; they are not claimed as real-world
  // coordinates. This tests matching and geometry safety without network.
  const stops = [
    ["B1", "Ramapuram", 13.01, 80.18, "Bus", ""],
    ["B2", "Tidel Park", 12.99, 80.24, "Bus", ""],
    ["M1", "Ramapuram", 13.4, 80.39, "Metro", ""],
  ] as FullGtfsIndex["data"]["stops"];
  const index = {
    data: { stops, routes: [], patterns: [], walks: [], metadata: {} },
    rides: [], walks: [], stopNames: [],
  } as unknown as FullGtfsIndex;

  const single = {
    id: "tanglish-fallback",
    mode: "Bus",
    origin: "Ramapuram",
    destination: "Tidel Park",
    legs: [{
      mode: "Bus", routeName: "Unverified curated bus leg",
      stops: ["Ramapuram", "Tidel Park"],
      from: "Ramapuram", to: "Tidel Park",
    }],
  } as CanonicalItinerary;

  it("recognises the Tanglish judge journey and recovers source stop markers", () => {
    expect(normalizeCommuterMessage("Ramapuram lendhu Tidel Park by 10 AM")).toBe("Ramapuram to Tidel Park");
    expect(itineraryMapSegments(single)).toHaveLength(0);
    const recovered = recoverItineraryMapSegments(single, index);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.coordinates).toEqual([[13.01, 80.18], [12.99, 80.24]]);
    expect(recovered[0]?.coordinateSource).toBe("gtfs-name-lookup");
    expect(recovered[0]?.geometry).toBeUndefined();
    expect(recovered[0]?.geometrySource).toBeUndefined();
  });

  it("never borrows a Metro stop for a Bus itinerary with the same name", () => {
    expect(lookupGtfsStopPoint(index, "Ramapuram", "Bus")).toEqual([13.01, 80.18]);
    expect(lookupGtfsStopPoint(index, "Tidel Park", "Metro")).toBeNull();
  });

  it("does not invent locations for unrecognised or ambiguous GTFS stops", () => {
    expect(lookupGtfsStopPoint(index, "Nonexistent Tidel Park X", "Bus")).toBeNull();
    const ambiguous = {
      ...index,
      data: { ...index.data, stops: [
        ...stops, ["B3", "Ramapuram", 13.1, 80.28, "Bus", ""],
      ] },
    } as FullGtfsIndex;
    expect(lookupGtfsStopPoint(ambiguous, "Ramapuram", "Bus")).toBeNull();
    expect(recoverItineraryMapSegments(single, ambiguous)).toHaveLength(0);
  });

  it("prefers genuine supplied GTFS geometry over any inferred map markers", () => {
    const actual = {
      ...single,
      legs: [{
        ...single.legs[0]!,
        stopCoordinates: [[13.02, 80.19], [13.01, 80.20]],
        pathCoordinates: [[13.02, 80.19], [13.015, 80.195], [13.01, 80.20]],
        pathSource: "gtfs-shape",
      }],
    } as CanonicalItinerary;
    const recovered = recoverItineraryMapSegments(actual, index);
    expect(recovered[0]?.geometrySource).toBe("gtfs-shape");
    expect(recovered[0]?.coordinateSource).toBe("itinerary-gtfs");
  });
});
