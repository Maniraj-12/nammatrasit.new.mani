import { geographicDistanceKm, validLatLon, type LatLon } from "./gtfs-shapes";

/** Approximate roadway polyline for a bus leg, NOT an operator-confirmed MTC route.
 *
 * The public OSRM endpoint is a low-volume demonstration server. For a
 * production deployment replace the URL with an authorised/self-hosted OSRM
 * instance via VITE_OSRM_ROUTE_BASE. The request is only made for a selected
 * bus leg, never for Metro or suburban-rail tracks.
 */
const DEMO_BASE = "https://router.project-osrm.org/route/v1/driving";
const configuredBase = import.meta.env?.VITE_OSRM_ROUTE_BASE?.trim();
const BASE = (configuredBase || DEMO_BASE).replace(/\/$/, "");
const cache = new Map<string, Promise<LatLon[] | null>>();
let lastCall = 0;
let requestQueue: Promise<void> = Promise.resolve();
let demoRequests = 0;
const DEMO_MAX_SESSION_REQUESTS = 8;

type OsrmResponse = {
  code?: string;
  routes?: Array<{ distance?: number; geometry?: {
    type?: string; coordinates?: Array<[number, number]>;
  } }>;
  waypoints?: Array<{ distance?: number }>;
};

export function decodeOsrmRoadGeometry(
  json: OsrmResponse,
  stops: LatLon[],
): LatLon[] | null {
  if (json.code !== "Ok" || !json.routes?.length || !json.waypoints ||
      json.waypoints.length !== stops.length) return null;
  if (json.waypoints.some((point) =>
    !Number.isFinite(point.distance) || point.distance! > 250)) return null;

  const geometry = json.routes[0]?.geometry;
  if (geometry?.type !== "LineString" || !geometry.coordinates ||
      geometry.coordinates.length < 3) return null;
  const points: LatLon[] = geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  if (!points.every(validLatLon)) return null;
  if (geographicDistanceKm(points[0]!, stops[0]!) > 0.3 ||
      geographicDistanceKm(points[points.length - 1]!, stops[stops.length - 1]!) > 0.3) return null;
  // Reject implausible detours due to a stop snapped to an unrelated road.
  const minimumKm = stops.slice(1).reduce(
    (sum, p, i) => sum + geographicDistanceKm(stops[i]!, p), 0,
  );
  const routedKm = (json.routes[0]?.distance || 0) / 1000;
  if (minimumKm > 0.5 && (routedKm < 0.75 * minimumKm || routedKm > Math.max(4, 4 * minimumKm))) return null;
  return points;
}

export async function roadAlignedBusPath(stops: LatLon[]): Promise<LatLon[] | null> {
  if (stops.length < 2 || stops.length > 35 || !stops.every(validLatLon)) return null;
  const key = stops.map(([lat, lon]) => lat.toFixed(5) + "," + lon.toFixed(5)).join(";");
  const existing = cache.get(key);
  if (existing) return existing;

  if (!configuredBase && demoRequests >= DEMO_MAX_SESSION_REQUESTS) return null;
  if (!configuredBase) demoRequests++;
  const job = requestQueue.then(async () => {
    // Queue all geometry lookups: at most one public demo request per second.
    const sleep = Math.max(0, lastCall + 1150 - Date.now());
    if (sleep) await new Promise((resolve) => setTimeout(resolve, sleep));
    lastCall = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const coordinates = stops.map(([lat, lon]) => `${lon},${lat}`).join(";");
      const url = `${BASE}/${coordinates}?overview=full&geometries=geojson&steps=false`;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      return decodeOsrmRoadGeometry((await response.json()) as OsrmResponse, stops);
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  });
  requestQueue = job.then(() => undefined, () => undefined);

  cache.set(key, job);
  if (cache.size > 30) cache.delete(cache.keys().next().value!);
  return job;
}
