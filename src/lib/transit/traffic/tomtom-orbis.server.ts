/** TomTom Maps Routing API v1 — server-only traffic adapter.
 * Uses a SINGLE traffic=true and computeTravelTimeFor=all request per
 * MTC bus leg. The response includes best-estimate and historic traffic
 * durations for the SAME road route, avoiding mismatched v3 routes.
 *
 * No live bus GPS; only current road congestion estimates.
 * The TomTom key is a server secret, never included in browser code.
 */
import {
  baselineTrafficResult, compactStops, unavailableTrafficResult,
  validateTrafficRequest,
} from "./logic";
import type {
  LocationPoint, TrafficCompareRequest, TrafficCompareResponse,
  TrafficJourneyInput, TrafficResult,
} from "./types";

const BASE_URL = "https://api.tomtom.com/routing/1/calculateRoute/";
const MAX_PROVIDER_REQUESTS = 10;
const MAX_STOPS_PER_LEG = 70;
const CACHE_MS = 60_000;
const cache = new Map<string, { until: number; result: RoadDuration }>();

type V1Summary = {
  travelTimeInSeconds?: number;
  historicTrafficTravelTimeInSeconds?: number;
  liveTrafficIncidentsTravelTimeInSeconds?: number;
  trafficDelayInSeconds?: number;
  lengthInMeters?: number;
};
type V1Response = { routes?: Array<{ summary?: V1Summary }> };
type RoadDuration = {
  currentSeconds: number;
  historicSeconds: number;
  distanceMeters: number;
};

export function tomtomTrafficEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.TOMTOM_TRAFFIC_ENABLED === "true" && !!env.TOMTOM_API_KEY?.trim();
}

/** The v1 path takes latitude,longitude, separated with colons for waypoints. */
export function buildTomTomV1Url(stops: LocationPoint[], key: string): string {
  if (stops.length < 2 || stops.length > MAX_STOPS_PER_LEG ||
      !stops.every((point) => point.length === 2 &&
        Number.isFinite(point[0]) && Number.isFinite(point[1]))) {
    throw new Error("Invalid TomTom stop coordinates");
  }
  const locations = stops.map(([lat, lon]) => lat + "," + lon).join(":");
  const params = new URLSearchParams({
    key,
    traffic: "true",
    departAt: "now",
    routeType: "fastest",
    travelMode: "car",
    computeTravelTimeFor: "all",
    routeRepresentation: "summaryOnly",
  });
  return BASE_URL + locations + "/json?" + params;
}

export function parseTomTomV1Response(json: V1Response): RoadDuration | null {
  const summary = json?.routes?.[0]?.summary;
  if (!summary) return null;
  const now = summary.travelTimeInSeconds;
  const historic = summary.historicTrafficTravelTimeInSeconds;
  const length = summary.lengthInMeters;
  if (typeof now !== "number" || !Number.isFinite(now) || now <= 0 ||
      now >= 43_200 || typeof historic !== "number" ||
      !Number.isFinite(historic) || historic <= 0 || historic >= 43_200 ||
      typeof length !== "number" || !Number.isFinite(length) || length <= 0) {
    return null;
  }
  return { currentSeconds: now, historicSeconds: historic, distanceMeters: length };
}

