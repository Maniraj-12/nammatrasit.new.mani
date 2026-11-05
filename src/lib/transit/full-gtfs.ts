/** Static, source-labelled journey search over the complete ChennaiGTFS feed.
 * Generated index lives at /data/chennai-full-network.json; never rebuild or
 * download the 9.8 MB source ZIP in the user's browser.
 *
 * The graph is based on real GTFS stop sequences. Transfer walks based only
 * on proximity are candidate connections, not verified pedestrian routes.
 * Times are approximate; Metro GTFS service calendars expired in 2021.
 */
import type { CanonicalItinerary, JourneyLeg } from "./engine";
import type { TransportMode } from "./data";
import { coordinateDistanceKm, estimateFullGtfsFare } from "./estimated-fares";
import { deduplicatePhysicalJourneys } from "./deduplicate-journeys";
import { sliceGtfsShape, type LatLon } from "./gtfs-shapes";

export type GtfsStop = [id: string, name: string, lat: number | null, lon: number | null, mode: TransportMode, parent: string, fareZone?: string];
export type GtfsRoute = [id: string, shortName: string, longName: string, mode: TransportMode];
export type GtfsPattern = [routeIndex: number, stopIndices: number[], segmentMinutes: number[], direction: string, serviceId: string, shapeId?: string];
export type GtfsWalk = [from: number, to: number, minutes: number, source: string];
export type FullGtfsData = {
  metadata: { routeCount: number; stopCount: number; tripCount: number; patternCount: number; claim: string; status: string };
  stops: GtfsStop[];
  routes: GtfsRoute[];
  patterns: GtfsPattern[];
  walks: GtfsWalk[];
  metroFareByZone?: Record<string, number>;
  shapes?: Record<string, LatLon[]>;
};

type RideEdge = [to: number, pattern: number, minutes: number];
type WalkEdge = [to: number, minutes: number, source: string];
export type FullGtfsIndex = {
  data: FullGtfsData;
  rides: RideEdge[][];
  walks: WalkEdge[][];
  stopNames: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const waitEstimate: Record<string, number> = { Bus: 10, Metro: 5, "Suburban Rail": 15 };

export function indexFullGtfs(data: FullGtfsData): FullGtfsIndex {
  if (data.routes.length < 5000 || data.stops.length < 6000 || data.patterns.length < 4000) {
    throw new Error("Full GTFS network is incomplete.");
  }
  const rides: RideEdge[][] = Array.from({ length: data.stops.length }, () => []);
  const walks: WalkEdge[][] = Array.from({ length: data.stops.length }, () => []);
  data.patterns.forEach((pattern, patternIdx) => {
    const [, stops, times] = pattern;
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i]!;
      const to = stops[i + 1]!;
      if (from !== to && rides[from] && data.stops[to]) {
        rides[from].push([to, patternIdx, Math.max(1, times[i] ?? 3)]);
      }
    }
  });
  data.walks.forEach(([from, to, mins, source]) => {
    if (walks[from] && data.stops[to] && from !== to) walks[from].push([to, mins, source]);
  });
  return { data, rides, walks, stopNames: data.stops.map((s) => norm(s[1])) };
}

let cached: Promise<FullGtfsIndex | null> | null = null;
export function loadFullGtfs(): Promise<FullGtfsIndex | null> {
  if (!cached) {
    cached = (async () => {
      if (typeof fetch !== "function") return null;
      try {
        const response = await fetch("/data/chennai-full-network.json");
        if (!response.ok) return null;
        const data = (await response.json()) as FullGtfsData;
        return indexFullGtfs(data);
      } catch {
        return null; // Keep previously working curated routes as fallback.
      }
    })();
  }
  return cached;
}

export function findFullStops(index: FullGtfsIndex, query: string): number[] {
  const q = norm(query.replace(/\b(metro station|bus stop|railway station|suburban station|metro)\b/gi, " "));
  if (q.length < 3) return [];
  const candidates: Array<[number, number]> = [];
  for (let i = 0; i < index.stopNames.length; i++) {
    const name = index.stopNames[i]!;
    if (!name) continue;
    const score =
      name === q ? 0 :
      name.startsWith(q + " ") ? 1 :
      name.endsWith(" " + q) ? 2 :
      name.includes(q) ? 3 :
      q.length > 5 && q.includes(name) ? 4 : 100;
    if (score < 100) candidates.push([score, i]);
  }
  return candidates.sort((a, b) => a[0] - b[0]).slice(0, 18).map((x) => x[1]);
}

type Node = {
  stop: number;
  ride: number;
  boarded: number;
  duration: number;
  rideMinutes: number;
  walkMinutes: number;
  waitMinutes: number;
  prev: number;
  edgeKind: "origin" | "walk" | "ride";
  edgeMinutes: number;
  edgeSource?: string;
};

