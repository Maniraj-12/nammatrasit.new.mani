/**
 * Keep only genuinely different physical journeys in GTFS route results.
 *
 * The unified feed includes several services/trip variants that overlap on
 * identical rail infrastructure. A trip ID or route ID difference alone
 * must NOT create a new "route alternative" for the passenger.
 *
 * Use ordered stop coordinates (not just names/route IDs) to avoid merging
 * different paths between the same origin and destination.
 * Distinct MTC bus numbers and multimodal orders remain separate options.
 */
import type { CanonicalItinerary } from "./engine";

type Point = [lat: number, lon: number];
type Trace = Point[];
const EARTH_KM = 6371;

function km(a: Point, b: Point): number {
  const toRad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toRad;
  const dLon = (b[1] - a[1]) * toRad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a[0] * toRad) * Math.cos(b[0] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
function valid(p: Point) {
  return p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
    && p[0] >= -90 && p[0] <= 90 && p[1] >= -180 && p[1] <= 180;
}

function trace(it: CanonicalItinerary): Trace {
  const output: Trace = [];
  for (const leg of it.legs) {
    for (const p of leg.stopCoordinates ?? []) {
      if (!valid(p)) continue;
      if (!output.length || km(output[output.length - 1]!, p) > 0.015) output.push(p);
    }
  }
  return output;
}

function samplePath(points: Trace, count = 9): Trace {
  if (points.length < 2) return [];
  const distance: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    distance.push(distance[i - 1]! + km(points[i - 1]!, points[i]!));
  }
  const total = distance[distance.length - 1]!;
  if (total <= 0.015) return [];
  const result: Trace = [];
  let edge = 1;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (edge < distance.length - 1 && distance[edge]! < target) edge++;
    const left = edge - 1;
    const length = distance[edge]! - distance[left]!;
    const ratio = length > 0 ? (target - distance[left]!) / length : 0;
    result.push([
      points[left]![0] + (points[edge]![0] - points[left]![0]) * ratio,
      points[left]![1] + (points[edge]![1] - points[left]![1]) * ratio,
    ]);
  }
  return result;
}

function modes(it: CanonicalItinerary) {
  return it.legs.reduce<string[]>((out, leg) => {
    if (out[out.length - 1] !== leg.mode) out.push(leg.mode);
    return out;
  }, []).join("|");
}
function busIdentity(it: CanonicalItinerary) {
  return it.legs
    .filter((leg) => leg.mode === "Bus")
    .map((leg) => leg.routeId)
    .join("|");
}

/** Structural fallback when coordinate geometry is missing. */
function stopSignature(it: CanonicalItinerary) {
  const clean = (name: string) => name.toLowerCase()
    .replace(/\b(?:metro|station|railway|bus stop)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return it.legs.flatMap((leg) => leg.stops).map(clean)
    .filter((x, i, xs) => i === 0 || x !== xs[i - 1])
    .join("|");
}

export function samePhysicalJourney(a: CanonicalItinerary, b: CanonicalItinerary): boolean {
  if (a.mode !== b.mode || modes(a) !== modes(b)) return false;
  if (busIdentity(a) !== busIdentity(b)) return false;

  const aa = samplePath(trace(a));
  const bb = samplePath(trace(b));
  if (aa.length && bb.length) {
    // Same termini and nearly the same route corridor; not just similar ETA.
    const ds = aa.map((point, i) => km(point, bb[i]!));
    const avg = ds.reduce((sum, d) => sum + d, 0) / ds.length;
    return ds[0]! <= 0.65 && ds[ds.length - 1]! <= 0.65
      && avg <= 0.42 && Math.max(...ds) <= 0.95;
  }
  return stopSignature(a) === stopSignature(b);
}

export function deduplicatePhysicalJourneys(
  candidates: CanonicalItinerary[],
  maxResults = candidates.length,
): CanonicalItinerary[] {
  // Prefer the quickest estimate, then fewer boardings and less walking.
  const ranked = [...candidates].sort((a, b) =>
    a.totalDurationMinutes - b.totalDurationMinutes
      || a.transferCount - b.transferCount
      || a.walkingMinutes - b.walkingMinutes,
  );
  const unique: CanonicalItinerary[] = [];
  const seenIds = new Set<string>();
  for (const route of ranked) {
    // Guard against colliding GTFS IDs in the imported route variants.
    if (seenIds.has(route.id) || unique.some((old) => samePhysicalJourney(old, route))) continue;
    unique.push(route);
    seenIds.add(route.id);
    if (unique.length >= maxResults) break;
  }
  return unique;
}