async function calculateTomTom(
  stops: LocationPoint[], apiKey: string, fetcher: typeof fetch,
): Promise<RoadDuration | null> {
  if (stops.length < 2 || stops.length > MAX_STOPS_PER_LEG) return null;
  const identity = stops.map(([lat, lon]) => lat.toFixed(5) + "," + lon.toFixed(5)).join(";");
  // Only cache real backend requests: mock API requests need independent tests.
  const useCache = fetcher === fetch;
  const hit = useCache ? cache.get(identity) : undefined;
  if (hit && hit.until > Date.now()) return hit.result;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetcher(buildTomTomV1Url(stops, apiKey), {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const result = parseTomTomV1Response(await response.json() as V1Response);
    if (result && useCache) {
      if (cache.size > 80) cache.clear();
      cache.set(identity, { until: Date.now() + CACHE_MS, result });
    }
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function incrementalRoadTrafficMinutes(
  value: RoadDuration,
): number {
  return (value.currentSeconds - value.historicSeconds) / 60;
}

async function compareBusJourney(
  journey: TrafficJourneyInput,
  key: string,
  fetcher: typeof fetch,
  checkedAt: string,
): Promise<TrafficResult> {
  let adjustment = 0;
  for (const leg of journey.legs) {
    if (leg.mode !== "Bus") continue;
    const stops = compactStops(leg.stops);
    if (stops.length < 2 || stops.length > MAX_STOPS_PER_LEG) {
      return unavailableTrafficResult(journey,
        "Bus leg lacks valid geographical stop coordinates.");
    }
    const route = await calculateTomTom(stops, key, fetcher);
    if (!route) {
      return unavailableTrafficResult(journey,
        "TomTom v1 did not provide both current and historical traffic times for the MTC leg.");
    }
    adjustment += incrementalRoadTrafficMinutes(route);
  }

  return {
    id: journey.id,
    status: "TRAFFIC_AWARE",
    baselineTotalMinutes: journey.baselineTotalMinutes,
    adjustedTotalMinutes: Math.max(1, Math.round(journey.baselineTotalMinutes + adjustment)),
    congestionAdjustmentMinutes: Math.round(adjustment),
    googleDriveMinutes: null,
    googleStaticDriveMinutes: null,
    checkedAt,
    googleBusRoutePolylines: [],
    message: "TomTom v1 current-versus-historic road traffic comparison. MTC waiting, stop dwell, diversions and actual bus location are unverified.",
  };
}

export const tomtomDisclaimer =
  "Road traffic-adjusted estimate, not a verified bus or train ETA. TomTom v1 compares its current road travel estimate with the same route's typical historic traffic. MTC boarding waits, stop dwell, bus lanes, diversions and train delays are not tracked.";

export async function compareTomTomTraffic(
  input: TrafficCompareRequest,
  opts: { key?: string; enabled?: boolean; fetcher?: typeof fetch; now?: string } = {},
): Promise<TrafficCompareResponse> {
  const valid = validateTrafficRequest(input);
  if (!valid) throw new Error("Invalid traffic request");
  const now = opts.now ?? new Date().toISOString();
  const key = opts.key ?? process.env.TOMTOM_API_KEY;
  const usable = (opts.enabled ?? tomtomTrafficEnabled()) && !!key?.trim();
  const busLegs = valid.journeys.reduce((total, j) =>
    total + j.legs.filter((leg) => leg.mode === "Bus").length, 0);
  const limited = busLegs <= MAX_PROVIDER_REQUESTS;
  const results: TrafficResult[] = [];

  for (const journey of valid.journeys) {
    if (!journey.legs.some((leg) => leg.mode === "Bus")) {
      results.push(baselineTrafficResult(journey));
    } else if (!usable) {
      results.push(unavailableTrafficResult(journey,
        "TomTom free Routing API key is not enabled on the application's backend."));
    } else if (!limited) {
      results.push(unavailableTrafficResult(journey,
        "Too many MTC legs in the comparison; select fewer alternatives."));
    } else {
      results.push(await compareBusJourney(journey, key!, opts.fetcher ?? fetch, now));
    }
  }

  const complete = usable && limited && busLegs > 0 &&
    results.every((r, index) =>
      !valid.journeys[index]!.legs.some((leg) => leg.mode === "Bus") ||
      r.status === "TRAFFIC_AWARE");
  const sorted = complete && results.length > 1
    ? [...results].sort((a,b) =>
        (a.adjustedTotalMinutes ?? Infinity) - (b.adjustedTotalMinutes ?? Infinity))
    : [];

  return {
    provider: usable ? "TomTom Orbis Routing API" : null,
    requestedAt: now,
    sourceStatus: complete ? "LIVE_ROAD_TRAFFIC" : "UNAVAILABLE",
    journeys: results,
    comparisonComplete: complete,
    fastestId: sorted[0]?.id ?? null,
    disclaimer: tomtomDisclaimer,
  };
}
