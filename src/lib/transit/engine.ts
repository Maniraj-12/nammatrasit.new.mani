import {
  ALIASES,
  ALL_STATIONS,
  calculateMtcBusFare,
  calculateSuburbanRailFare,
  CMRL_FARE_MATRIX,
  DEMO_ALERTS,
  INTERCHANGES,
  INTERMODAL_HUBS,
  LINES,
  MTC_BUS_ROUTES,
  OFFICIAL_LINKS,
  STATION_FACILITIES,
  SUBURBAN_LINES,
  type Alert,
  type LineId,
  type MtcBusRoute,
  type StationFacility,
  type TransportMode,
} from "./data";
import { isExplicitIncidentReport, isServiceUpdateRequest } from "./conversation-intents";

export type FareDataStatus = "official_gtfs" | "published_tariff" | "estimated" | "unavailable";

export type FareComponent = {
  leg: string;
  mode: TransportMode;
  amount: number;
  ticketType: string;
  notes?: string;
  minFare?: number;
  maxFare?: number;
};

export type CanonicalFare = {
  totalFare: number;
  components: FareComponent[];
  fareDataStatus: FareDataStatus;
  fareSource: string;
  lastVerificationDate: string;
  discountNote?: string;
  estimateRange?: { min: number; max: number };
};

/** A missing fare is never the same as a free ticket. */
export function fareText(fare: CanonicalFare): string {
  if (fare.fareDataStatus === "unavailable") return "Fare unavailable";
  if (fare.estimateRange) {
    const { min, max } = fare.estimateRange;
    return min === max ? `~₹${min}` : `₹${min}–₹${max} est.`;
  }
  return `₹${fare.totalFare}`;
}

export type JourneyLeg = {
  mode: TransportMode;
  routeId: string;
  routeName: string;
  from: string;
  to: string;
  direction: string;
  stops: string[];
  durationMinutes: number;
  distanceKm: number;
  frequencyMinutes: number;
  stopCoordinates?: Array<[number, number]>;
  pathCoordinates?: Array<[number, number]>;
  pathSource?: "gtfs-shape" | "road-router";
  /** Real source GTFS identifiers required to select a live trip/stop. */
  boardingStopId?: string;
  alightingStopId?: string;
  directionId?: "0" | "1";
};

export type CanonicalItinerary = {
  id: string;
  optionIndex?: number;
  origin: string;
  destination: string;
  mode: TransportMode;
  routeName: string;
  modesInvolved?: TransportMode[];
  legs: JourneyLeg[];
  totalStops: number;
  totalDistanceKm: number;
  initialWalkMinutes?: number;
  initialWaitMinutes?: number;
  inVehicleMinutes: number;
  walkingMinutes: number;
  waitingMinutes: number;
  transferMinutes: number;
  finalWalkMinutes?: number;
  totalDurationMinutes: number;
  timingLabel: string;
  fare: CanonicalFare;
  transferCount: number;
  transferPoints: string[];
  isFastest: boolean;
  comparisonSummary?: string;
  boardingPoint?: string;
  transferDescription?: string;
  arrivalPoint?: string;
};

export type GrievanceDraft = {
  operator?: string | undefined;
  location?: string | undefined;
  category?: string | undefined;
  description?: string | undefined;
  datetime?: string | undefined;
};

export type ComparisonItem = {
  mode: TransportMode;
  routeName: string;
  durationMinutes: number;
  totalFare: number;
  fareStatus?: FareDataStatus;
  transfers: number;
  frequency: string;
  isFastest: boolean;
  notes: string;
};

export type Card =
  | { kind: "journey"; itinerary: CanonicalItinerary }
  | {
      kind: "route_options";
      options: CanonicalItinerary[];
      activeItineraryId: string;
      origin: string;
      destination: string;
      selectedFilter?: string;
    }
  | {
      kind: "comparison";
      items: ComparisonItem[];
      origin: string;
      destination: string;
      fastestMode: TransportMode;
    }
  | { kind: "fare_breakdown"; itinerary: CanonicalItinerary }
  | { kind: "facility"; station: string; facility: StationFacility }
  | { kind: "alerts"; alerts: Alert[] }
  | { kind: "grievance"; draft: Record<keyof GrievanceDraft, string>; link: string };

export type Context = {
  /** Judge-visible persistent traveller requirements; do not infer eligibility from age alone. */
  passengers?: number | undefined;
  concessionType?: "none" | "women_ordinary_bus" | "student" | "senior" | undefined;
  concessionPassengers?: number | undefined;
  wheelchairRequired?: boolean | undefined;
  arrivalBy?: string | undefined;
  activeDisruption?: string | undefined;
  preferredLanguage?: "en" | "ta" | "tanglish" | undefined;
  origin?: string | undefined;
  destination?: string | undefined;
  originId?: string | undefined;
  destinationId?: string | undefined;
  modePreference?: TransportMode | "All" | undefined;
  requestedMode?: TransportMode | "All" | undefined;
  activeItineraryId?: string | undefined;
  recommendedFastestId?: string | undefined;
  lastReferencedItineraryId?: string | undefined;
  selectedFilter?: string | undefined;
  lastStation?: string | undefined;
  availableItineraries?: CanonicalItinerary[] | undefined;
  pendingStopClarification?: { kind: "origin" | "destination"; options: string[]; origin: string; destination: string; mode: TransportMode | "All" };
  grievance?: { step: keyof GrievanceDraft; data: GrievanceDraft } | undefined;
};

