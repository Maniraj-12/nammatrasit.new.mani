/** Approximate ticket price guidance for the full static GTFS network.
 *
 * These are NOT ticket-issuance amounts, never official verified prices.
 * - CMRL: historical 2021 GTFS fare_rules reference; current 2026 fare may differ.
 * - MTC: operator's 2018 stage-wise tariff, but bus stop count is NOT fare stages.
 *   We infer a rough fare-stage range from geographical distance; class unknown.
 * - SRR: published suburban distance slabs, approximate track km inferred
 *   from consecutive stop coordinates. Operator booking is authoritative.
 */
import type { CanonicalFare, FareComponent, JourneyLeg } from "./engine";
import type { FullGtfsIndex } from "./full-gtfs";

const MTC_ORDINARY = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 15, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24];
const MTC_EXPRESS = [7, 9, 10, 12, 13, 15, 16, 18, 19, 21, 22, 22, 24, 24, 25, 25, 27, 27, 28, 28, 30, 30, 31, 31, 33, 33, 34, 34, 35, 35];
const minmax = (a: number, b: number): [number, number] => a <= b ? [a, b] : [b, a];

export function coordinateDistanceKm(
  from: readonly [number | null, number | null],
  to: readonly [number | null, number | null],
): number {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function validFare(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}
function zoneKeys(index: FullGtfsIndex, id: number) {
  const station = index.data.stops[id];
  if (!station) return [];
  return [...new Set([station[0], station[5], station[0].replace(/_\d+$/, "")].filter(Boolean))];
}
function metroPrice(index: FullGtfsIndex, from: number, to: number): number | undefined {
  const fares = index.data.metroFareByZone ?? {};
  for (const a of zoneKeys(index, from)) {
    for (const b of zoneKeys(index, to)) {
      const amount = fares[a + "|" + b] ?? fares[b + "|" + a];
      if (validFare(amount) && amount > 0 && amount <= 50) return amount;
    }
  }
}

function suburbanFare(km: number) {
  if (km <= 20) return 5;
  if (km <= 45) return 10;
  if (km <= 70) return 15;
  if (km <= 100) return 20;
  return undefined;
}

function stepFare(index: FullGtfsIndex, leg: JourneyLeg, from: number, to: number) {
  if (leg.mode === "Metro") {
    const price = metroPrice(index, from, to);
    if (!validFare(price)) return null;
    return {
      min: price, max: price,
      source: "CMRL 2021 GTFS station-pair reference (historical)",
      detail: "Historical GTFS station-pair fare; current official CMRL table or ticketing checkout must confirm.",
    };
  }
  if (leg.mode === "Suburban Rail") {
    if (!Number.isFinite(leg.distanceKm) || leg.distanceKm <= 0) return null;
    const low = suburbanFare(leg.distanceKm * 0.9);
    const high = suburbanFare(leg.distanceKm * 1.2);
    if (!validFare(low) || !validFare(high)) return null;
    return {
      min: Math.min(low, high), max: Math.max(low, high),
      source: "CMDA/CMA suburban fare distance slabs (reference)",
      detail: "Approximate track distance inferred from GTFS stop coordinates; confirm at UTS/rail counter.",
    };
  }
  if (leg.mode === "Bus") {
    if (!Number.isFinite(leg.distanceKm) || leg.distanceKm <= 0) return null;
    // 2.5 km/stage is a *modelling assumption*, NOT an official MTC stage
    // mapping. Return a range using nearby stages and Ordinary/Express
    // tariff classes rather than inventing a single exact ticket amount.
    const guessed = Math.max(1, Math.min(30, Math.round(leg.distanceKm / 2.5)));
    const lowerStage = Math.max(1, guessed - 1);
    const upperStage = Math.min(30, guessed + 1);
    const [min, max] = minmax(MTC_ORDINARY[lowerStage - 1]!, MTC_EXPRESS[upperStage - 1]!);
    return {
      min, max,
      source: "MTC official stage tariff (effective 2018) with estimated stage count",
      detail: "Assumes Ordinary–Express service and ~2.5 km per fare stage, not an operator-verified stage map. Deluxe/AC may cost more; exact fare can differ.",
    };
  }
  return null;
}

/**
 * Fare calculation groups consecutive Metro legs as one through-journey
 * reference, but charges separately for each MTC bus boarding. Suburban
 * through-ticket continuation is grouped by consecutive mode.
 */
export function estimateFullGtfsFare(
  index: FullGtfsIndex,
  legs: JourneyLeg[],
  stopPairs: Array<[number, number]>,
): CanonicalFare {
  const missing: CanonicalFare = {
    totalFare: 0, components: [], fareDataStatus: "unavailable",
    fareSource: "A verified fare or suitable estimate is unavailable for one or more legs.",
    lastVerificationDate: "",
  };
  if (!legs.length || legs.length !== stopPairs.length) return missing;

  const groups: Array<{ leg: JourneyLeg; from: number; to: number }> = [];
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!;
    const pair = stopPairs[i]!;
    const last = groups[groups.length - 1];
    if (last && last.leg.mode === leg.mode && leg.mode !== "Bus") {
      last.to = pair[1];
      last.leg.distanceKm += leg.distanceKm;
      last.leg.to = leg.to;
    } else {
      groups.push({ leg: { ...leg }, from: pair[0], to: pair[1] });
    }
  }

  let min = 0, max = 0;
  const components: FareComponent[] = [];
  const sources = new Set<string>();
  for (const group of groups) {
    const price = stepFare(index, group.leg, group.from, group.to);
    if (!price) return missing;
    const middle = Math.round((price.min + price.max) / 2);
    min += price.min;
    max += price.max;
    sources.add(price.source);
    components.push({
      leg: group.leg.from + " → " + group.leg.to,
      mode: group.leg.mode,
      amount: middle,
      minFare: price.min,
      maxFare: price.max,
      ticketType: "Indicative fare — not verified",
      notes: price.detail,
    });
  }
  return {
    totalFare: Math.round((min + max) / 2),
    estimateRange: { min, max },
    components,
    fareDataStatus: "estimated",
    fareSource: [...sources].join("; "),
    lastVerificationDate: "",
    discountNote: "Fare estimate only. Confirm with operator before travel.",
  };
}