class MinHeap {
  private nodes: number[] = [];
  constructor(private readonly values: Node[]) {}
  push(index: number) {
    const a = this.nodes;
    let i = a.length;
    a.push(index);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.values[a[p]!]!.duration <= this.values[index]!.duration) break;
      a[i] = a[p]!;
      i = p;
    }
    a[i] = index;
  }
  pop(): number | undefined {
    const a = this.nodes;
    if (!a.length) return undefined;
    const result = a[0]!;
    const last = a.pop()!;
    if (a.length) {
      let i = 0;
      while (true) {
        const l = 2 * i + 1, r = l + 1;
        if (l >= a.length) break;
        const child = r < a.length && this.values[a[r]!]!.duration < this.values[a[l]!]!.duration ? r : l;
        if (this.values[last]!.duration <= this.values[a[child]!]!.duration) break;
        a[i] = a[child]!;
        i = child;
      }
      a[i] = last;
    }
    return result;
  }
  get size() { return this.nodes.length; }
}

export type FullSearchMode = "All" | TransportMode;

export function planFullGtfs(
  index: FullGtfsIndex,
  origin: string,
  destination: string,
  mode: FullSearchMode = "All",
  maxResults = 6,
): CanonicalItinerary[] {
  const starts = findFullStops(index, origin);
  const targets = new Set(findFullStops(index, destination));
  if (!starts.length || !targets.size || norm(origin) === norm(destination)) return [];

  const states: Node[] = [];
  const heap = new MinHeap(states);
  const seen = new Map<string, number>();
  const results: CanonicalItinerary[] = [];
  const signatures = new Set<string>();
  const limit = 60000;
  const maxDuration = 240;

  const add = (node: Node) => {
    if (node.duration > maxDuration) return;
    const key = [node.stop, node.ride, node.boarded].join(":");
    const best = seen.get(key);
    if (best !== undefined && best <= node.duration) return;
    seen.set(key, node.duration);
    states.push(node);
    heap.push(states.length - 1);
  };

  starts.forEach((stop) =>
    add({ stop, ride: -1, boarded: 0, duration: 0, rideMinutes: 0, walkMinutes: 0,
      waitMinutes: 0, prev: -1, edgeKind: "origin", edgeMinutes: 0 }),
  );

  let expanded = 0;
  while (heap.size && expanded++ < limit && results.length < maxResults * 7) {
    const nodeIndex = heap.pop()!;
    const current = states[nodeIndex]!;
    const key = [current.stop, current.ride, current.boarded].join(":");
    if ((seen.get(key) ?? Infinity) < current.duration) continue;

    if (current.boarded > 0 && targets.has(current.stop)) {
      const result = toItinerary(index, states, nodeIndex, origin, destination);
      if (result) {
        const signature = result.legs.map((leg) =>
          [leg.routeId, leg.from, leg.to].join(":")).join("|");
        if (!signatures.has(signature) &&
          (mode !== "Mixed" || result.modesInvolved!.length > 1)) {
          signatures.add(signature);
          results.push(result);
        }
      }
      continue;
    }

    for (const [to, patternIndex, travelMinutes] of index.rides[current.stop] ?? []) {
      const pattern = index.data.patterns[patternIndex]!;
      const route = index.data.routes[pattern[0]]!;
      const transitMode = route[3];
      if (mode !== "All" && mode !== "Mixed" && transitMode !== mode) continue;
      const boarding = current.ride !== patternIndex;
      if (boarding && current.boarded >= 3) continue;
      const wait = boarding ? waitEstimate[transitMode] ?? 10 : 0;
      add({
        stop: to, ride: patternIndex,
        boarded: current.boarded + (boarding ? 1 : 0),
        duration: current.duration + travelMinutes + wait,
        rideMinutes: current.rideMinutes + travelMinutes,
        waitMinutes: current.waitMinutes + wait,
        walkMinutes: current.walkMinutes,
        prev: nodeIndex,
        edgeKind: "ride", edgeMinutes: travelMinutes,
      });
    }

    // Explicit GTFS walking links and labelled, unverified proximity links.
    for (const [to, walkingMinutes, source] of index.walks[current.stop] ?? []) {
      add({
        stop: to, ride: -1, boarded: current.boarded,
        duration: current.duration + walkingMinutes,
        rideMinutes: current.rideMinutes,
        waitMinutes: current.waitMinutes,
        walkMinutes: current.walkMinutes + walkingMinutes,
        prev: nodeIndex,
        edgeKind: "walk", edgeMinutes: walkingMinutes, edgeSource: source,
      });
    }
  }

  // The GTFS has overlapping Metro/rail trip patterns, sometimes for the
  // exact same passenger corridor. Count each physical route only once.
  const unique = deduplicatePhysicalJourneys(results, maxResults);
  if (unique.length > 1) unique[0]!.isFastest = true;
  return unique.map((it, i) => ({ ...it, optionIndex: i + 1 }));
}

