import type { CanonicalItinerary } from "./engine";

export type RouteFilter = "All" | "Fastest" | "Metro" | "Bus" | "Suburban Rail" | "Mixed";

export const ROUTE_FILTERS: readonly RouteFilter[] = [
  "All",
  "Fastest",
  "Metro",
  "Bus",
  "Suburban Rail",
  "Mixed",
];

export function routeHighlights(options: CanonicalItinerary[]) {
  // A single option is not "fastest" without a comparison.
  const fastest =
    options.length > 1
      ? options.find((route) => route.isFastest) ??
        [...options].sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes)[0]
      : undefined;
  const withKnownFares = options.filter((route) =>
    route.fare.fareDataStatus !== "unavailable" && Number.isFinite(route.fare.totalFare),
  );
  const cheapest =
    withKnownFares.length > 1
      ? [...withKnownFares].sort((a, b) => a.fare.totalFare - b.fare.totalFare)[0]
      : undefined;
  const leastWalking =
    options.length > 1
      ? [...options].sort((a, b) => a.walkingMinutes - b.walkingMinutes)[0]
      : undefined;

  return {
    fastestId: fastest?.id,
    cheapestId: cheapest?.id,
    leastWalkingId: leastWalking?.id,
  };
}

/** Single-mode tabs are exclusive: a Bus + Metro route belongs to Mixed, not Bus. */
export function filterRouteOptions(
  options: CanonicalItinerary[],
  filter: RouteFilter,
): CanonicalItinerary[] {
  if (filter === "All") return [...options];
  if (filter === "Fastest") {
    const { fastestId } = routeHighlights(options);
    return fastestId ? options.filter((route) => route.id === fastestId) : [];
  }
  return options.filter((route) => route.mode === filter);
}

export function routeFilterCounts(options: CanonicalItinerary[]) {
  return Object.fromEntries(
    ROUTE_FILTERS.map((filter) => [filter, filterRouteOptions(options, filter).length]),
  ) as Record<RouteFilter, number>;
}
