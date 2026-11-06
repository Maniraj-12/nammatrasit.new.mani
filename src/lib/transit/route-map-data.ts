import type { CanonicalItinerary } from "./engine";
import type { FullGtfsIndex, GtfsStop } from "./full-gtfs";
import { coordinateDistanceKm } from "./estimated-fares";
export type TransitMapSegment = {
  mode: string;
  name: string;
  /** Actual GTFS stop locations, not sufficient for a physical route line. */
  coordinates: Array<[number, number]>;
  /** A validated route geometry from GTFS shapes or an OSM road routing service. */
  geometry?: Array<[number, number]>;
  geometrySource?: "gtfs-shape" | "road-router";
  /** A stop-name lookup is not proof that the original itinerary's routing was validated. */
  coordinateSource?: "itinerary-gtfs" | "gtfs-name-lookup";
};

export function itineraryMapSegments(itinerary: CanonicalItinerary): TransitMapSegment[] {
  return itinerary.legs.flatMap((leg) => {
    const points = (leg.stopCoordinates ?? [])
      .filter(([lat, lon]) =>
        Number.isFinite(lat) && Number.isFinite(lon) &&
        lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180,
      );
    const geometry = (leg.pathCoordinates ?? []).filter(([lat, lon]) =>
      Number.isFinite(lat) && Number.isFinite(lon) &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180,
    );
    return points.length >= 2
      ? [{
          mode: leg.mode,
          name: leg.routeName,
          coordinates: points,
          coordinateSource: "itinerary-gtfs" as const,
          ...(geometry.length >= 3 && leg.pathSource
            ? { geometry, geometrySource: leg.pathSource }
            : {}),
        }]
      : [];
  });
}

/**
 * Recover missing plotted stops from the bundled GTFS index only. This does
 * not create a new route or a physical railway / road polyline. Important
 * for locally planned Tanglish journeys that use curated stop names.
 */
function canonicalStopName(s: string): string {
  return s.toLowerCase()
    .replace(/\b(?:metro station|railway station|suburban station|bus stop)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function plausibleChennaiStop(stop: GtfsStop): stop is [string,string,number,number, ...unknown[]] {
  return typeof stop[2] === "number" && typeof stop[3] === "number" &&
    Number.isFinite(stop[2]) && Number.isFinite(stop[3]) &&
    stop[2] >= 12.5 && stop[2] <= 13.7 && stop[3] >= 79.5 && stop[3] <= 80.7;
}

export function lookupGtfsStopPoint(
  index: FullGtfsIndex,
  stationName: string,
  mode: string,
): [number, number] | null {
  const name = canonicalStopName(stationName);
  if (name.length < 3) return null;
  // Exact same-mode name only; do not infer arbitrary stop positions with
  // fuzzy substring matches. E.g. Guindy Metro is not Guindy Bus Stop.
  const matches = index.data.stops.filter((stop) =>
    stop[4] === mode && canonicalStopName(stop[1]) === name && plausibleChennaiStop(stop),
  );
  if (!matches.length) return null;
  const points = matches.map((stop) => [stop[2]!, stop[3]!] as [number,number]);
  // Ambiguous same-name stops far apart would mislead the map.
  if (points.some((point) => coordinateDistanceKm(point,points[0]!) > 0.25)) return null;
  return points[0]!;
}

export function recoverItineraryMapSegments(
  itinerary: CanonicalItinerary,
  index: FullGtfsIndex,
): TransitMapSegment[] {
  return itinerary.legs.flatMap((leg) => {
    const existing = itineraryMapSegments({ ...itinerary, legs: [leg] });
    if (existing.length) return existing;
    const positions: Array<[number,number]> = [];
    // Only stops in the actual itinerary leg, never unrelated nearby stations.
    for (const name of leg.stops.slice(0,100)) {
      const point = lookupGtfsStopPoint(index,name,leg.mode);
      if (point) positions.push(point);
    }
    if (positions.length < 2) return [];
    if (positions.every((p) => coordinateDistanceKm(p,positions[0]!) <= 0.02)) return [];
    return [{
      mode: leg.mode,
      name: leg.routeName,
      coordinates: positions,
      coordinateSource: "gtfs-name-lookup" as const,
      // Crucially: NO fabricated straight line or road routing; not even
      // an OSRM path, because this fallback has not verified the bus pattern.
    }];
  });
}

export type LiveTransitSnapshot = {
  status: "live" | "stale" | "unavailable";
  source?: string;
  receivedAt?: string;
  vehicles: Array<{
    routeId: string;
    lat: number;
    lon: number;
    vehicleId?: string;
    timestamp: string;
  }>;
  arrivals: Array<{
    routeId: string;
    stopId: string;
    etaTime: string;
    timestamp: string;
  }>;
};

/** Do not render old/unsourced data as real-time. */
export function safeLiveSnapshot(
  snapshot: LiveTransitSnapshot | undefined,
  now = Date.now(),
): LiveTransitSnapshot {
  if (!snapshot || snapshot.status !== "live" || !snapshot.source || !snapshot.receivedAt) {
    return { status: "unavailable", vehicles: [], arrivals: [] };
  }
  const age = now - Date.parse(snapshot.receivedAt);
  if (!Number.isFinite(age) || age < -30000 || age > 90000) {
    return { status: "stale", source: snapshot.source, receivedAt: snapshot.receivedAt, vehicles: [], arrivals: [] };
  }
  return {
    ...snapshot,
    vehicles: snapshot.vehicles.filter((v) =>
      Number.isFinite(v.lat) && Number.isFinite(v.lon) &&
      v.lat >= -90 && v.lat <= 90 && v.lon >= -180 && v.lon <= 180,
    ),
    arrivals: snapshot.arrivals.filter((a) => a.etaTime && a.timestamp && a.stopId),
  };
}
