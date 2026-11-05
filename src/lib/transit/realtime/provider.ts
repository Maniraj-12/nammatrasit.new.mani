import type { RealtimeQuery, RealtimeSnapshot, RealtimeMode } from "./types";
import { filterAuthorisedSnapshot, unavailableSnapshot } from "./contract";

/**
 * No agency feed is enabled without verified permission, documented endpoints,
 * and a tested route/trip/stop ID mapping. This is deliberately fail-closed.
 */
export interface RealtimeProviderAdapter {
  readonly mode: RealtimeMode;
  readonly provider: string;
  getSnapshot(query: RealtimeQuery): Promise<RealtimeSnapshot>;
}

export type AdapterRegistry = Partial<Record<RealtimeMode, RealtimeProviderAdapter>>;

/** Inject an authorised provider after permission and integration testing. */
export async function getRealtimeSnapshot(
  query: RealtimeQuery,
  adapters: AdapterRegistry = {},
  now = Date.now(),
): Promise<RealtimeSnapshot> {
  const provider = adapters[query.mode];
  if (!provider || provider.mode !== query.mode) {
    return unavailableSnapshot(query);
  }
  try {
    const snapshot = await provider.getSnapshot(query);
    return filterAuthorisedSnapshot(snapshot, query, now);
  } catch {
    // Never leak API keys, provider errors or upstream URLs in commuter UI.
    return unavailableSnapshot(query, "Realtime provider temporarily unavailable.");
  }
}

/** Intentionally disabled: passenger-facing apps are not permission to scrape. */
export function configuredRealtimeAdapters(): AdapterRegistry {
  return {};
}
