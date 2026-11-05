import type { CanonicalItinerary } from "../engine";
import type {
  LocationPoint, TrafficCompareRequest, TrafficCompareResponse,
  TrafficJourneyInput, TrafficResult,
} from "./types";

/**
 * Short road-only comparisons: do not turn an arbitrary web request into
 * unlimited billable Google API calls. Proxy must also have edge rate limits.
 */
export const MAX_JOURNEYS = 6;
export const MAX_TRAFFIC_GOOGLE_CALLS = 10;
export const MAX_BUS_STOPS = 70;
export const MAX_POINTS_PER_GOOGLE_CALL = 12; // <=10 intermediates

export function validChennaiCoordinate(point: LocationPoint): boolean {
  return Array.isArray(point) && point.length === 2 &&
    point.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    point[0] >= 12.2 && point[0] <= 14.1 &&
    point[1] >= 79.2 && point[1] <= 81.0;
}

export function compactStops(points: LocationPoint[]): LocationPoint[] {
  const unique: LocationPoint[] = [];
  for (const point of points) {
    if (!validChennaiCoordinate(point)) return [];
    if (!unique.length || Math.abs(unique[unique.length - 1]![0] - point[0]) > 0.00002 ||
        Math.abs(unique[unique.length - 1]![1] - point[1]) > 0.00002) {
      unique.push(point);
    }
  }
  return unique;
}

export function splitIntoGoogleSegments(points: LocationPoint[]): LocationPoint[][] {
  const slices: LocationPoint[][] = [];
  const unique = compactStops(points);
  if (unique.length < 2 || unique.length > MAX_BUS_STOPS) return [];
  for (let i = 0; i < unique.length - 1; i += MAX_POINTS_PER_GOOGLE_CALL - 1) {
    const section = unique.slice(i, i + MAX_POINTS_PER_GOOGLE_CALL);
    if (section.length < 2) break;
    slices.push(section);
  }
  return slices;
}

export function buildTrafficRequest(options: CanonicalItinerary[]): TrafficCompareRequest {
  return { journeys: options.slice(0, MAX_JOURNEYS).map((itinerary) => ({
    id: itinerary.id,
    baselineTotalMinutes: itinerary.totalDurationMinutes,
    legs: itinerary.legs.map((leg) => ({
      mode: leg.mode,
      routeId: leg.routeId,
      baseMinutes: leg.durationMinutes,
      stops: leg.mode === "Bus" ? (leg.stopCoordinates ?? []) : [],
    })),
  })) };
}

export function validateTrafficRequest(value: unknown): TrafficCompareRequest | null {
  if (!value || typeof value !== "object") return null;
  const req = value as TrafficCompareRequest;
  if (!Array.isArray(req.journeys) || !req.journeys.length ||
      req.journeys.length > MAX_JOURNEYS) return null;
  let calls = 0;
  const seen = new Set<string>();
  for (const route of req.journeys) {
    if (!route || typeof route.id !== "string" || route.id.length > 180 ||
        seen.has(route.id) || !Number.isFinite(route.baselineTotalMinutes) ||
        route.baselineTotalMinutes <= 0 || route.baselineTotalMinutes > 720 ||
        !Array.isArray(route.legs) || !route.legs.length || route.legs.length > 8) return null;
    seen.add(route.id);
    let busLegs = 0;
    for (const leg of route.legs) {
      if (!leg || !["Bus","Metro","Suburban Rail"].includes(leg.mode) ||
          typeof leg.routeId !== "string" || leg.routeId.length > 160 ||
          !Number.isFinite(leg.baseMinutes) || leg.baseMinutes < 0 ||
          leg.baseMinutes > 720 || !Array.isArray(leg.stops)) return null;
      const prefix = leg.mode === "Bus" ? "MTC-" : leg.mode === "Metro" ? "CMRL-" : "SRR-";
      if (!leg.routeId.startsWith(prefix)) return null;
      if (leg.mode === "Bus") {
        busLegs++;
        if (busLegs > 3 || leg.stops.length > MAX_BUS_STOPS ||
            leg.stops.some((p) => !validChennaiCoordinate(p))) return null;
        const chunks = splitIntoGoogleSegments(leg.stops);
        calls += chunks.length;
      } else if (leg.stops.length) return null;
    }
  }
  return calls <= MAX_TRAFFIC_GOOGLE_CALLS ? req : null;
}

export function baselineTrafficResult(journey: TrafficJourneyInput): TrafficResult {
  return {
    id: journey.id,
    status: "NOT_APPLICABLE",
    baselineTotalMinutes: journey.baselineTotalMinutes,
    adjustedTotalMinutes: journey.baselineTotalMinutes,
    congestionAdjustmentMinutes: 0,
    googleDriveMinutes: null,
    googleStaticDriveMinutes: null,
    checkedAt: null,
    message: "Rail duration is a static GTFS estimate; current train delay information is unavailable.",
    googleBusRoutePolylines: [],
  };
}

export function unavailableTrafficResult(journey: TrafficJourneyInput, reason: string): TrafficResult {
  return {
    id: journey.id, status: "UNAVAILABLE",
    baselineTotalMinutes: journey.baselineTotalMinutes,
    adjustedTotalMinutes: null,
    congestionAdjustmentMinutes: null,
    googleDriveMinutes: null,
    googleStaticDriveMinutes: null,
    checkedAt: null, message: reason,
    googleBusRoutePolylines: [],
  };
}

export const trafficDisclaimer =
  "Traffic-aware journey estimate, not an actual arrival: Google road driving times do not model bus dwell times, signals specific to buses, bus waiting/headways or train delays. MTC roads are approximated through recorded GTFS stops; actual MTC routing can differ.";

export function combineTrafficResults(
  candidates: TrafficJourneyInput[], results: TrafficResult[],
  enabled: boolean, now = new Date().toISOString(),
): TrafficCompareResponse {
  const allTrafficAvailable = enabled && candidates.every((route, i) =>
    !route.legs.some((leg) => leg.mode === "Bus") ||
    results[i]?.status === "TRAFFIC_AWARE");
  const ranked = allTrafficAvailable && candidates.length > 1 ?
    [...results].sort((a, b) => (a.adjustedTotalMinutes ?? Infinity) - (b.adjustedTotalMinutes ?? Infinity)) : [];
  return {
    provider: enabled ? "Google Maps Routes API" : null,
    requestedAt: now,
    sourceStatus: allTrafficAvailable && results.some((r) => r.status === "TRAFFIC_AWARE")
      ? "LIVE_ROAD_TRAFFIC" : "UNAVAILABLE",
    journeys: results,
    comparisonComplete: allTrafficAvailable,
    fastestId: ranked[0]?.id ?? null,
    disclaimer: trafficDisclaimer,
  };
}
