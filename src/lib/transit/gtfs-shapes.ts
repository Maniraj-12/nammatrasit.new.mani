/** Use directed GTFS shapes to draw the portion of a trip actually travelled.
 * GTFS shape_id is the published geographical alignment of a trip, not a
 * licence to interpolate straight lines between distant station coordinates.
 */
export type LatLon = [lat: number, lon: number];

export function geographicDistanceKm(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) *
      Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function validLatLon(p: LatLon | undefined): p is LatLon {
  return !!p && p.length === 2 &&
    Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    p[0] >= -90 && p[0] <= 90 && p[1] >= -180 && p[1] <= 180;
}

export function sliceGtfsShape(
  shape: LatLon[] | undefined,
  origin: LatLon | undefined,
  destination: LatLon | undefined,
  maximumStopDistanceKm = 0.65,
): LatLon[] | null {
  if (!shape || shape.length < 3 || !validLatLon(origin) || !validLatLon(destination)) return null;
  let i0 = -1, i1 = -1;
  let d0 = Infinity, d1 = Infinity;
  shape.forEach((point, i) => {
    if (!validLatLon(point)) return;
    const a = geographicDistanceKm(point, origin);
    const b = geographicDistanceKm(point, destination);
    if (a < d0) { d0 = a; i0 = i; }
    if (b < d1) { d1 = b; i1 = i; }
  });
  // A shape is directed and cannot safely be reversed for a different trip.
  if (i0 < 0 || i1 <= i0 || d0 > maximumStopDistanceKm || d1 > maximumStopDistanceKm) return null;
  const points = shape.slice(i0, i1 + 1);
  return points.length > 2 ? points : null;
}