function toItinerary(
  index: FullGtfsIndex,
  states: Node[],
  lastIndex: number,
  origin: string,
  destination: string,
): CanonicalItinerary | null {
  const path: Node[] = [];
  let idx = lastIndex;
  while (idx >= 0) {
    path.push(states[idx]!);
    idx = states[idx]!.prev;
  }
  path.reverse();

  const legs: JourneyLeg[] = [];
  const legStopPairs: Array<[number, number]> = [];
  const legShapeIds: string[] = [];
  const transfers: string[] = [];
  const sourceNotes = new Set<string>();
  let currentPattern = -1;
  let lastStop = -1;
  for (let i = 1; i < path.length; i++) {
    const step = path[i]!;
    const prev = path[i - 1]!;
    if (step.edgeKind === "walk") {
      sourceNotes.add(step.edgeSource || "estimated walk");
      currentPattern = -1;
      continue;
    }
    if (step.edgeKind !== "ride") continue;

    const pattern = index.data.patterns[step.ride]!;
    const route = index.data.routes[pattern[0]]!;
    const toName = index.data.stops[step.stop]![1];
    const fromName = index.data.stops[prev.stop]![1];
    const start = index.data.stops[prev.stop]!;
    const end = index.data.stops[step.stop]!;
    const edgeKm = coordinateDistanceKm([start[2], start[3]], [end[2], end[3]]);
    const hasCoords = end[2] != null && end[3] != null;
    if (step.ride === currentPattern && legs.length) {
      const leg = legs[legs.length - 1]!;
      leg.to = toName;
      leg.stops.push(toName);
      leg.durationMinutes += step.edgeMinutes;
      leg.distanceKm += edgeKm;
      if (hasCoords) leg.stopCoordinates?.push([end[2]!, end[3]!]);
      legStopPairs[legStopPairs.length - 1]![1] = step.stop;
    } else {
      if (legs.length > 0) transfers.push(fromName);
      const leg: JourneyLeg = {
        mode: route[3],
        routeId: route[0],
        routeName: [route[1], route[2]].filter(Boolean).join(" — ") || route[0],
        from: fromName,
        to: toName,
        direction: route[2] || pattern[3] || "Direction shown in GTFS",
        stops: [fromName, toName],
        durationMinutes: step.edgeMinutes,
        distanceKm: edgeKm,
        frequencyMinutes: 0,
        stopCoordinates: [
          ...(start[2] != null && start[3] != null ? [[start[2], start[3]] as [number, number]] : []),
          ...(hasCoords ? [[end[2]!, end[3]!] as [number, number]] : []),
        ],
      };
      legs.push(leg);
      legStopPairs.push([prev.stop, step.stop]);
      legShapeIds.push(pattern[5] || "");
    }
    currentPattern = step.ride;
    lastStop = step.stop;
  }
  if (!legs.length || lastStop < 0) return null;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!;
    const sourceShape = index.data.shapes?.[legShapeIds[i]!];
    const [fromStopIndex, toStopIndex] = legStopPairs[i]!;
    const from = index.data.stops[fromStopIndex]!;
    const to = index.data.stops[toStopIndex]!;
    const startCoord = from[2] != null && from[3] != null
      ? [from[2], from[3]] as LatLon : undefined;
    const endCoord = to[2] != null && to[3] != null
      ? [to[2], to[3]] as LatLon : undefined;
    const track = sliceGtfsShape(sourceShape, startCoord, endCoord);
    if (track) {
      leg.pathCoordinates = track;
      leg.pathSource = "gtfs-shape";
    }
  }
  const final = path[path.length - 1]!;
  const modesInvolved = [...new Set(legs.map((l) => l.mode))];
  const totalStops = legs.reduce((count, leg) => count + leg.stops.length - 1, 0);
  const transferCount = Math.max(0, legs.length - 1);
  return {
    id: "gtfs-" + legs.map((leg) => leg.routeId).join("-") + "-" + lastStop,
    origin, destination,
    mode: modesInvolved.length > 1 ? "Mixed" : modesInvolved[0]!,
    modesInvolved,
    routeName: legs.map((leg) => leg.routeName).join(" + "),
    legs,
    totalStops,
    totalDistanceKm: Math.round(legs.reduce((sum, leg) => sum + leg.distanceKm, 0) * 10) / 10,
    inVehicleMinutes: final.rideMinutes,
    walkingMinutes: final.walkMinutes,
    waitingMinutes: final.waitMinutes,
    transferMinutes: final.walkMinutes,
    initialWaitMinutes: final.waitMinutes > 0 ? waitEstimate[legs[0]!.mode] : 0,
    totalDurationMinutes: final.duration,
    timingLabel: "Static GTFS stop sequence. Travel and waiting times are estimates; dates and live arrivals are NOT verified. Proximity walks require pedestrian-path verification.",
    fare: estimateFullGtfsFare(index, legs, legStopPairs),
    transferCount,
    transferPoints: transfers,
    isFastest: false,
    boardingPoint: legs[0]!.from,
    arrivalPoint: legs[legs.length - 1]!.to,
    transferDescription: sourceNotes.has("proximity estimate")
      ? "One or more walking links are based on nearby stop coordinates, not verified pedestrian access."
      : undefined,
  };
}

export function lookupGtfsRoutes(index: FullGtfsIndex, query: string, mode: FullSearchMode = "All", limit = 12) {
  const q = norm(query);
  if (!q) return [];
  return index.data.routes.filter((route) =>
    (mode === "All" || mode === "Mixed" || mode === route[3]) &&
    (norm(route[1]) === q || norm(route[0]) === q || norm(route[2]).includes(q))
  ).slice(0, limit);
}
