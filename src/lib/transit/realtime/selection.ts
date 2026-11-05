import type { JourneyLeg } from "../engine";
import type { RealtimeMode, RealtimeQuery, RealtimeSnapshot } from "./types";
import { unavailableSnapshot } from "./contract";

const modes: Record<string, RealtimeMode | undefined> = {
  Bus: "BUS", Metro: "METRO", "Suburban Rail": "SUBURBAN",
};
const prefixes: Record<RealtimeMode, string> = {
  BUS: "MTC-", METRO: "CMRL-", SUBURBAN: "SRR-",
};

/** Route and boarding IDs must come from the same GTFS leg; no name-only match. */
export function realtimeQueryForLeg(leg: JourneyLeg): RealtimeQuery | null {
  const mode = modes[leg.mode];
  if (!mode || !leg.routeId || !leg.boardingStopId) return null;
  const prefix = prefixes[mode];
  if (!leg.routeId.startsWith(prefix) || !leg.boardingStopId.startsWith(prefix)) return null;
  return {
    mode, routeId: leg.routeId, boardingStopIds: [leg.boardingStopId],
    ...(leg.directionId === "0" || leg.directionId === "1"
      ? { directionId: leg.directionId } : {}),
  };
}

export async function checkSelectedRealtime(
  query: RealtimeQuery,
  fetcher: typeof fetch = fetch,
): Promise<RealtimeSnapshot> {
  const params = new URLSearchParams({
    mode: query.mode,
    routeId: query.routeId,
    stopIds: query.boardingStopIds.join(","),
    ...(query.directionId ? { directionId: query.directionId } : {}),
  });
  try {
    const res = await fetcher("/api/realtime?" + params.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return unavailableSnapshot(query, "Real-time server endpoint is not reachable in this preview.");
    const result = (await res.json()) as RealtimeSnapshot;
    if (!result || result.routeId !== query.routeId || result.mode !== query.mode) {
      return unavailableSnapshot(query, "Real-time service returned data for a different route.");
    }
    return result;
  } catch {
    return unavailableSnapshot(query, "The app preview could not reach its real-time server endpoint.");
  }
}
