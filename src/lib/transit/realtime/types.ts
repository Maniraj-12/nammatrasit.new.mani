/**
 * Provider-neutral realtime transport contract.
 *
 * Route/stop IDs MUST be the identifiers in this project's ChennaiGTFS feed.
 * No public Chennai One / CUMTA / MTC / CMRL / CRIS live feed is connected
 * simply by defining this contract.
 */
export type RealtimeMode = "BUS" | "METRO" | "SUBURBAN";
export type RealtimeStatus = "LIVE" | "SCHEDULED" | "ESTIMATED" | "STALE" | "UNAVAILABLE";
export type ProviderAuthorization = "OFFICIAL_API" | "PERMITTED_FEED" | "NONE";

export type RealtimeQuery = {
  mode: RealtimeMode;
  routeId: string;
  boardingStopIds: string[];
  directionId?: "0" | "1";
};

export type NormalizedVehicle = {
  routeId: string;
  providerVehicleId: string | null;
  tripId: string | null;
  directionId: "0" | "1" | null;
  label: string | null;
  latitude: number | null;
  longitude: number | null;
  bearing: number | null;
  positionUpdatedAt: string | null;
  status: "LIVE" | "STALE";
};

export type NormalizedArrival = {
  routeId: string;
  stopId: string;
  tripId: string | null;
  directionId: "0" | "1" | null;
  predictedArrivalTime: string | null;
  scheduledArrivalTime: string | null;
  predictionUpdatedAt: string | null;
  delaySeconds: number | null;
  confidence: "OFFICIAL_PREDICTION" | "SCHEDULE" | "LOCAL_ESTIMATE";
  status: RealtimeStatus;
};

export type NormalizedServiceAlert = {
  routeIds: string[];
  stopIds: string[];
  header: string;
  description: string;
  cause: string | null;
  effect: string | null;
};

export type RealtimeSnapshot = {
  status: RealtimeStatus;
  mode: RealtimeMode;
  routeId: string;
  boardingStopIds: string[];
  directionId: "0" | "1" | null;
  vehicles: NormalizedVehicle[];
  arrivals: NormalizedArrival[];
  alerts: NormalizedServiceAlert[];
  source: {
    provider: string | null;
    authorization: ProviderAuthorization;
    fetchedAt: string | null;
    freshnessSeconds: number | null;
    reason: string;
  };
};
