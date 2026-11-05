import type { CanonicalItinerary } from "./engine";
export type TransitMapSegment = {
  mode: string;
  name: string;
  /** Actual GTFS stop locations, not sufficient for a physical route line. */
  coordinates: Array<[number, number]>;
  /** A validated route geometry from GTFS shapes or an OSM road routing service. */
  geometry?: Array<[number, number]>;
  geometrySource?: "gtfs-shape" | "road-router";
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
          ...(geometry.length >= 3 && leg.pathSource
            ? { geometry, geometrySource: leg.pathSource }
            : {}),
        }]
      : [];
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
