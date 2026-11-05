import { describe, expect, it } from "vitest";
import type { CanonicalItinerary } from "./engine";
import { itineraryMapSegments, safeLiveSnapshot } from "./route-map-data";

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
