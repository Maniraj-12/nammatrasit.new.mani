/** Values here are journey estimates, NOT live bus positions or actual arrivals. */
export type LocationPoint = [latitude: number, longitude: number];
export type TrafficLegInput = {
  mode: "Bus" | "Metro" | "Suburban Rail";
  routeId: string;
  baseMinutes: number;
  stops: LocationPoint[];
};
export type TrafficJourneyInput = {
  id: string;
  baselineTotalMinutes: number;
  legs: TrafficLegInput[];
};
export type TrafficCompareRequest = { journeys: TrafficJourneyInput[] };
export type TrafficResult = {
  id: string;
  status: "TRAFFIC_AWARE" | "NOT_APPLICABLE" | "UNAVAILABLE";
  baselineTotalMinutes: number;
  adjustedTotalMinutes: number | null;
  congestionAdjustmentMinutes: number | null;
  googleDriveMinutes: number | null;
  googleStaticDriveMinutes: number | null;
  checkedAt: string | null;
  message: string;
  /** Encoded Google Routes polylines; render ONLY on a Google Map. */
  googleBusRoutePolylines: string[];
};
export type TrafficCompareResponse = {
  provider: "Google Maps Routes API" | "TomTom Routing API v1" | null;
  requestedAt: string;
  sourceStatus: "LIVE_ROAD_TRAFFIC" | "UNAVAILABLE";
  journeys: TrafficResult[];
  /** True only if all MTC legs in all alternatives obtained live road conditions. */
  comparisonComplete: boolean;
  fastestId: string | null;
  disclaimer: string;
};
