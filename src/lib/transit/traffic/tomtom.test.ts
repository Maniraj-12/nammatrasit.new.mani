import { describe, expect, it, vi } from "vitest";
import {
  buildTomTomV1Url, compareTomTomTraffic,
  incrementalRoadTrafficMinutes, parseTomTomV1Response,
  tomtomTrafficEnabled,
} from "./tomtom-orbis.server";
import type { TrafficCompareRequest } from "./types";

const metro = {
  id: "metro", baselineTotalMinutes: 35,
  legs: [{ mode: "Metro" as const, routeId: "CMRL-SAP", baseMinutes: 25, stops: [] }],
};
const bus = {
  id: "mtc-bus", baselineTotalMinutes: 45,
  legs: [{
    mode: "Bus" as const, routeId: "MTC-70", baseMinutes: 27,
    stops: [[13.075, 80.195], [13.068, 80.203], [13.05, 80.21]] as Array<[number, number]>,
  }],
};
const candidates: TrafficCompareRequest = { journeys: [metro, bus] };

function fakeTomTomV1() {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const actual = new URL(String(url));
    expect(actual.pathname).toBe(
      "/routing/1/calculateRoute/13.075,80.195:13.068,80.203:13.05,80.21/json",
    );
    expect(actual.searchParams.get("key")).toBe("TEST-ONLY");
    expect(actual.searchParams.get("traffic")).toBe("true");
    expect(actual.searchParams.get("computeTravelTimeFor")).toBe("all");
    expect(actual.searchParams.get("departAt")).toBe("now");
    expect(actual.searchParams.get("travelMode")).toBe("car");
    expect(actual.searchParams.get("routeType")).toBe("fastest");
    expect(init?.method).toBe("GET");
    return {
      ok: true,
      json: async () => ({
        routes: [{
          summary: {
            travelTimeInSeconds: 1200,
            historicTrafficTravelTimeInSeconds: 900,
            liveTrafficIncidentsTravelTimeInSeconds: 1200,
            lengthInMeters: 5000,
            trafficDelayInSeconds: 300,
          },
        }],
      }),
    } as Response;
  });
}

describe("TomTom Routing v1 traffic comparison without Google billing", () => {
  it("does not contact TomTom without explicit opt-in and a private key", async () => {
    const fetcher = vi.fn();
    const result = await compareTomTomTraffic(candidates, {
      enabled: false, fetcher: fetcher as unknown as typeof fetch,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.provider).toBeNull();
    expect(result.fastestId).toBeNull();
    expect(result.journeys[1]!.status).toBe("UNAVAILABLE");
  });

  it("uses one v1 request per MTC leg and adjusts congestion only on the bus portion", async () => {
    const fetcher = fakeTomTomV1();
    const result = await compareTomTomTraffic(candidates, {
      enabled: true, key: "TEST-ONLY", fetcher: fetcher as unknown as typeof fetch,
      now: "2026-11-06T05:00:00.000Z",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.comparisonComplete).toBe(true);
    expect(result.sourceStatus).toBe("LIVE_ROAD_TRAFFIC");
    expect(result.fastestId).toBe("metro");
    expect(result.journeys[0]!.adjustedTotalMinutes).toBe(35);
    expect(result.journeys[1]!.adjustedTotalMinutes).toBe(50);
    expect(result.journeys[1]!.congestionAdjustmentMinutes).toBe(5);
    expect(result.journeys[1]!.googleBusRoutePolylines).toEqual([]);
  });

  it("rejects missing historical duration rather than inventing a traffic penalty", () => {
    expect(parseTomTomV1Response({
      routes: [{ summary: { travelTimeInSeconds: 800, lengthInMeters: 4000 } }],
    })).toBeNull();
    expect(incrementalRoadTrafficMinutes({
      currentSeconds: 1200, historicSeconds: 900, distanceMeters: 5000,
    })).toBe(5);
  });

  it("does not interpret rail-only static estimates as live road traffic", async () => {
    const result = await compareTomTomTraffic({ journeys: [metro] }, {
      enabled: true, key: "TEST-ONLY", fetcher: fakeTomTomV1() as unknown as typeof fetch,
    });
    expect(result.sourceStatus).toBe("UNAVAILABLE");
    expect(result.fastestId).toBeNull();
    expect(result.journeys[0]!.status).toBe("NOT_APPLICABLE");
  });

  it("recommends MTC when it has the shorter traffic-aware door-to-door estimate", async () => {
    const input: TrafficCompareRequest = {
      journeys: [{ ...metro, baselineTotalMinutes: 55 }, { ...bus, baselineTotalMinutes: 29 }],
    };
    const result = await compareTomTomTraffic(input, {
      enabled: true, key: "TEST-ONLY", fetcher: fakeTomTomV1() as unknown as typeof fetch,
    });
    expect(result.journeys[1]!.adjustedTotalMinutes).toBe(34);
    expect(result.fastestId).toBe("mtc-bus");
  });

  it("rejects a provider permission error instead of claiming a fastest route", async () => {
    const otherBus = {
      ...bus, id: "bad-key", legs: [{
        ...bus.legs[0]!,
        stops: [[13.095, 80.215], [13.094, 80.214]] as Array<[number, number]>,
      }],
    };
    const fetcher = vi.fn(async () => ({ ok: false, status: 403 } as Response));
    const result = await compareTomTomTraffic({ journeys: [metro, otherBus] }, {
      enabled: true, key: "INVALID", fetcher: fetcher as unknown as typeof fetch,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.fastestId).toBeNull();
    expect(result.comparisonComplete).toBe(false);
    expect(result.journeys[1]!.status).toBe("UNAVAILABLE");
  });

  it("requires a server-only key and deliberate activation", () => {
    expect(tomtomTrafficEnabled({})).toBe(false);
    expect(tomtomTrafficEnabled({ TOMTOM_API_KEY: "TEST-ONLY" })).toBe(false);
    expect(tomtomTrafficEnabled({
      TOMTOM_API_KEY: "TEST-ONLY", TOMTOM_TRAFFIC_ENABLED: "true",
    })).toBe(true);
  });

  it("caps the number of provider requests within a comparison", async () => {
    const journeys = Array.from({ length: 6 }, (_, i) => ({
      ...bus, id: "route-" + i,
      legs: [
        { ...bus.legs[0]!, stops: [[13.08 + i * .002, 80.195], [13.068 + i * .002, 80.203]] as Array<[number, number]> },
        { ...bus.legs[0]!, stops: [[13.09 + i * .002, 80.195], [13.084 + i * .002, 80.203]] as Array<[number, number]> },
      ],
    }));
    const result = await compareTomTomTraffic({ journeys }, {
      enabled: true, key: "TEST-ONLY", fetcher: vi.fn() as unknown as typeof fetch,
    });
    expect(result.comparisonComplete).toBe(false);
    expect(result.fastestId).toBeNull();
  });

  it("uses v1 lat,lon ordering in URL paths rather than v3 GeoJSON lon,lat", () => {
    const url = new URL(buildTomTomV1Url([[13.075, 80.195], [13.006, 80.220]], "KEY"));
    expect(url.pathname).toContain("13.075,80.195:13.006,80.22/json");
    expect(url.searchParams.get("computeTravelTimeFor")).toBe("all");
  });
});
