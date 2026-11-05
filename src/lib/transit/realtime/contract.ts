import type {
  NormalizedArrival,
  NormalizedVehicle,
  RealtimeQuery,
  RealtimeSnapshot,
  RealtimeMode,
} from "./types";

export const MAX_REALTIME_AGE_MS = 90_000;
export const MAX_FUTURE_CLOCK_SKEW_MS = 30_000;
export const MAX_PREDICTION_HORIZON_MS = 3 * 60 * 60 * 1000;

export function isFreshObservation(
  timestamp: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!timestamp) return false;
  const t = Date.parse(timestamp);
  const age = now - t;
  return Number.isFinite(age) &&
    age >= -MAX_FUTURE_CLOCK_SKEW_MS &&
    age <= MAX_REALTIME_AGE_MS;
}

export function unavailableSnapshot(
  query: RealtimeQuery,
  reason = "No authorised realtime feed has been configured for this operator.",
): RealtimeSnapshot {
  return {
    status: "UNAVAILABLE",
    mode: query.mode,
    routeId: query.routeId,
    boardingStopIds: [...query.boardingStopIds],
    directionId: query.directionId ?? null,
    vehicles: [],
    arrivals: [],
    alerts: [],
    source: {
      provider: null,
      authorization: "NONE",
      fetchedAt: null,
      freshnessSeconds: null,
      reason,
    },
  };
}

/** Query validation protects provider adapters and avoids serving wrong modes. */
export function parseRealtimeQuery(params: URLSearchParams): RealtimeQuery | null {
  const mode = params.get("mode");
  const routeId = params.get("routeId")?.trim() ?? "";
  const rawStops = params.get("stopIds") ?? "";
  const direction = params.get("directionId") ?? undefined;
  const modePrefixes: Record<RealtimeMode, string> = {
    BUS: "MTC-", METRO: "CMRL-", SUBURBAN: "SRR-",
  };
  if (mode !== "BUS" && mode !== "METRO" && mode !== "SUBURBAN") return null;
  if (routeId.length > 150 || !routeId.startsWith(modePrefixes[mode])) return null;
  if (direction !== undefined && direction !== "0" && direction !== "1") return null;

  const stopIds = [...new Set(rawStops.split(",").map((x) => x.trim()).filter(Boolean))];
  if (stopIds.length < 1 || stopIds.length > 8 ||
      stopIds.some((x) => x.length > 150 || !x.startsWith(modePrefixes[mode]))) return null;
  return {
    mode,
    routeId,
    boardingStopIds: stopIds,
    ...(direction ? { directionId: direction } : {}),
  };
}

function matchingDirection(query: RealtimeQuery, direction: string | null) {
  return !query.directionId || direction === query.directionId;
}

export function filterAuthorisedSnapshot(
  snapshot: RealtimeSnapshot,
  query: RealtimeQuery,
  now = Date.now(),
): RealtimeSnapshot {
  if (
    snapshot.mode !== query.mode ||
    snapshot.routeId !== query.routeId ||
    snapshot.source.authorization === "NONE" ||
    !snapshot.source.provider?.trim() ||
    !isFreshObservation(snapshot.source.fetchedAt, now)
  ) {
    return unavailableSnapshot(query, "Realtime feed is missing authorisation, outdated, or does not match the requested route.");
  }

  const permittedStops = new Set(query.boardingStopIds);
  const vehicles: NormalizedVehicle[] = snapshot.vehicles
    .filter((v) =>
      v.routeId === query.routeId &&
      matchingDirection(query, v.directionId) &&
      v.latitude !== null && v.longitude !== null &&
      Number.isFinite(v.latitude) && Number.isFinite(v.longitude) &&
      Math.abs(v.latitude) <= 90 && Math.abs(v.longitude) <= 180 &&
      isFreshObservation(v.positionUpdatedAt, now))
    .map((v) => ({ ...v, status: "LIVE" }));

  const arrivals: NormalizedArrival[] = snapshot.arrivals.filter((a) => {
    if (a.routeId !== query.routeId ||
        !permittedStops.has(a.stopId) ||
        !matchingDirection(query, a.directionId) ||
        a.confidence !== "OFFICIAL_PREDICTION" ||
        !isFreshObservation(a.predictionUpdatedAt, now) ||
        !a.predictedArrivalTime) return false;
    const eta = Date.parse(a.predictedArrivalTime);
    return Number.isFinite(eta) &&
      eta >= now - MAX_FUTURE_CLOCK_SKEW_MS &&
      eta <= now + MAX_PREDICTION_HORIZON_MS;
  }).map((a) => ({ ...a, status: "LIVE" }));

  const alerts = snapshot.alerts.filter((a) =>
    a.routeIds.includes(query.routeId) ||
    a.stopIds.some((stopId) => permittedStops.has(stopId)),
  );

  const age = now - Date.parse(snapshot.source.fetchedAt!);
  const status = vehicles.length || arrivals.length ? "LIVE" : "UNAVAILABLE";
  return {
    ...snapshot,
    status,
    mode: query.mode,
    routeId: query.routeId,
    boardingStopIds: [...query.boardingStopIds],
    directionId: query.directionId ?? null,
    vehicles,
    arrivals,
    alerts,
    source: {
      ...snapshot.source,
      freshnessSeconds: Math.max(0, Math.round(age / 1000)),
      reason: status === "LIVE" ? "Authorised provider observations" : "No fresh, matching vehicle positions or official stop predictions",
    },
  };
}
