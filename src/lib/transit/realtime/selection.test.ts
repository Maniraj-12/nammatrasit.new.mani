import { describe, expect, it, vi } from "vitest";
import type { JourneyLeg } from "../engine";
import { checkSelectedRealtime, realtimeQueryForLeg } from "./selection";

describe("Selected itinerary -> provider query", () => {
  it("passes a GTFS route ID and boarding stop instead of guessing from a station name", () => {
    const leg = {
      mode: "Bus", routeId: "MTC-70A", routeName: "70A",
      boardingStopId: "MTC-123", alightingStopId: "MTC-999",
      directionId: "1",
    } as JourneyLeg;
    expect(realtimeQueryForLeg(leg)).toEqual({
      mode: "BUS", routeId: "MTC-70A",
      boardingStopIds: ["MTC-123"], directionId: "1",
    });
  });

  it("refuses curated legs with no exact stop ID or a mismatched mode", () => {
    expect(realtimeQueryForLeg({
      mode: "Bus", routeId: "MTC-70A",
    } as JourneyLeg)).toBeNull();
    expect(realtimeQueryForLeg({
      mode: "Metro", routeId: "MTC-70A", boardingStopId: "CMRL-STOP",
    } as JourneyLeg)).toBeNull();
  });

  it("does not invent a LIVE snapshot when the preview server is unavailable", async () => {
    const query = {
      mode: "METRO" as const, routeId: "CMRL-A",
      boardingStopIds: ["CMRL-X"],
    };
    const fetcher = vi.fn(async () => { throw new Error("404"); }) as unknown as typeof fetch;
    const result = await checkSelectedRealtime(query, fetcher);
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.vehicles).toHaveLength(0);
    expect(result.arrivals).toHaveLength(0);
  });
});
