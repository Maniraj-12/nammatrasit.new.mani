import { describe, expect, it } from "vitest";
import { filterAuthorisedSnapshot, isFreshObservation, parseRealtimeQuery, unavailableSnapshot } from "./contract";
import { getRealtimeSnapshot } from "./provider";
import type { RealtimeQuery, RealtimeSnapshot } from "./types";

const now = Date.parse("2026-11-06T04:30:00.000Z");
const before = (ms: number) => new Date(now - ms).toISOString();
const query: RealtimeQuery = {
  mode: "BUS",
  routeId: "MTC-70A",
  boardingStopIds: ["MTC-STOP-001"],
  directionId: "0",
};
const sample: RealtimeSnapshot = {
  status: "LIVE",
  mode: "BUS",
  routeId: "MTC-70A",
  boardingStopIds: ["MTC-STOP-001"],
  directionId: "0",
  vehicles: [
    {
      routeId: "MTC-70A", providerVehicleId: "authorised-demo-vehicle",
      tripId: "provider-trip", directionId: "0", label: "70A",
      latitude: 13.08, longitude: 80.21, bearing: 60,
      positionUpdatedAt: before(20_000), status: "LIVE",
    },
    {
      routeId: "MTC-70A", providerVehicleId: "wrong-direction",
      tripId: "other", directionId: "1", label: "70A",
      latitude: 13.01, longitude: 80.2, bearing: 0,
      positionUpdatedAt: before(20_000), status: "LIVE",
    },
    {
      routeId: "MTC-70A", providerVehicleId: "outdated",
      tripId: "old", directionId: "0", label: "70A",
      latitude: 13.02, longitude: 80.2, bearing: null,
      positionUpdatedAt: before(110_000), status: "LIVE",
    },
  ],
  arrivals: [
    {
      routeId: "MTC-70A", stopId: "MTC-STOP-001", tripId: "provider-trip",
      directionId: "0",
      predictedArrivalTime: new Date(now + 5 * 60_000).toISOString(),
      predictionUpdatedAt: before(20_000),
      scheduledArrivalTime: null, delaySeconds: null,
      confidence: "OFFICIAL_PREDICTION", status: "LIVE",
    },
    {
      routeId: "MTC-70A", stopId: "MTC-STOP-999", tripId: "provider-trip",
      directionId: "0",
      predictedArrivalTime: new Date(now + 4 * 60_000).toISOString(),
      predictionUpdatedAt: before(10_000),
      scheduledArrivalTime: null, delaySeconds: null,
      confidence: "OFFICIAL_PREDICTION", status: "LIVE",
    },
    {
      routeId: "MTC-70A", stopId: "MTC-STOP-001", tripId: "provider-trip",
      directionId: "0",
      predictedArrivalTime: new Date(now + 4 * 60_000).toISOString(),
      predictionUpdatedAt: before(10_000),
      scheduledArrivalTime: null, delaySeconds: null,
      confidence: "LOCAL_ESTIMATE", status: "ESTIMATED",
    },
  ],
  alerts: [],
  source: {
    provider: "Authorised synthetic test fixture",
    authorization: "PERMITTED_FEED",
    fetchedAt: before(10_000),
    freshnessSeconds: 10, reason: "Fixture only",
  },
};

describe("Realtime contract without authorised Chennai feed", () => {
  it("rejects missing, stale and excessively future-dated GPS timestamps", () => {
    expect(isFreshObservation(before(30_000), now)).toBe(true);
    expect(isFreshObservation(before(91_000), now)).toBe(false);
    expect(isFreshObservation(new Date(now + 31_000).toISOString(), now)).toBe(false);
    expect(isFreshObservation(null, now)).toBe(false);
    expect(isFreshObservation("not-a-date", now)).toBe(false);
  });

  it("returns UNAVAILABLE rather than fictional arrivals without a provider", async () => {
    const result = await getRealtimeSnapshot(query, {}, now);
    expect(result).toEqual(unavailableSnapshot(query));
    expect(result.vehicles).toHaveLength(0);
    expect(result.arrivals).toHaveLength(0);
  });

  it("rejects malformed or cross-mode route and stop identifiers", () => {
    const params = new URLSearchParams("mode=BUS&routeId=MTC-70A&stopIds=MTC-STOP-001&directionId=0");
    expect(parseRealtimeQuery(params)).toEqual(query);
    expect(parseRealtimeQuery(new URLSearchParams("mode=BUS&routeId=CMRL-70A&stopIds=MTC-STOP-001"))).toBeNull();
    expect(parseRealtimeQuery(new URLSearchParams("mode=BUS&routeId=MTC-70A&stopIds=CMRL-STOP-001"))).toBeNull();
    expect(parseRealtimeQuery(new URLSearchParams("mode=BUS&routeId=MTC-70A&stopIds=MTC-STOP-001&directionId=2"))).toBeNull();
    expect(parseRealtimeQuery(new URLSearchParams("mode=BUS&routeId=MTC-70A&stopIds="))).toBeNull();
  });

  it("filters a consented synthetic feed to one route, direction, stop and fresh prediction", async () => {
    const result = await getRealtimeSnapshot(query, {
      BUS: {
        mode: "BUS", provider: "Synthetic provider for tests only",
        async getSnapshot() { return sample; },
      },
    }, now);
    expect(result.status).toBe("LIVE");
    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0]!.providerVehicleId).toBe("authorised-demo-vehicle");
    expect(result.arrivals).toHaveLength(1);
    expect(result.arrivals[0]!.stopId).toBe(query.boardingStopIds[0]);
    expect(result.source.freshnessSeconds).toBe(10);
  });

  it("never upgrades unlicensed, stale or wrongly-mapped synthetic data to LIVE", () => {
    const unlicensed = { ...sample, source: { ...sample.source, authorization: "NONE" as const } };
    expect(filterAuthorisedSnapshot(unlicensed, query, now).status).toBe("UNAVAILABLE");
    const stale = { ...sample, source: { ...sample.source, fetchedAt: before(92_000) } };
    expect(filterAuthorisedSnapshot(stale, query, now).status).toBe("UNAVAILABLE");
    const wrongRoute = { ...sample, routeId: "MTC-21G" };
    expect(filterAuthorisedSnapshot(wrongRoute, query, now).status).toBe("UNAVAILABLE");
  });

  it("returns UNAVAILABLE rather than leaking unexpected provider exceptions", async () => {
    const result = await getRealtimeSnapshot(query, {
      BUS: {
        provider: "Fixture", mode: "BUS",
        async getSnapshot() { throw new Error("secret upstream API key"); },
      },
    }, now);
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.source.reason).not.toContain("API key");
  });
});