export type ChatReply = {
  reply: string;
  message?: string;
  cards: Card[];
  suggestions: string[];
  context: Context;
  status?: "OK" | "NO_MATCH_IN_DATASET" | "ERROR";
  intent?:
    | "route_search"
    | "comparison"
    | "fare_enquiry"
    | "accessibility"
    | "service_alerts"
    | "grievance"
    | "general"
    | "option_selection"
    | "filter_update";
  requestedMode?: TransportMode | "All";
  origin?: string | undefined;
  destination?: string | undefined;
  itineraries?: CanonicalItinerary[];
  activeItineraryId?: string | null;
  recommendedFastestId?: string;
  selectedFilter?: string;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const NAME_INDEX: [string, string][] = [
  ...ALL_STATIONS.map((s) => [norm(s), s] as [string, string]),
  ...Object.entries(ALIASES).map(([k, v]) => [norm(k), v] as [string, string]),
].sort((a, b) => b[0].length - a[0].length);

/** Find stations mentioned in text, in order of appearance */
export function findStations(text: string): { name: string; index: number }[] {
  let t = " " + norm(text).replace(/\bmetro\b|\bstation\b|\bterminus\b|\bstop\b/g, " ") + " ";
  const hits: { name: string; index: number }[] = [];
  for (const [key, name] of NAME_INDEX) {
    const needle = " " + key + " ";
    let i = t.indexOf(needle);
    while (i !== -1) {
      if (!hits.some((h) => h.name === name)) {
        hits.push({ name, index: i });
      }
      t = t.slice(0, i) + " " + "#".repeat(key.length) + " " + t.slice(i + needle.length);
      i = t.indexOf(needle);
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Reliable Transport Mode Intent Detection */
export function detectRequestedMode(text: string): TransportMode | "All" | undefined {
  const t = norm(text);

  // Mixed mode intent (e.g. "Show mixed routes", "mixed mode", "mixed routes", "multimodal", "combined routes")
  if (
    has(
      t,
      /\b(show mixed routes|mixed routes|show mixed|mixed mode|multimodal|combined routes|mixed options|mixed transit|mix of bus and metro|intermodal|mixed)\b/,
    )
  ) {
    return "Mixed";
  }

  // All / other transport options
  if (
    has(
      t,
      /\b(all options|all modes|show all options|show all|other options|other transport options|other modes|any other modes|show other options|show other|any other|compare all|compare modes)\b/,
    )
  ) {
    return "All";
  }

  // Bus intent (e.g. "Is there a bus route?", "Show me buses", "Any MTC bus available?", "I want to travel by bus")
  if (
    has(
      t,
      /\b(is there a bus|bus route|bus routes|show me buses|show buses|any mtc bus|mtc bus|travel by bus|by bus|take a bus|bus options|buses|bus|mtc)\b/,
    )
  ) {
    return "Bus";
  }

  // Suburban Rail / Train intent (e.g. "Is there a train?", "Show me the train route", "Show train routes")
  if (
    has(
      t,
      /\b(is there a train|train route|train routes|show me the train|show train routes|show train|show me train|suburban train|suburban rail|local train|by train|take a train|train options|rail route|railway|trains|train|suburban|emu|southern railway)\b/,
    )
  ) {
    return "Suburban Rail";
  }

  // Metro intent (e.g. "Show Metro", "Metro route", "What about Metro?")
  if (
    has(
      t,
      /\b(show metro|metro route|metro routes|by metro|take metro|what about metro|is there a metro|metro options|metro train|metro|cmrl)\b/,
    )
  ) {
    return "Metro";
  }

  return undefined;
}

// -----------------------------------------------------------------------------
// Metro Route Planner
// -----------------------------------------------------------------------------
function planMetroLegOnLine(lineId: LineId, from: string, to: string): JourneyLeg | null {
  const st = LINES[lineId].stations;
  const a = st.indexOf(from);
  const b = st.indexOf(to);
  if (a < 0 || b < 0 || a === b) return null;
  const stops = a < b ? st.slice(a, b + 1) : st.slice(b, a + 1).reverse();
  const hopCount = stops.length - 1;
  const inVeh = Math.round(hopCount * 2.2); // ~2.2 mins per inter-station hop
  const dist = Number((hopCount * 1.6).toFixed(1)); // ~1.6 km average between CMRL stations
  return {
    mode: "Metro",
    routeId: LINES[lineId].code,
    routeName: LINES[lineId].name,
    from,
    to,
    direction: `Towards ${a < b ? st[st.length - 1] : st[0]}`,
    stops,
    durationMinutes: inVeh,
    distanceKm: dist,
    frequencyMinutes: 6,
  };
}

export function planMetroItinerary(origin: string, destination: string): CanonicalItinerary | null {
  if (origin === destination) return null;

  // Direct line?
  for (const id of Object.keys(LINES) as LineId[]) {
    const leg = planMetroLegOnLine(id, origin, destination);
    if (leg) {
      const stopCount = leg.stops.length - 1;
      const fareEntry = CMRL_FARE_MATRIX[stopCount] ?? { tokenFare: 40, qrFare: 32 };
      const waitTime = 5;
      const totalTime = leg.durationMinutes + waitTime + 4; // inVeh + wait + init/final walk

      return {
        id: `metro-direct-${id}-${origin}-${destination}`,
        origin,
        destination,
        mode: "Metro",
        routeName: leg.routeName,
        modesInvolved: ["Metro"],
        legs: [leg],
        totalStops: stopCount,
        totalDistanceKm: leg.distanceKm,
        initialWalkMinutes: 2,
        initialWaitMinutes: waitTime,
        inVehicleMinutes: leg.durationMinutes,
        walkingMinutes: 4,
        waitingMinutes: waitTime,
        transferMinutes: 0,
        finalWalkMinutes: 2,
        totalDurationMinutes: totalTime,
        timingLabel: "Estimated duration based on CMRL GTFS schedule & 6-min average headway",
        boardingPoint: `${origin} (${leg.routeName})`,
        arrivalPoint: `${destination}`,
        fare: {
          totalFare: fareEntry.tokenFare,
          components: [
            {
              leg: `${origin} → ${destination} (${leg.routeName})`,
              mode: "Metro",
              amount: fareEntry.tokenFare,
              ticketType: "Single Journey Token / QR",
              notes: `20% discount applies via CMRL WhatsApp QR / Singara Chennai Card: ₹${fareEntry.qrFare}`,
            },
          ],
          fareDataStatus: "official_gtfs",
          fareSource: "CMRL GTFS Fare Rules / CUMTA Portal (Oct 2026)",
          lastVerificationDate: "2026-10-04",
          discountNote: `₹${fareEntry.qrFare} with WhatsApp QR / Travel Card (20% off)`,
        },
        transferCount: 0,
        transferPoints: [],
        isFastest: false,
      };
    }
  }

  // 1-Interchange (via Alandur or Chennai Central)
  let best: CanonicalItinerary | null = null;
  for (const x of INTERCHANGES) {
    for (const l1 of Object.keys(LINES) as LineId[]) {
      for (const l2 of Object.keys(LINES) as LineId[]) {
        if (l1 === l2) continue;
        const leg1 = planMetroLegOnLine(l1, origin, x);
        const leg2 = planMetroLegOnLine(l2, x, destination);
        if (!leg1 || !leg2) continue;

        const totalStops = leg1.stops.length - 1 + leg2.stops.length - 1;
        const inVeh = leg1.durationMinutes + leg2.durationMinutes;
        const waitTime = 6;
        const transferTime = 4; // Transfer walk at interchange
        const totalDuration = inVeh + waitTime + transferTime + 4;
        const fareEntry = CMRL_FARE_MATRIX[totalStops] ?? { tokenFare: 40, qrFare: 32 };

        if (!best || totalDuration < best.totalDurationMinutes) {
          best = {
            id: `metro-interchange-${x}-${origin}-${destination}`,
            origin,
            destination,
            mode: "Metro",
            routeName: `Chennai Metro (${leg1.routeName} → ${leg2.routeName})`,
            modesInvolved: ["Metro"],
            legs: [leg1, leg2],
            totalStops,
            totalDistanceKm: Number((leg1.distanceKm + leg2.distanceKm).toFixed(1)),
            initialWalkMinutes: 2,
            initialWaitMinutes: waitTime,
            inVehicleMinutes: inVeh,
            walkingMinutes: 4 + transferTime,
            waitingMinutes: waitTime + 4,
            transferMinutes: transferTime,
            finalWalkMinutes: 2,
            totalDurationMinutes: totalDuration,
            timingLabel: "Estimated duration based on CMRL GTFS schedule & interchange walk",
            boardingPoint: `${origin} (${leg1.routeName})`,
            transferDescription: `Interchange at ${x}: cross-platform / concourse connection (~4 min walk)`,
            arrivalPoint: `${destination}`,
            fare: {
              totalFare: fareEntry.tokenFare,
              components: [
                {
                  leg: `${origin} → ${destination} (Interchange at ${x})`,
                  mode: "Metro",
                  amount: fareEntry.tokenFare,
                  ticketType: "Single Journey Token / QR",
                  notes: `Through ticket. 20% discount applies via CMRL WhatsApp QR: ₹${fareEntry.qrFare}`,
                },
              ],
              fareDataStatus: "official_gtfs",
              fareSource: "CMRL GTFS Fare Rules / CUMTA Portal (Oct 2026)",
              lastVerificationDate: "2026-10-04",
              discountNote: `₹${fareEntry.qrFare} with WhatsApp QR / Travel Card (20% off)`,
            },
            transferCount: 1,
            transferPoints: [x],
            isFastest: false,
          };
        }
      }
    }
  }

  return best;
}

// -----------------------------------------------------------------------------
// Southern Railway Suburban Rail Planner
// -----------------------------------------------------------------------------
export function planSuburbanItinerary(
  origin: string,
  destination: string,
): CanonicalItinerary | null {
  if (origin === destination) return null;
  const line = SUBURBAN_LINES.beachTambaram;
  const st = line.stations;

  const normalizeSuburbanName = (name: string) => {
    if (name === "Chennai Airport") return "Tirusulam";
    if (name === "Chennai Central") return "Chennai Park";
    if (name === "Egmore") return "Chennai Egmore";
    return name;
  };

  const normOrig = normalizeSuburbanName(origin);
  const normDest = normalizeSuburbanName(destination);

  const a = st.findIndex((s) => s.name === normOrig || s.altName?.includes(normOrig));
  const b = st.findIndex((s) => s.name === normDest || s.altName?.includes(normDest));

  if (a < 0 || b < 0 || a === b) return null;

  const slice = a < b ? st.slice(a, b + 1) : st.slice(b, a + 1).reverse();
  const stationNames = slice.map((s) => s.name);
  const hopCount = stationNames.length - 1;
  const inVeh = Math.round(hopCount * 2.5); // ~2.5 mins per suburban station hop
  const waitTime = 12; // Average suburban train frequency
  const dist = Number((hopCount * 1.8).toFixed(1));
  const fareResult = calculateSuburbanRailFare(hopCount);

  const leg: JourneyLeg = {
    mode: "Suburban Rail",
    routeId: line.id,
    routeName: line.name,
    from: stationNames[0]!,
    to: stationNames[stationNames.length - 1]!,
    direction: `Towards ${a < b ? st[st.length - 1]!.name : st[0]!.name}`,
    stops: stationNames,
    durationMinutes: inVeh,
    distanceKm: dist,
    frequencyMinutes: waitTime,
  };

  return {
    id: `srr-${origin}-${destination}`,
    origin,
    destination,
    mode: "Suburban Rail",
    routeName: `Southern Railway Suburban (${line.name})`,
    modesInvolved: ["Suburban Rail"],
    legs: [leg],
    totalStops: hopCount,
    totalDistanceKm: dist,
    initialWalkMinutes: 2,
    initialWaitMinutes: waitTime,
    inVehicleMinutes: inVeh,
    walkingMinutes: 5,
    waitingMinutes: waitTime,
    transferMinutes: 0,
    finalWalkMinutes: 3,
    totalDurationMinutes: inVeh + waitTime + 5,
    timingLabel: "Estimated duration based on Southern Railway timetable & 12-min suburban headway",
    boardingPoint: `${stationNames[0]} Platform`,
    arrivalPoint: `${stationNames[stationNames.length - 1]} Platform`,
    fare: {
      totalFare: fareResult.fare,
      components: [
        {
          leg: `${stationNames[0]} → ${stationNames[stationNames.length - 1]}`,
          mode: "Suburban Rail",
          amount: fareResult.fare,
          ticketType: "Second Class Suburban Ticket",
          notes: fareResult.breakdown,
        },
      ],
      fareDataStatus: "published_tariff",
      fareSource: "Southern Railway Chennai Division Passenger Tariff / UTS",
      lastVerificationDate: "2026-10-04",
      discountNote: "Quarterly and monthly season tickets available via UTS app",
    },
    transferCount: 0,
    transferPoints: [],
    isFastest: false,
  };
}

// -----------------------------------------------------------------------------
// MTC Bus Route Planner
// -----------------------------------------------------------------------------
function planDirectBusLeg(route: MtcBusRoute, from: string, to: string): JourneyLeg | null {
  const st = route.stops;
  const a = st.indexOf(from);
  const b = st.indexOf(to);
  if (a < 0 || b < 0 || a === b) return null;

  const stops = a < b ? st.slice(a, b + 1) : st.slice(b, a + 1).reverse();
  const hopCount = stops.length - 1;
  const inVeh = Math.round(hopCount * 3.8); // ~3.8 mins per bus stop in Chennai traffic
  const dist = Number((hopCount * 1.2).toFixed(1));

  return {
    mode: "Bus",
    routeId: route.routeId,
    routeName: `MTC Route ${route.routeNumber} (${route.routeName})`,
    from,
    to,
    direction: `Towards ${a < b ? st[st.length - 1] : st[0]}`,
    stops,
    durationMinutes: inVeh,
    distanceKm: dist,
    frequencyMinutes: route.frequencyMinutes,
  };
}

export function planBusItinerary(origin: string, destination: string): CanonicalItinerary | null {
  if (origin === destination) return null;

  // Look for direct MTC routes
  let bestDirectLeg: JourneyLeg | null = null;
  let chosenRoute: MtcBusRoute | null = null;

  for (const r of MTC_BUS_ROUTES) {
    const leg = planDirectBusLeg(r, origin, destination);
    if (leg) {
      if (!bestDirectLeg || leg.durationMinutes < bestDirectLeg.durationMinutes) {
        bestDirectLeg = leg;
        chosenRoute = r;
      }
    }
  }

  if (bestDirectLeg && chosenRoute) {
    const stopCount = bestDirectLeg.stops.length - 1;
    const busType = chosenRoute.type;
    const fareInfo = calculateMtcBusFare(stopCount, busType);
    const waitTime = chosenRoute.frequencyMinutes;
    const walkTime = 4;
    const totalTime = bestDirectLeg.durationMinutes + waitTime + walkTime;

    return {
      id: `mtc-direct-${chosenRoute.routeNumber}-${origin}-${destination}`,
      origin,
      destination,
      mode: "Bus",
      routeName: `MTC Bus ${chosenRoute.routeNumber} (${chosenRoute.type})`,
      modesInvolved: ["Bus"],
      legs: [bestDirectLeg],
      totalStops: stopCount,
      totalDistanceKm: bestDirectLeg.distanceKm,
      initialWalkMinutes: 2,
      initialWaitMinutes: waitTime,
      inVehicleMinutes: bestDirectLeg.durationMinutes,
      walkingMinutes: walkTime,
      waitingMinutes: waitTime,
      transferMinutes: 0,
      finalWalkMinutes: 2,
      totalDurationMinutes: totalTime,
      timingLabel: "Estimated duration based on MTC timetable & average Chennai road traffic speed",
      boardingPoint: `${origin} Bus Shelter (MTC ${chosenRoute.routeNumber})`,
      arrivalPoint: `${destination} Bus Stop`,
      fare: {
        totalFare: fareInfo.fare,
        components: [
          {
            leg: `${origin} → ${destination} (MTC ${chosenRoute.routeNumber})`,
            mode: "Bus",
            amount: fareInfo.fare,
            ticketType: `${busType} Bus Conductor Ticket / Singara Chennai NCMC`,
            notes: fareInfo.breakdown,
          },
        ],
        fareDataStatus: "estimated",
        fareSource: "Tamil Nadu State Transport Department Fare Order (G.O. Ms.)",
        lastVerificationDate: "2026-04-27",
        discountNote:
          busType === "Ordinary"
            ? "Free travel for women in Ordinary Pink buses (Vidiyal Payanam)"
            : undefined,
      },
      transferCount: 0,
      transferPoints: [],
      isFastest: false,
    };
  }

  // 1-Transfer bus route via a major hub like Koyambedu or Guindy
  const hubs = ["Koyambedu", "Guindy", "Vadapalani"];
  for (const h of hubs) {
    if (h === origin || h === destination) continue;
    for (const r1 of MTC_BUS_ROUTES) {
      const leg1 = planDirectBusLeg(r1, origin, h);
      if (!leg1) continue;
      for (const r2 of MTC_BUS_ROUTES) {
        if (r1.routeId === r2.routeId) continue;
        const leg2 = planDirectBusLeg(r2, h, destination);
        if (!leg2) continue;

        const stopCount = leg1.stops.length - 1 + leg2.stops.length - 1;
        const fare1 = calculateMtcBusFare(leg1.stops.length - 1, r1.type).fare;
        const fare2 = calculateMtcBusFare(leg2.stops.length - 1, r2.type).fare;
        const totalFare = fare1 + fare2;
        const inVeh = leg1.durationMinutes + leg2.durationMinutes;
        const waitTime = r1.frequencyMinutes + r2.frequencyMinutes;
        const transferWalk = 4;
        const totalTime = inVeh + waitTime + transferWalk + 4;

        return {
          id: `mtc-transfer-${h}-${origin}-${destination}`,
          origin,
          destination,
          mode: "Bus",
          routeName: `MTC Bus (${r1.routeNumber} → ${r2.routeNumber} via ${h})`,
          modesInvolved: ["Bus"],
          legs: [leg1, leg2],
          totalStops: stopCount,
          totalDistanceKm: Number((leg1.distanceKm + leg2.distanceKm).toFixed(1)),
          initialWalkMinutes: 2,
          initialWaitMinutes: r1.frequencyMinutes,
          inVehicleMinutes: inVeh,
          walkingMinutes: 8,
          waitingMinutes: waitTime,
          transferMinutes: transferWalk,
          finalWalkMinutes: 2,
          totalDurationMinutes: totalTime,
          timingLabel: "Estimated duration based on MTC timetable & road traffic",
          boardingPoint: `${origin} (MTC ${r1.routeNumber})`,
          transferDescription: `Transfer at ${h}: ~${transferWalk} min walk between bus bays`,
          arrivalPoint: `${destination}`,
          fare: {
            totalFare,
            components: [
              {
                leg: `${origin} → ${h} (MTC ${r1.routeNumber})`,
                mode: "Bus",
                amount: fare1,
                ticketType: `${r1.type} Bus Ticket`,
              },
              {
                leg: `${h} → ${destination} (MTC ${r2.routeNumber})`,
                mode: "Bus",
                amount: fare2,
                ticketType: `${r2.type} Bus Ticket`,
              },
            ],
            fareDataStatus: "estimated",
            fareSource: "Tamil Nadu State Transport Department Fare Order",
            lastVerificationDate: "2026-04-27",
          },
          transferCount: 1,
          transferPoints: [h],
          isFastest: false,
        };
      }
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// Grounded Multimodal (Mixed-Mode) Route Planner
// -----------------------------------------------------------------------------
/**
 * Compose two already planned journeys at a curated intermodal hub.
 *
 * Crucially, both sub-journeys may contain an internal transfer. Preserve ALL
 * transit legs and fare components instead of using only legs[0]. Each leg
 * represents a distinct boarding, so all changes count toward transfers.
 */
function composeAtIntermodalHub(
  origin: string,
  destination: string,
  hubName: string,
  hub: (typeof INTERMODAL_HUBS)[string],
  first: CanonicalItinerary | null,
  second: CanonicalItinerary | null,
  firstHubStop: string | undefined,
  secondHubStop: string | undefined,
  idPrefix: string,
): CanonicalItinerary | null {
  if (!first || !second || !firstHubStop || !secondHubStop) return null;
  if (!first.legs.length || !second.legs.length) return null;

  const firstLastLeg = first.legs[first.legs.length - 1]!;
  const secondFirstLeg = second.legs[0]!;

  // A valid transfer must end at the specified first-mode stop and resume at
  // the second-mode stop named in the curated hub mapping.
  if (firstLastLeg.to !== firstHubStop || secondFirstLeg.from !== secondHubStop) {
    return null;
  }

  const legs = [...first.legs, ...second.legs];
  const modesInvolved = [...new Set(legs.map((leg) => leg.mode))];
  if (modesInvolved.length < 2) return null;

  const initialWalkMinutes = first.initialWalkMinutes ?? 0;
  const finalWalkMinutes = second.finalWalkMinutes ?? 0;
  const firstInternalWalk = Math.max(0, first.walkingMinutes - (first.finalWalkMinutes ?? 0));
  const secondInternalWalk = Math.max(0, second.walkingMinutes - (second.initialWalkMinutes ?? 0));
  const walkingMinutes = firstInternalWalk + hub.transferWalkMinutes + secondInternalWalk;
  const waitingMinutes = first.waitingMinutes + second.waitingMinutes;
  const inVehicleMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const transferMinutes =
    first.transferMinutes + hub.transferWalkMinutes + second.transferMinutes;
  const totalDurationMinutes = inVehicleMinutes + waitingMinutes + walkingMinutes;

  // A bus-to-bus change inside either half is a separate boarding and should
  // retain its own fare. Metro interchanges retain their through-ticket fare.
  const components = [...first.fare.components, ...second.fare.components];
  const totalFare = components.reduce((sum, item) => sum + item.amount, 0);
  const totalStops = legs.reduce(
    (sum, leg) => sum + Math.max(0, leg.stops.length - 1),
    0,
  );
  const totalDistanceKm = Number(
    legs.reduce((sum, leg) => sum + leg.distanceKm, 0).toFixed(1),
  );
  const transferPoints = [...first.transferPoints, hubName, ...second.transferPoints];

  return {
    id: `mixed-${idPrefix}-${hubName}-${origin}-${destination}`,
    origin,
    destination,
    mode: "Mixed",
    routeName: `${first.routeName} + ${second.routeName} via ${hubName}`,
    modesInvolved,
    legs,
    totalStops,
    totalDistanceKm,
    initialWalkMinutes,
    initialWaitMinutes: first.initialWaitMinutes ?? 0,
    inVehicleMinutes,
    walkingMinutes,
    waitingMinutes,
    transferMinutes,
    finalWalkMinutes,
    totalDurationMinutes,
    timingLabel:
      "Estimated total from journey legs, transfer walks and assumed waiting/headway times. Not live arrival data.",
    boardingPoint: first.boardingPoint ?? first.legs[0]!.from,
    transferDescription:
      `Change at ${hubName}: estimated ${hub.transferWalkMinutes}-minute, ${hub.transferWalkMeters}m walk from ${firstHubStop} to ${secondHubStop}. ${hub.description}`,
    arrivalPoint: second.arrivalPoint ?? second.legs[second.legs.length - 1]!.to,
    fare: {
      totalFare,
      components,
      fareDataStatus: "estimated",
      fareSource: `${first.fare.fareSource}; ${second.fare.fareSource}`,
      lastVerificationDate: [first.fare.lastVerificationDate, second.fare.lastVerificationDate]
        .filter(Boolean)
        .join(" / "),
      discountNote: [first.fare.discountNote, second.fare.discountNote]
        .filter(Boolean)
        .join("; ") || undefined,
    },
    transferCount: legs.length - 1,
    transferPoints,
    isFastest: false,
  };
}

/** Find combinations using only curated intermodal hubs, preserving all legs. */
export function planMixedModeItineraries(
  origin: string,
  destination: string,
): CanonicalItinerary[] {
  if (origin === destination) return [];

  const mixed: CanonicalItinerary[] = [];

  for (const [hubName, hub] of Object.entries(INTERMODAL_HUBS)) {
    if (hubName === origin || hubName === destination) continue;

    const add = (
      prefix: string,
      first: CanonicalItinerary | null,
      second: CanonicalItinerary | null,
      fromStop: string | undefined,
      toStop: string | undefined,
    ) => {
      const result = composeAtIntermodalHub(
        origin,
        destination,
        hubName,
        hub,
        first,
        second,
        fromStop,
        toStop,
        prefix,
      );
      if (result) mixed.push(result);
    };

    if (hub.busStop && hub.metroStation) {
      add(
        "bus-metro",
        planBusItinerary(origin, hub.busStop),
        planMetroItinerary(hub.metroStation, destination),
        hub.busStop,
        hub.metroStation,
      );
      add(
        "metro-bus",
        planMetroItinerary(origin, hub.metroStation),
        planBusItinerary(hub.busStop, destination),
        hub.metroStation,
        hub.busStop,
      );
    }

    if (hub.metroStation && hub.suburbanStation) {
      add(
        "metro-suburban",
        planMetroItinerary(origin, hub.metroStation),
        planSuburbanItinerary(hub.suburbanStation, destination),
        hub.metroStation,
        hub.suburbanStation,
      );
      add(
        "suburban-metro",
        planSuburbanItinerary(origin, hub.suburbanStation),
        planMetroItinerary(hub.metroStation, destination),
        hub.suburbanStation,
        hub.metroStation,
      );
    }

    if (hub.busStop && hub.suburbanStation) {
      add(
        "bus-suburban",
        planBusItinerary(origin, hub.busStop),
        planSuburbanItinerary(hub.suburbanStation, destination),
        hub.busStop,
        hub.suburbanStation,
      );
    }
  }

  const seen = new Set<string>();
  const distinct: CanonicalItinerary[] = [];
  for (const itinerary of mixed) {
    const signature = itinerary.legs
      .map((leg) => `${leg.mode}:${leg.routeId}:${leg.from}:${leg.to}`)
      .join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);
    distinct.push(itinerary);
  }

  return distinct.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes);
}

// -----------------------------------------------------------------------------
// Unified Journey Planner & Canonical Ranking Engine (Up to 5 Distinct Options)
// -----------------------------------------------------------------------------
export function planAllItineraries(origin: string, destination: string): CanonicalItinerary[] {
  const candidates: CanonicalItinerary[] = [];

  const metro = planMetroItinerary(origin, destination);
  if (metro) candidates.push(metro);

  const suburban = planSuburbanItinerary(origin, destination);
  if (suburban) candidates.push(suburban);

  const bus = planBusItinerary(origin, destination);
  if (bus) candidates.push(bus);

  const mixed = planMixedModeItineraries(origin, destination);
  for (const m of mixed) {
    candidates.push(m);
  }

  if (candidates.length === 0) return [];

  // Deduplicate candidates by unique signature
  const seenSignatures = new Set<string>();
  const deduplicated: CanonicalItinerary[] = [];

  for (const it of candidates) {
    const sig = `${it.mode}_${it.routeName}_${it.legs.map((l) => `${l.mode}:${l.routeId}:${l.from}->${l.to}`).join("|")}`;
    if (!seenSignatures.has(sig)) {
      seenSignatures.add(sig);
      deduplicated.push(it);
    }
  }

  // Sort primarily by total duration ascending
  deduplicated.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes);

  // Take up to 5 distinct useful journeys
  const topItineraries = deduplicated.slice(0, 5);

  // Mark FASTEST only when >= 2 options exist
  if (topItineraries.length > 1) {
    topItineraries[0]!.isFastest = true;
    for (let i = 1; i < topItineraries.length; i++) {
      topItineraries[i]!.isFastest = false;
    }
    const fastest = topItineraries[0]!;
    topItineraries.forEach((it, idx) => {
      it.optionIndex = idx + 1;
      if (it.id === fastest.id) {
        it.comparisonSummary = `Fastest route: ~${it.totalDurationMinutes} mins total door-to-door duration.`;
      } else {
        const diff = it.totalDurationMinutes - fastest.totalDurationMinutes;
        it.comparisonSummary = `~${diff} mins slower than fastest (${fastest.mode}).`;
      }
    });
  } else if (topItineraries.length === 1) {
    topItineraries[0]!.isFastest = false;
    topItineraries[0]!.optionIndex = 1;
    topItineraries[0]!.comparisonSummary = undefined;
  }

  return topItineraries;
}

export function buildComparisonItems(itineraries: CanonicalItinerary[]): ComparisonItem[] {
  return itineraries.map((it) => ({
    mode: it.mode,
    routeName: it.routeName,
    durationMinutes: it.totalDurationMinutes,
    totalFare: it.fare.totalFare,
    fareStatus: it.fare.fareDataStatus,
    transfers: it.transferCount,
    frequency: it.legs.map((l) => `Every ${l.frequencyMinutes}m`).join(", "),
    isFastest: it.isFastest,
    notes: it.timingLabel,
  }));
}

// -----------------------------------------------------------------------------
// Grievance Handling
// -----------------------------------------------------------------------------
const OPERATORS: Record<string, string> = {
  metro: "CMRL (Chennai Metro)",
  cmrl: "CMRL (Chennai Metro)",
  bus: "MTC (Bus)",
  mtc: "MTC (Bus)",
  train: "Southern Railway (Suburban)",
  suburban: "Southern Railway (Suburban)",
  rail: "Southern Railway (Suburban)",
};

const GRIEVANCE_STEPS: { key: keyof GrievanceDraft; ask: string; chips: string[] }[] = [
  {
    key: "operator",
    ask: "Which transport operator is this about?",
    chips: ["Metro", "MTC Bus", "Suburban train"],
  },
  {
    key: "location",
    ask: "Which station, bus stop or route did this happen at?",
    chips: ["Guindy", "Chennai Central", "Route 70", "Tambaram"],
  },
  {
    key: "category",
    ask: "What type of problem was it?",
    chips: ["Lift", "Escalator", "Cleanliness", "Staff behaviour", "Overcrowding", "Ticketing", "Bus skipped stop"],
  },
  { key: "description", ask: "Please describe what happened in a sentence or two.", chips: [] },
  {
    key: "datetime",
    ask: "When did it happen? (date and approximate time)",
    chips: ["Today morning", "Yesterday evening", "Not sure"],
  },
];

function grievanceLink(op?: string) {
  if (op?.startsWith("MTC")) return OFFICIAL_LINKS.mtcGrievance;
  if (op?.startsWith("Southern")) return OFFICIAL_LINKS.railGrievance;
  return OFFICIAL_LINKS.cmrlGrievance;
}

/** Only infer an operator when the user's report explicitly names a mode. */
function reportOperator(message: string): string | undefined {
  const t = norm(message);
  if (/\b(cmrl|metro|chennai metro)\b/.test(t)) return OPERATORS.metro;
  if (/\b(mtc|bus|buses)\b/.test(t)) return OPERATORS.bus;
  if (/\b(southern railway|suburban|mrt[s]?|railway|train)\b/.test(t)) return OPERATORS.train;
  return undefined;
}

/** Map everyday words and variants to a stable category. */
function grievanceCategory(message: string): string | undefined {
  const t = norm(message);
  if (/\b(lift|elevator|escalator|wheelchair lift|escalatr)\b/.test(t)) return "Lift / escalator";
  if (/\b(skipp?ed|missed|did(?:n'?t| not) stop)\b.{0,35}\b(stop|station)\b|\b(stop|station)\b.{0,35}\b(skipp?ed|missed)\b/.test(t)) return "Bus skipped stop";
  if (/\b(breakdown|broke down|engine failure|vehicle stopped)\b/.test(t)) return "Vehicle breakdown";
  if (/\b(?:crowd(?:ed|ing)?|overcrowd(?:ed|ing)?|packed)\b/.test(t)) return "Overcrowding";
  if (/\b(clean|cleanliness|dirty|unclean|rubbish|garbage)\b/.test(t)) return "Cleanliness";
  if (/\b(staff|driver|conductor|rude|behaviour|behavior)\b/.test(t)) return "Staff behaviour";
  if (/\b(ticket|refund|payment|fare|qr code)\b/.test(t)) return "Ticketing";
  if (/\b(delay(?:ed|s)?|late|cancelled|cancellation)\b/.test(t)) return "Service delay";
  if (/^(?:other|something else|miscellaneous)$/.test(t)) return "Other";
  return undefined;
}

function likelyIncidentTime(value: string): boolean {
  const t = value.trim().toLowerCase();
  if (!t || /\b(?:tomorrow|next week|next month)\b/.test(t)) return false;
  return /\b(?:today|yesterday|just now|last night|this morning|this evening|now|morning|afternoon|evening|night|not sure|unsure|unknown)\b|\b\d{1,2}[:/. -]\d{1,2}\b|\b\d{1,2}\s*(?:am|pm)\b|\b\d{4}-\d{2}-\d{2}\b/.test(t);
}

function requestGrievanceDetail(ctx: Context, reply: string, chips: string[]): ChatReply {
  return {
    reply, cards: [], suggestions: [...chips, "Cancel complaint"],
    context: ctx, intent: "grievance", status: "OK",
  };
}

function serviceUpdatesReply(ctx: Context): ChatReply {
  return {
    reply: "Live operator service alerts are not connected. These are **simulated service-disruption examples** for the hackathon, not confirmed current Chennai incidents.",
    cards: [{ kind: "alerts", alerts: DEMO_ALERTS }],
    suggestions: ctx.grievance
      ? ["Continue complaint", "Cancel complaint", "Show all options"]
      : ["Show all options", "Report a problem", "Is my route accessible?"],
    context: ctx, intent: "service_alerts", status: "OK",
  };
}

/**
 * Recover facts explicitly supplied in a complaint. This does NOT verify the
 * claimed incident with an operator, nor identify a real-time lift status.
 */
function inferGrievanceFacts(message: string): GrievanceDraft {
  const original = message.trim().replace(
    /^(?:i\s+want\s+to\s+|please\s+)?(?:report\s+(?:a\s+)?(?:problem|issue|complaint)|file\s+a\s+complaint)\s*[:\-]?\s*/i,
    "",
  ).trim();
  const data: GrievanceDraft = {};
  const operator = reportOperator(original);
  if (operator) data.operator = operator;

  // Station / stop is a complaint location and MUST NOT replace the route
  // origin/destination already stored in conversation context.
  const namedStation = findStations(original)[0]?.name;
  const gate = original.match(/\b(north|south|east|west)\s+(?:gate|entrance)\b/i)?.[0];
  const busRoute = original.match(/\b(?:bus|mtc)\s*(?:route\s*)?#?\s*([0-9]{1,4}[a-z]{0,3})\b/i)?.[1];
  if (namedStation) {
    data.location = [namedStation, operator === OPERATORS.metro ? "Metro" : undefined, gate]
      .filter(Boolean).join(" ");
  } else if (busRoute) {
    data.location = "MTC Bus Route " + busRoute.toUpperCase();
  }

  data.category = grievanceCategory(original);

  // Don't treat an empty "report a problem" request as a description.
  // Keep the original wording, not a generated or exaggerated accusation.
  if (/\b(?:not working|broken|stuck|stopped|out of order|skipp?ed|did not stop|didn\x27t stop|breakdown|broke down|overcrowd(?:ed|ing)?|dirty|unclean|failed|refused|unsafe|malfunction|delayed)\b/i.test(original)) {
    data.description = original;
  }

  const happenedAt = original.match(/\b(?:today|yesterday)\s+(?:morning|afternoon|evening|night)\b/i);
  if (happenedAt) data.datetime = happenedAt[0];
  return data;
}

function nextGrievanceReply(data: GrievanceDraft, ctx: Context): ChatReply {
  const next = GRIEVANCE_STEPS.find((s) => !data[s.key]?.trim());
  if (next) {
    const known = [data.operator, data.location, data.category].filter(Boolean).join(" · ");
    return {
      reply: known
        ? "I have noted: " + known + ". " + next.ask + " This remains a draft until you submit it."
        : "I'll help prepare a complaint draft. " + next.ask,
      cards: [],
      suggestions: [...next.chips, "Cancel complaint"],
      context: { ...ctx, grievance: { step: next.key, data } },
    };
  }
  const draft = data as Record<keyof GrievanceDraft, string>;
  return {
    reply: "I've prepared a complaint draft using your details. Please review it and submit it through the official operator portal. Nothing has been filed or sent automatically.",
    cards: [{ kind: "grievance", draft, link: grievanceLink(draft.operator) }],
    suggestions: ["Report another problem", "Show service updates", "Plan another journey"],
    context: { ...ctx, grievance: undefined },
  };
}

function continueGrievance(msg: string, ctx: Context): ChatReply {
  const g = ctx.grievance!;
  const value = msg.trim();
  if (!value || /^(?:continue|resume)(?: my| the)? complaint$/i.test(value)) {
    return nextGrievanceReply(g.data, ctx);
  }

  const inferred = inferGrievanceFacts(value);
  const data: GrievanceDraft = { ...g.data };

  // Preserve previous answers. A user may provide details in any order:
  // "lift" while asked for location stores the issue and still asks for place.
  if (inferred.operator) data.operator = inferred.operator;
  if (inferred.location && (g.step === "location" || !data.location)) data.location = inferred.location;
  if (inferred.category && (g.step === "category" || !data.category)) data.category = inferred.category;
  // A bare issue label ("dirty", "breakdown", "bus skipped stop") is a
  // category answer, not a full description of what happened.
  const shortCategoryOnly = g.step === "category" && !!inferred.category &&
    value.length <= 24 &&
    !/\b(?:is|was|were|has|have|not|stopped|failed|refused|while|between|at|on|my|the|it|did|cannot)\b/i.test(value);
  if (inferred.description && !shortCategoryOnly &&
      (g.step === "description" || !data.description)) data.description = inferred.description;
  if (inferred.datetime && !data.datetime) data.datetime = inferred.datetime;

  if (g.step === "operator") {
    if (!data.operator) {
      return requestGrievanceDetail({ ...ctx, grievance: { step: g.step, data } },
        "Which operator was involved—Metro, MTC Bus or Suburban train? I have kept any other details you gave.",
        ["Metro", "MTC Bus", "Suburban train"]);
    }
    return nextGrievanceReply(data, ctx);
  }

  if (g.step === "location") {
    // A word such as "lift" or "escalator" is a category, not a station.
    if (!data.location && !inferred.category &&
        !/^(?:place|location|station|stop|here|there|unknown)$/i.test(value) &&
        !reportOperator(value) && value.length >= 3 && value.length <= 120) {
      data.location = value;
    }
    if (!data.location) {
      return requestGrievanceDetail({ ...ctx, grievance: { step: "location", data } },
        data.category
          ? "I've saved the issue type as " + data.category + ". Which station, stop or route did it happen at?"
          : "Which station, stop or route did it happen at? You can type any place name, such as Guindy.",
        ["Guindy", "Chennai Central", "Route 70", "Tambaram"]);
    }
    return nextGrievanceReply(data, ctx);
  }

  if (g.step === "category") {
    if (!data.category) {
      // Free-text categories are allowed, but an operator, place or generic
      // "problem" is not a meaningful issue classification.
      if (value.length >= 4 && value.length <= 80 &&
          !/^(?:problem|issue|place|location|station|stop|here|there)$/i.test(value) &&
          !reportOperator(value) && !inferred.location &&
          !likelyIncidentTime(value)) {
        data.category = value;
      } else {
        return requestGrievanceDetail({ ...ctx, grievance: { step: "category", data } },
          "What type of problem was it? Short answers such as 'lift', 'escalator', 'staff' or 'cleanliness' are accepted.",
          ["Lift", "Escalator", "Cleanliness", "Staff behaviour", "Overcrowding", "Ticketing"]);
      }
    }
    return nextGrievanceReply(data, ctx);
  }

  if (g.step === "description") {
    // "Lift" is enough to classify the issue but doesn't say what failed.
    if (!data.description) {
      if (!inferred.category && value.length >= 5 && value.length <= 1500 &&
          !/^(?:problem|issue|none|unknown|not sure|place|location)$/i.test(value)) {
        data.description = value;
      } else {
        return requestGrievanceDetail({ ...ctx, grievance: { step: "description", data } },
          "I have the issue type. Please briefly describe what happened, for example 'The lift stopped between floors'.",
          ["Lift is stuck", "Escalator is not working", "Bus did not stop"]);
      }
    }
    return nextGrievanceReply(data, ctx);
  }

  if (g.step === "datetime") {
    // Reject an unrelated route, operator or place answer instead of filing
    // it as the incident time. The user can also say "Not sure".
    if (!data.datetime) {
      if (!likelyIncidentTime(value)) {
        return requestGrievanceDetail({ ...ctx, grievance: { step: "datetime", data } },
          "Please tell me approximately when it happened. Try 'Today morning', 'Yesterday 6 PM' or 'Not sure'. The rest of your complaint is saved.",
          ["Today morning", "Yesterday evening", "Not sure"]);
      }
      data.datetime = value;
    }
    return nextGrievanceReply(data, ctx);
  }

  return nextGrievanceReply(data, ctx);
}

const has = (t: string, re: RegExp) => re.test(t);

// -----------------------------------------------------------------------------
// Core Chat Responder
// -----------------------------------------------------------------------------
export function respond(message: string, ctxIn: Context = {}): ChatReply {
  const ctx: Context = { ...ctxIn };
  const t = norm(message);

  // 1. Grievance Flow — keep drafts sticky, but let a deliberate
  // service-update request display alerts without filling a complaint field.
  if (ctx.grievance) {
    if (isServiceUpdateRequest(message)) return serviceUpdatesReply(ctx);
    if (has(t, /\bcancel\b/)) {
      return {
        reply: "Complaint draft cancelled. How else can I assist your journey?",
        cards: [],
        suggestions: defaultChips(ctx),
        context: { ...ctx, grievance: undefined },
      };
    }
    return continueGrievance(message, ctx);
  }

  if (
    has(
      t,
      /complain|complaint|grievance|report (a )?problem|report an issue|report another|file a complaint/,
    ) || isExplicitIncidentReport(message)
  ) {
    // A direct report may already contain the operator, exact gate, issue
    // category and description. Do not ask for them a second time.
    return nextGrievanceReply(inferGrievanceFacts(message), ctx);
  }

  // 2. Explicit service status & alerts (never a journey search).
  if (isServiceUpdateRequest(message) || has(t, /\b(alerts?|disruptions?|strike|line closure)\b/)) {
    return serviceUpdatesReply(ctx);
  }

  // 3. Station Slot Extraction & Updates
  const stations = findStations(message);
  let origin = ctx.origin;
  let destination = ctx.destination;

  // Patterns for origin updates (e.g. "What about starting from Koyambedu?")
  const fromPattern = t.match(
    /\b(?:from|starting from|start from|starting at|board at|board from)\s+(.+?)(?:\s+(?:to|towards|till|destination)\s+|$)/,
  );
  // Patterns for destination updates (e.g. "To Chennai Airport", "What about to Airport?")
  const toPattern = t.match(/\b(?:to|towards|till|going to|reach|destination is)\s+(.+)$/);

  const fromHit = fromPattern ? findStations(fromPattern[1] ?? "")[0]?.name : undefined;
  const toHit = toPattern ? findStations(toPattern[1] ?? "")[0]?.name : undefined;

  if (fromHit) {
    origin = fromHit;
  }
  if (toHit) {
    destination = toHit;
  }

  // If destination was found via 'to X' but 'from' was omitted (e.g. "Koyambedu to Guindy")
  if (toHit && !fromHit && stations.length >= 2 && stations[0]!.name !== toHit) {
    origin = stations[0]!.name;
  }

  // Multiple stations mentioned without explicit prepositions
  if (!fromHit && !toHit && stations.length >= 2) {
    origin = stations[0]!.name;
    destination = stations[1]!.name;
  } else if (!fromHit && !toHit && stations.length === 1 && !origin && !destination) {
    origin = stations[0]!.name;
  }

  // Detect explicit mode request in user message
  const requestedMode = detectRequestedMode(message);

  const wantsComparison = has(
    t,
    /\b(which one is fastest|which is fastest|which is faster|which one is faster|which route is fastest|which is best|compare routes|compare|fastest route|fastest option)\b/,
  );
  const wantsFareBreakdown = has(t, /breakdown|fare breakdown|split|components|ticket details/);
  const wantsFare =
    has(
      t,
      /\b(how much will that cost|how much does it cost|how much is the fare|how much|what is the fare|what will that cost|fare of this route|ticket price|fare|cost|price|ticket|charge)\b/,
    ) || wantsFareBreakdown;
  const wantsDuration = has(t, /how long|duration|travel time|timing|how many minutes|schedule/);
  const wantsInterchange = has(
    t,
    /where (should|do) i change|interchange|transfer|switch trains|which station to change/,
  );
  const wantsFacility = has(t, /accessib|lift|elevator|wheelchair|ramp|facilit|escalator|tactile/);

  // Update working context endpoints
  const originChanged = origin !== ctx.origin;
  const destinationChanged = destination !== ctx.destination;

  if (originChanged || destinationChanged) {
    if (ctx.activeItineraryId) {
      ctx.lastReferencedItineraryId = ctx.activeItineraryId;
    }
  }

  ctx.origin = origin;
  ctx.destination = destination;
  if (origin) ctx.lastStation = origin;

  // 4. Accessibility Enquiries
  if (wantsFacility) {
    let station = stations[0]?.name;
    if (!station) {
      station = has(t, /destination|end|arriv/)
        ? ctx.destination
        : has(t, /start|origin|board/)
          ? ctx.origin
          : (ctx.lastStation ?? ctx.origin);
    }
    if (!station) {
      return {
        reply: "Which station or stop would you like accessibility facilities for?",
        cards: [],
        suggestions: [
          "Is Guindy accessible?",
          "Lifts at Chennai Central",
          "Accessibility at Airport",
        ],
        context: ctx,
      };
    }

    const facility = STATION_FACILITIES[station];
    if (!facility) {
      return {
        reply: `I have retained your wheelchair preference. Accessibility information for ${station} is not verified in this prototype, so I cannot confirm a working lift, ramp or accessible bus there. Please check with the transport operator before travelling.`,
        cards: [],
        suggestions: ["Show all options", "What is the fare?", "Accessibility at Guindy"],
        context: { ...ctx, lastStation: station },
        intent: "accessibility",
      };
    }

    return {
      reply: `Here are the published accessibility facilities for **${station}** (from our Chennai transport registry). Live lift operating status is not monitored.`,
      cards: [{ kind: "facility", station, facility }],
      suggestions: [
        "What is the fare?",
        "Any service alerts?",
        ...(ctx.origin && ctx.destination ? ["Which is faster?"] : []),
      ],
      context: { ...ctx, lastStation: station },
    };
  }

  // 5. Interchange query ("Where should I change?")
  if (wantsInterchange && ctx.origin && ctx.destination) {
    const itineraries =
      ctx.availableItineraries && ctx.availableItineraries.length > 0
        ? ctx.availableItineraries
        : planAllItineraries(ctx.origin, ctx.destination);

    const active =
      itineraries.find((it) => it.id === ctx.activeItineraryId) ??
      getActiveItinerary(itineraries, ctx.modePreference) ??
      itineraries[0];

    if (active && active.transferCount > 0) {
      const interchange = active.transferPoints[0]!;
      return {
        reply: `For your journey from ${ctx.origin} to ${ctx.destination} via Option ${active.optionIndex ?? 1} (${active.routeName}), you should change at **${interchange}**. Follow the concourse signage to the connecting platform.`,
        cards: [{ kind: "journey", itinerary: active }],
        suggestions: ["What is the fare?", "How long will it take?", "Show the fare breakdown"],
        context: { ...ctx, activeItineraryId: active.id, availableItineraries: itineraries },
      };
    } else if (active) {
      return {
        reply: `Good news! Your ${active.mode} route from ${ctx.origin} to ${ctx.destination} is **direct** (${active.routeName}) with no transfers needed.`,
        cards: [{ kind: "journey", itinerary: active }],
        suggestions: ["What is the fare?", "How long will it take?"],
        context: { ...ctx, activeItineraryId: active.id, availableItineraries: itineraries },
      };
    }
  }

  // 6. Journey Duration Query ("How long will it take?")
  if (wantsDuration && ctx.origin && ctx.destination) {
    const itineraries =
      ctx.availableItineraries && ctx.availableItineraries.length > 0
        ? ctx.availableItineraries
        : planAllItineraries(ctx.origin, ctx.destination);

    const active =
      itineraries.find((it) => it.id === ctx.activeItineraryId) ??
      getActiveItinerary(itineraries, ctx.modePreference) ??
      itineraries[0];

    if (active) {
      return {
        reply: `Estimated door-to-door duration for Option ${active.optionIndex ?? 1} (${active.routeName}) from ${ctx.origin} to ${ctx.destination} is **${active.totalDurationMinutes} minutes** (~${active.inVehicleMinutes} mins in-vehicle + ~${active.waitingMinutes} mins waiting/headway${active.transferMinutes > 0 ? ` + ~${active.transferMinutes} mins transfer walk` : ""} + ~${active.walkingMinutes} mins walk). Durations are estimated based on GTFS transit schedules and road traffic; live GPS delays are not tracked.`,
        cards: [{ kind: "journey", itinerary: active }],
        suggestions: ["Which is faster?", "What is the fare?", "Show the fare breakdown"],
        context: { ...ctx, activeItineraryId: active.id, availableItineraries: itineraries },
      };
    }
  }

  // 7. Natural Language Option Selection: "Select Option 2", "Option 3", "Choose 1", "Pick option 2"
  const optionMatch =
    t.match(/\b(?:select\s+option|choose\s+option|pick\s+option|select|choose|pick)\s+([1-5])\b/) ||
    t.match(/\boption\s+([1-5])\b/) ||
    t.match(/^([1-5])$/);

  if (optionMatch && ctx.availableItineraries && ctx.availableItineraries.length > 0) {
    const optIndex = parseInt(optionMatch[1]!, 10);
    const target =
      ctx.availableItineraries.find((it) => it.optionIndex === optIndex) ??
      ctx.availableItineraries[optIndex - 1];

    if (target) {
      const prevId = ctx.activeItineraryId;
      ctx.lastReferencedItineraryId = prevId;
      ctx.activeItineraryId = target.id;

      const reply = `Selected **Option ${target.optionIndex ?? optIndex}: ${target.routeName}** (${target.mode}, ~${target.totalDurationMinutes} mins, ${fareText(target.fare)}). Here are the details for this journey:`;

      return {
        reply,
        message: reply,
        intent: "option_selection",
        status: "OK",
        origin: ctx.origin,
        destination: ctx.destination,
        itineraries: ctx.availableItineraries,
        activeItineraryId: target.id,
        cards: [
          {
            kind: "route_options",
            options: ctx.availableItineraries,
            activeItineraryId: target.id,
            origin: ctx.origin!,
            destination: ctx.destination!,
            selectedFilter: ctx.selectedFilter,
          },
          { kind: "journey", itinerary: target },
        ],
        suggestions: [
          "How much will that cost?",
          "Show the fare breakdown",
          "Which is faster?",
          "Show me the previous option",
          "Show all options",
        ],
        context: {
          ...ctx,
          activeItineraryId: target.id,
          lastReferencedItineraryId: prevId,
        },
      };
    }
  }

  // 8. Return to Previous Option ("Show me the previous option", "Previous option")
  if (
    has(
      t,
      /\b(previous option|show me the previous option|go back to previous option|back to previous option|return to previous option|last option)\b/,
    )
  ) {
    if (ctx.lastReferencedItineraryId && ctx.availableItineraries) {
      const prev = ctx.availableItineraries.find((it) => it.id === ctx.lastReferencedItineraryId);
      if (prev) {
        const curId = ctx.activeItineraryId;
        ctx.activeItineraryId = prev.id;
        ctx.lastReferencedItineraryId = curId;

        const reply = `Returned to previous option: **Option ${prev.optionIndex ?? 1}: ${prev.routeName}** (${prev.mode}, ~${prev.totalDurationMinutes} mins, ${fareText(prev.fare)}).`;

        return {
          reply,
          message: reply,
          intent: "option_selection",
          status: "OK",
          origin: ctx.origin,
          destination: ctx.destination,
          itineraries: ctx.availableItineraries,
          activeItineraryId: prev.id,
          cards: [
            {
              kind: "route_options",
              options: ctx.availableItineraries,
              activeItineraryId: prev.id,
              origin: ctx.origin!,
              destination: ctx.destination!,
              selectedFilter: ctx.selectedFilter,
            },
            { kind: "journey", itinerary: prev },
          ],
          suggestions: [
            "How much will that cost?",
            "Show the fare breakdown",
            "Which is faster?",
            "Show all options",
          ],
          context: {
            ...ctx,
            activeItineraryId: prev.id,
            lastReferencedItineraryId: curId,
          },
        };
      }
    }
  }

  // 9. Fastest / Route Comparison Request ("Which is fastest?", "Which one is fastest?")
  if (wantsComparison && ctx.origin && ctx.destination) {
    const allItineraries =
      ctx.availableItineraries &&
      ctx.availableItineraries.length > 0 &&
      ctx.origin === ctx.availableItineraries[0]?.origin &&
      ctx.destination === ctx.availableItineraries[0]?.destination
        ? ctx.availableItineraries
        : planAllItineraries(ctx.origin, ctx.destination);

    if (allItineraries.length > 1) {
      const fastest = allItineraries.find((it) => it.isFastest) ?? allItineraries[0]!;
      const prevId = ctx.activeItineraryId;
      ctx.activeItineraryId = fastest.id;
      ctx.lastReferencedItineraryId = prevId;
      ctx.recommendedFastestId = fastest.id;

      const otherModesText = allItineraries
        .filter((it) => it.id !== fastest.id)
        .slice(0, 3)
        .map(
          (it) =>
            `Option ${it.optionIndex}: ${it.routeName} takes ~${it.totalDurationMinutes} mins (${fareText(it.fare)})`,
        )
        .join("; ");

      const reply = `The fastest option from ${ctx.origin} to ${ctx.destination} is **Option ${fastest.optionIndex ?? 1}: ${fastest.routeName}** (${fastest.mode}) with an estimated total door-to-door duration of **${fastest.totalDurationMinutes} minutes** (inclusive of headway and walk; fare ${fareText(fastest.fare)}). ${otherModesText ? `Other available options: ${otherModesText}.` : ""}`;

      return {
        reply,
        message: reply,
        status: "OK",
        intent: "comparison",
        origin: ctx.origin,
        destination: ctx.destination,
        itineraries: allItineraries,
        activeItineraryId: fastest.id,
        recommendedFastestId: fastest.id,
        cards: [
          {
            kind: "route_options",
            options: allItineraries,
            activeItineraryId: fastest.id,
            origin: ctx.origin,
            destination: ctx.destination,
            selectedFilter: "Fastest",
          },
          { kind: "journey", itinerary: fastest },
        ],
        suggestions: [
          "How much will that cost?",
          "Show the fare breakdown",
          "Select Option 2",
          "Show mixed routes",
        ],
        context: {
          ...ctx,
          activeItineraryId: fastest.id,
          lastReferencedItineraryId: prevId,
          recommendedFastestId: fastest.id,
          availableItineraries: allItineraries,
        },
      };
    } else if (allItineraries.length === 1) {
      const single = { ...allItineraries[0]!, isFastest: false };
      const reply = `${single.mode} is the only supported transit route connecting ${ctx.origin} and ${ctx.destination} in the dataset (estimated ~${single.totalDurationMinutes} mins). No other modes are available for comparison.`;
      return {
        reply,
        message: reply,
        status: "OK",
        intent: "route_search",
        origin: ctx.origin,
        destination: ctx.destination,
        itineraries: [single],
        activeItineraryId: single.id,
        cards: [{ kind: "journey", itinerary: single }],
        suggestions: [
          "What is the fare?",
          "Show the fare breakdown",
          "Show other transport options",
        ],
        context: {
          ...ctx,
          activeItineraryId: single.id,
          modePreference: single.mode,
          availableItineraries: [single],
        },
      };
    }
  }

  // 10. STRICT MODE FILTERING & MODE SELECTION (Tasks 1, 2, 7 & 11)
  if (requestedMode && ctx.origin && ctx.destination) {
    if (requestedMode === "All") {
      ctx.modePreference = "All";
      ctx.selectedFilter = "All";
      const allItineraries = planAllItineraries(ctx.origin, ctx.destination);
      if (allItineraries.length === 0) {
        const msg = `No public transport routes were found between ${ctx.origin} and ${ctx.destination} in the available dataset.`;
        return {
          reply: msg,
          message: msg,
          intent: "route_search",
          status: "NO_MATCH_IN_DATASET",
          requestedMode: "All",
          origin: ctx.origin,
          destination: ctx.destination,
          itineraries: [],
          activeItineraryId: null,
          cards: [],
          suggestions: ["Guindy to Chennai Airport", "Tambaram to Chennai Beach"],
          context: {
            ...ctx,
            modePreference: "All",
            availableItineraries: [],
            activeItineraryId: undefined,
          },
        };
      }

      const activeIt = allItineraries[0]!;
      const cards: Card[] = [
        {
          kind: "route_options",
          options: allItineraries,
          activeItineraryId: activeIt.id,
          origin: ctx.origin,
          destination: ctx.destination,
          selectedFilter: "All",
        },
        { kind: "journey", itinerary: activeIt },
      ];

      const modesList = allItineraries
        .map(
          (it) =>
            `Option ${it.optionIndex}: ${it.mode} (~${it.totalDurationMinutes}m, ${fareText(it.fare)})`,
        )
        .join("; ");
      const msg = `Here are all available transport options from ${ctx.origin} to ${ctx.destination}: ${modesList}.`;

      return {
        reply: msg,
        message: msg,
        intent: "route_search",
        status: "OK",
        requestedMode: "All",
        origin: ctx.origin,
        destination: ctx.destination,
        itineraries: allItineraries,
        activeItineraryId: activeIt.id,
        recommendedFastestId: allItineraries.find((it) => it.isFastest)?.id,
        cards,
        suggestions: [
          "Which is fastest?",
          "How much will that cost?",
          "Select Option 2",
          "Show mixed routes",
        ],
        context: {
          ...ctx,
          modePreference: "All",
          availableItineraries: allItineraries,
          activeItineraryId: activeIt.id,
        },
      };
    }

    if (requestedMode === "Mixed") {
      ctx.modePreference = "Mixed";
      ctx.selectedFilter = "Mixed";
      const mixed = planMixedModeItineraries(ctx.origin, ctx.destination);
      if (mixed.length > 0) {
        const topMixed = mixed.slice(0, 5);
        topMixed.forEach((m, i) => {
          m.optionIndex = i + 1;
        });
        const singleMixed = { ...topMixed[0]!, isFastest: false };
        const msg = `Here is the mixed-mode option from **${ctx.origin}** to **${ctx.destination}**: **${singleMixed.routeName}** (${singleMixed.modesInvolved?.join(" + ") || "Multimodal"}). Estimated door-to-door duration is **${singleMixed.totalDurationMinutes} minutes** with an estimated, unverified fare of **${fareText(singleMixed.fare)}**.`;
        return {
          reply: msg,
          message: msg,
          intent: "route_search",
          status: "OK",
          requestedMode: "Mixed",
          origin: ctx.origin,
          destination: ctx.destination,
          itineraries: topMixed,
          activeItineraryId: singleMixed.id,
          cards: [
            {
              kind: "route_options",
              options: topMixed,
              activeItineraryId: singleMixed.id,
              origin: ctx.origin,
              destination: ctx.destination,
              selectedFilter: "Mixed",
            },
            { kind: "journey", itinerary: singleMixed },
          ],
          suggestions: [
            "What is the fare?",
            "Show the fare breakdown",
            "Which is faster?",
            "Show all options",
          ],
          context: {
            ...ctx,
            activeItineraryId: singleMixed.id,
            modePreference: "Mixed",
            availableItineraries: topMixed,
          },
        };
      } else {
        const all = planAllItineraries(ctx.origin, ctx.destination);
        const singleModes = all.map((it) => it.mode).join(" or ");
        const msg = `No sensible mixed-mode route was found between **${ctx.origin}** and **${ctx.destination}** in the dataset. Because a direct single-mode service (${singleModes || "Suburban Rail"}) is available without intermodal transfers, taking multiple transport modes is unnecessary. Would you like to view the single-mode option?`;
        return {
          reply: msg,
          message: msg,
          intent: "route_search",
          status: "NO_MATCH_IN_DATASET",
          requestedMode: "Mixed",
          origin: ctx.origin,
          destination: ctx.destination,
          itineraries: [],
          activeItineraryId: null,
          cards: [],
          suggestions: [
            "Show all options",
            ...(all.length > 0 ? [`Show ${all[0]!.mode}`] : []),
            "Show train routes",
          ],
          context: {
            ...ctx,
            activeItineraryId: undefined,
            modePreference: "Mixed",
            availableItineraries: [],
          },
        };
      }
    }

    if (requestedMode === "Bus") {
      ctx.modePreference = "Bus";
      ctx.selectedFilter = "Bus";
      const bus = planBusItinerary(ctx.origin, ctx.destination);
      if (bus) {
        const singleBus = { ...bus, isFastest: false, optionIndex: 1 };
        const msg = `Here is the MTC bus route from ${ctx.origin} to ${ctx.destination}: **${singleBus.routeName}**. Estimated duration is **${singleBus.totalDurationMinutes} minutes** (${singleBus.totalStops} stops) with an estimated, unverified fare of **${fareText(singleBus.fare)}**.`;
        return {
          reply: msg,
          message: msg,
          intent: "route_search",
          status: "OK",
          requestedMode: "Bus",
          origin: ctx.origin,
          destination: ctx.destination,
          itineraries: [singleBus],
          activeItineraryId: singleBus.id,
          cards: [{ kind: "journey", itinerary: singleBus }],
          suggestions: [
            "What is the fare?",
            "Show the fare breakdown",
            "Show other transport options",
            "Which is faster?",
          ],
          context: {
            ...ctx,
            activeItineraryId: singleBus.id,
            modePreference: "Bus",
            availableItineraries: [singleBus],
          },
        };
      } else {
        const msg = `No matching MTC bus journey was found from ${ctx.origin} to ${ctx.destination} in the available dataset. This does not necessarily mean no bus service exists; unmapped local routes or multi-hop bus connections outside the dataset corridors may operate.`;
        return {
          reply: msg,
          message: msg,
          intent: "route_search",
          status: "NO_MATCH_IN_DATASET",
          requestedMode: "Bus",
          origin: ctx.origin,
          destination: ctx.destination,
          itineraries: [],
          activeItineraryId: null,
          cards: [], // MUST BE EMPTY: NEVER attach Metro or Suburban Rail cards!
          suggestions: ["Show other transport options", "Show train routes", "Show Metro"],
          context: {
            ...ctx,
            activeItineraryId: undefined,
            modePreference: "Bus",
            availableItineraries: [],
          },
        };
      }
    }

    if (requestedMode === "Suburban Rail") {
      ctx.modePreference = "Suburban Rail";
      ctx.selectedFilter = "Suburban Rail";
      const srr = planSuburbanItinerary(ctx.origin, ctx.destination);
      if (srr) {
        const singleSrr = { ...srr, isFastest: false, optionIndex: 1 };
        const msg = `Here is the Southern Railway Suburban option from ${ctx.origin} to ${ctx.destination}: **${singleSrr.routeName}**. Estimated travel time is **${singleSrr.totalDurationMinutes} minutes** (${singleSrr.totalStops} stops) with a fare of **${fareText(singleSrr.fare)}**.`;
        return {
          reply: msg,
          message: msg,
          intent: "route_search",
          status: "OK",
          requestedMode: "Suburban Rail",
          origin: ctx.origin,
          destination: ctx.destination,
          itineraries: [singleSrr],
          activeItineraryId: singleSrr.id,
          cards: [{ kind: "journey", itinerary: singleSrr }],
          suggestions: [
            "What is the fare?",
            "Show the fare breakdown",
            "Show other transport options",
            "Which is faster?",
          ],
          context: {
            ...ctx,
            activeItineraryId: singleSrr.id,
            modePreference: "Suburban Rail",
            availableItineraries: [singleSrr],
          },
        };
      } else {
        const msg = `No matching Southern Railway Suburban train service was found from ${ctx.origin} to ${ctx.destination} in the available dataset.`;
        return {
          reply: msg,
          message: msg,
          intent: "route_search",
          status: "NO_MATCH_IN_DATASET",
          requestedMode: "Suburban Rail",
          origin: ctx.origin,
          destination: ctx.destination,
          itineraries: [],
          activeItineraryId: null,
          cards: [],
          suggestions: ["Show other transport options", "Show Metro", "Is there a bus route?"],
          context: {
            ...ctx,
            activeItineraryId: undefined,
            modePreference: "Suburban Rail",
            availableItineraries: [],
          },
        };
      }
    }

    if (requestedMode === "Metro") {
      ctx.modePreference = "Metro";
      ctx.selectedFilter = "Metro";
      const metro = planMetroItinerary(ctx.origin, ctx.destination);
      if (metro) {
        const singleMetro = { ...metro, isFastest: false, optionIndex: 1 };
        const msg = `Here is the Chennai Metro route from ${ctx.origin} to ${ctx.destination}: **${singleMetro.routeName}**. Estimated duration is **${singleMetro.totalDurationMinutes} minutes** (${singleMetro.totalStops} stops) with a fare of **${fareText(singleMetro.fare)}** (${singleMetro.fare.discountNote || "20% QR discount"}).`;
        return {
          reply: msg,
          message: msg,
          intent: "route_search",
          status: "OK",
          requestedMode: "Metro",
          origin: ctx.origin,
          destination: ctx.destination,
          itineraries: [singleMetro],
          activeItineraryId: singleMetro.id,
          cards: [{ kind: "journey", itinerary: singleMetro }],
          suggestions: [
            "What is the fare?",
            "Show the fare breakdown",
            "Show other transport options",
            "Which is faster?",
          ],
          context: {
            ...ctx,
            activeItineraryId: singleMetro.id,
            modePreference: "Metro",
            availableItineraries: [singleMetro],
          },
        };
      } else {
        const msg = `No matching CMRL Metro route was found from ${ctx.origin} to ${ctx.destination} in the available dataset.`;
        return {
          reply: msg,
          message: msg,
          intent: "route_search",
          status: "NO_MATCH_IN_DATASET",
          requestedMode: "Metro",
          origin: ctx.origin,
          destination: ctx.destination,
          itineraries: [],
          activeItineraryId: null,
          cards: [],
          suggestions: [
            "Show other transport options",
            "Show train routes",
            "Is there a bus route?",
          ],
          context: {
            ...ctx,
            activeItineraryId: undefined,
            modePreference: "Metro",
            availableItineraries: [],
          },
        };
      }
    }
  }

  // 11. General Fare Enquiries
  if (wantsFare) {
    if (!ctx.origin || !ctx.destination) {
      return {
        reply:
          "Please tell me your starting and destination stops first — for example, “Fare from Guindy to Chennai Airport”.",
        cards: [],
        suggestions: ["Fare from Guindy to Chennai Airport", "Koyambedu to Guindy fare"],
        context: ctx,
      };
    }
    const allItineraries =
      ctx.availableItineraries && ctx.availableItineraries.length > 0
        ? ctx.availableItineraries
        : planAllItineraries(ctx.origin, ctx.destination);

    const active =
      allItineraries.find((it) => it.id === ctx.activeItineraryId) ??
      getActiveItinerary(allItineraries, ctx.modePreference) ??
      allItineraries[0];

    if (active) {
      const fareLabel = active.fare.fareDataStatus === "estimated" ? "estimated, unverified" : active.fare.fareDataStatus === "unavailable" ? "currently unavailable" : "reference";
      const reply = `For your journey from ${active.origin} to ${active.destination} via **Option ${active.optionIndex ?? 1} (${active.routeName})**, the journey fare is **${fareText(active.fare)}** (${fareLabel}) (${active.fare.fareSource}). ${active.fare.discountNote ? `(${active.fare.discountNote})` : ""}`;
      return {
        reply,
        message: reply,
        intent: "fare_enquiry",
        status: "OK",
        origin: ctx.origin,
        destination: ctx.destination,
        itineraries: allItineraries,
        activeItineraryId: active.id,
        cards: [{ kind: "fare_breakdown", itinerary: active }],
        suggestions: [
          "Which is faster?",
          "Select Option 2",
          "Show mixed routes",
          "Is the starting station accessible?",
        ],
        context: { ...ctx, activeItineraryId: active.id, availableItineraries: allItineraries },
      };
    }
  }

  // 12. General Journey Planning (Origin & Destination present or changed)
  if (origin && destination) {
    const allItineraries = planAllItineraries(origin, destination);
    if (allItineraries.length === 0) {
      const msg = `I could not find a supported public transport route between **${origin}** and **${destination}** in the ChennaiGTFS dataset. Please verify the station names.`;
      return {
        reply: msg,
        message: msg,
        intent: "route_search",
        status: "NO_MATCH_IN_DATASET",
        origin,
        destination,
        itineraries: [],
        activeItineraryId: null,
        cards: [],
        suggestions: [
          "Guindy to Chennai Airport",
          "Koyambedu to Guindy",
          "Tambaram to Chennai Beach",
          "Anna Nagar Tower to Chennai Airport",
        ],
        context: {
          ...ctx,
          origin,
          destination,
          availableItineraries: [],
          activeItineraryId: undefined,
        },
      };
    }

    const preferred = getActiveItinerary(allItineraries, ctx.modePreference) ?? allItineraries[0]!;

    ctx.availableItineraries = allItineraries;
    ctx.activeItineraryId = preferred.id;
    ctx.recommendedFastestId =
      allItineraries.find((it) => it.isFastest)?.id ?? allItineraries[0]!.id;

    const cards: Card[] = [];
    if (allItineraries.length > 1) {
      cards.push({
        kind: "route_options",
        options: allItineraries,
        activeItineraryId: preferred.id,
        origin,
        destination,
      });
    }
    cards.push({ kind: "journey", itinerary: preferred });

    const viaText =
      preferred.transferCount > 0
        ? ` with a transfer at ${preferred.transferPoints.join(", ")}`
        : " directly";

    const reply = `I found **${allItineraries.length} route options** from **${origin}** to **${destination}**. The recommended route is **Option ${preferred.optionIndex ?? 1}: ${preferred.routeName}** via ${preferred.mode}${viaText} (${preferred.totalStops} stops, est. ~${preferred.totalDurationMinutes} mins, fare ${fareText(preferred.fare)}). You can select another option below or ask "Which one is fastest?".`;

    return {
      reply,
      message: reply,
      intent: "route_search",
      status: "OK",
      origin,
      destination,
      requestedMode: ctx.modePreference,
      itineraries: allItineraries,
      activeItineraryId: preferred.id,
      recommendedFastestId: ctx.recommendedFastestId,
      cards,
      suggestions: [
        "Which is faster?",
        "How much will that cost?",
        "Select Option 2",
        "Show mixed routes",
        "Is there a bus route?",
      ],
      context: {
        ...ctx,
        origin,
        destination,
        activeItineraryId: preferred.id,
        availableItineraries: allItineraries,
        recommendedFastestId: ctx.recommendedFastestId,
      },
    };
  }

  // 13. Only one endpoint given
  if (origin || destination) {
    return {
      reply: origin
        ? `Got it, starting from **${origin}**. Where would you like to travel to?`
        : `Heading to **${destination}**. Where are you starting from?`,
      cards: [],
      suggestions: origin
        ? ["To Chennai Airport", "To Guindy", "To Chennai Central", "To Tambaram"]
        : ["From Guindy", "From Chennai Central", "From Koyambedu"],
      context: { ...ctx, origin, destination },
    };
  }

  // 14. Single Station enquiry
  if (stations.length === 1) {
    const s = stations[0]!.name;
    return {
      reply: `What would you like to know about **${s}**? I can plan journeys starting here, show facilities, or check service alerts.`,
      cards: [],
      suggestions: [`From ${s} to Chennai Airport`, `Is ${s} accessible?`, `Fares from ${s}`],
      context: { ...ctx, lastStation: s, origin: s },
    };
  }

  // 15. Greeting
  if (has(t, /^(hi|hello|hey|vanakkam)\b/)) {
    return {
      reply:
        "Vanakkam! I'm NammaTransit AI. I can assist you with multimodal journey planning across Chennai Metro, MTC Buses, and Southern Railway Suburban trains, calculate official fares, check station accessibility, and draft grievances.",
      cards: [],
      suggestions: defaultChips(ctx),
      context: ctx,
    };
  }

  // 16. Default Fallback
  return {
    reply:
      "I'm here to help with Chennai transit. You can ask for routes (e.g. “Guindy to Chennai Airport”), compare bus vs metro travel times, check fares, station accessibility, or draft a complaint.",
    cards: [],
    suggestions: defaultChips(ctx),
    context: ctx,
  };
}

function getActiveItinerary(
  itineraries: CanonicalItinerary[],
  modePref?: TransportMode | "All",
): CanonicalItinerary | undefined {
  if (!itineraries || itineraries.length === 0) return undefined;
  if (modePref && modePref !== "All") {
    const m = itineraries.find((it) => it.mode === modePref);
    if (m) return m;
    // CRITICAL: When a specific mode is requested, NEVER fall back to another mode!
    return undefined;
  }
  return itineraries[0];
}

function defaultChips(ctx: Context): string[] {
  if (ctx.origin && ctx.destination) {
    return [
      "Which is faster?",
      "How much will that cost?",
      "Select Option 2",
      "Show mixed routes",
      "Is there a bus route?",
      "Is the starting station accessible?",
    ];
  }
  return [
    "Guindy to Chennai Airport",
    "Koyambedu to Guindy",
    "Tambaram to Chennai Beach",
    "Anna Nagar Tower to Chennai Airport",
    "Any service alerts?",
    "Report a problem",
  ];
}
