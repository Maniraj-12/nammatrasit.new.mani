import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RefreshCcw, Route, TrafficCone } from "lucide-react";
import type { CanonicalItinerary } from "@/lib/transit/engine";
import { buildTrafficRequest } from "@/lib/transit/traffic/logic";
import type { TrafficCompareResponse, TrafficResult } from "@/lib/transit/traffic/types";

/**
 * Google traffic content is ONLY shown here, on a Google map.
 * Leaflet must not be mounted at the same time as this panel:
 * Google Maps Routes API service terms prohibit use with non-Google maps.
 */
const PUBLIC_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY?.trim() ?? "";
let scriptPromise: Promise<void> | null = null;

function loadGoogleMap(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No browser"));
  if (window.google?.maps?.Map && window.google?.maps?.TrafficLayer) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://maps.googleapis.com/maps/api/js?key=" +
      encodeURIComponent(PUBLIC_MAPS_KEY) + "&libraries=geometry&v=weekly";
    script.onload = () => {
      if (window.google?.maps?.Map) resolve();
      else reject(new Error("Google Maps did not initialise"));
    };
    script.onerror = () => reject(new Error("Google Maps script could not load"));
    document.head.appendChild(script);
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

function readMinutes(result: TrafficResult | undefined): string {
  if (!result || result.adjustedTotalMinutes === null) return "Unavailable";
  return "~" + result.adjustedTotalMinutes + " min";
}

function etaAt(minutes: number, sourceTime: string): string {
  const origin = Date.parse(sourceTime);
  if (!Number.isFinite(origin)) return "Unknown";
  return new Date(origin + minutes * 60_000).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit",
  });
}

function GoogleTrafficMap({
  selected, result,
}: {
  selected: CanonicalItinerary;
  result: TrafficResult | undefined;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!container.current || !PUBLIC_MAPS_KEY) return;
    let stopped = false;
    let map: google.maps.Map | null = null;
    let trafficLayer: google.maps.TrafficLayer | null = null;
    const tracks: google.maps.Polyline[] = [];
    const pins: google.maps.Marker[] = [];

    void loadGoogleMap().then(() => {
      if (stopped || !container.current) return;
      const allStops = selected.legs.flatMap((leg) => leg.stopCoordinates ?? []);
      const first = allStops[0] ?? [13.06, 80.24];
      map = new google.maps.Map(container.current, {
        center: { lat: first[0], lng: first[1] },
        zoom: 11, mapTypeControl: false, streetViewControl: false,
      });
      trafficLayer = new google.maps.TrafficLayer();
      trafficLayer.setMap(map);
      const bounds = new google.maps.LatLngBounds();

      // Draw the Google Routes road geometry on the Google map only.
      for (const encoded of result?.googleBusRoutePolylines ?? []) {
        if (!encoded || !google.maps.geometry?.encoding) continue;
        const routePoints = google.maps.geometry.encoding.decodePath(encoded);
        if (!routePoints.length) continue;
        tracks.push(new google.maps.Polyline({
          path: routePoints, map, geodesic: false,
          strokeColor: "#ea580c", strokeWeight: 5, strokeOpacity: 0.86,
        }));
        routePoints.forEach((p) => bounds.extend(p));
      }

      // Published GTFS Metro/rail geometry is independent of Google content
      // and can be drawn on the Google map. Unknown tracks are stops only.
      for (const leg of selected.legs) {
        if (leg.mode !== "Bus" && leg.pathSource === "gtfs-shape" &&
            (leg.pathCoordinates?.length ?? 0) >= 3) {
          const points = leg.pathCoordinates!.map(([lat,lng])=>({lat,lng}));
          tracks.push(new google.maps.Polyline({
            map, path: points,
            strokeColor: leg.mode === "Metro" ? "#2563eb" : "#9333ea",
            strokeWeight: 4, strokeOpacity: 0.9,
          }));
          points.forEach((p)=>bounds.extend(p));
        }
        for (const [lat, lng] of leg.stopCoordinates ?? []) bounds.extend({lat,lng});
      }
      const last = allStops[allStops.length - 1];
      for(const [point, label] of [[first, "Boarding stop"], [last, "Destination"]] as const) {
        if (!point) continue;
        pins.push(new google.maps.Marker({
          position: {lat: point[0], lng: point[1]}, map,
          title: label,
        }));
      }
      if (!bounds.isEmpty()) map.fitBounds(bounds, 35);
    }).catch(() => {
      if (!stopped) setError("Google Maps could not load. Verify your browser key, referrer restrictions and billing.");
    });
    return () => {
      stopped = true;
      trafficLayer?.setMap(null);
      tracks.forEach((track) => track.setMap(null));
      pins.forEach((pin) => pin.setMap(null));
    };
  }, [selected, result]);

  return (
    <section aria-label="Google traffic map" className="space-y-2">
      <div ref={container} className="h-[245px] w-full rounded-lg border bg-slate-100 sm:h-[325px]" />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      <p className="text-[11px] text-muted-foreground">
        Google Maps traffic layer: green/amber/red indicate road congestion where Google has coverage.
        Orange is a Google road-route approximation via GTFS bus stops, not an official MTC vehicle path.
        Blue/purple reflects available GTFS rail shapes. No live vehicle GPS is shown.
      </p>
    </section>
  );
}

export function GoogleTrafficComparison({
  options, selectedId, onSelect,
}: {
  options: CanonicalItinerary[];
  selectedId: string;
  onSelect?: (itinerary: CanonicalItinerary) => void;
}) {
  const candidates = useMemo(() => buildTrafficRequest(options), [options]);
  const [response, setResponse] = useState<TrafficCompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = options.find((it) => it.id === selectedId) ?? options[0];

  async function refreshTraffic() {
    if (!PUBLIC_MAPS_KEY || loading) return;
    setLoading(true);
    setError("");
    try {
      const request = await fetch("/api/traffic-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(candidates),
        cache: "no-store",
      });
      if (!request.ok) {
        setError(request.status === 429
          ? "Traffic lookups are temporarily rate-limited. Try later."
          : "Traffic service is unavailable in this preview or its server configuration is incomplete.");
        setResponse(null);
        return;
      }
      const data = (await request.json()) as TrafficCompareResponse;
      setResponse(data);
    } catch {
      setError("The app preview could not reach the traffic-aware server endpoint.");
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setResponse(null);
  }, [options]);

  const outcome = response?.journeys.find((x) => x.id === selected?.id);
  const hasRoad = options.some((it) => it.legs.some((leg) => leg.mode === "Bus"));

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrafficCone className="h-4 w-4 text-orange-600" />
          <h5 className="font-bold text-sm">Traffic-aware journey comparison</h5>
        </div>
        <button type="button" disabled={!PUBLIC_MAPS_KEY || loading || !hasRoad}
          onClick={() => void refreshTraffic()}
          className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">
          <RefreshCcw className="h-3.5 w-3.5" />
          {loading ? "Checking traffic…" : "Calculate current traffic"}
        </button>
      </div>

      {!PUBLIC_MAPS_KEY ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
          <strong>Google Maps not configured.</strong> Add a referrer-restricted
          <code> VITE_GOOGLE_MAPS_BROWSER_KEY </code> plus a separately secured server Routes
          API key and enable billing. The current results below remain static estimates.
        </div>
      ) : selected ? <GoogleTrafficMap selected={selected} result={outcome} /> : null}

      {!hasRoad && <p className="text-xs text-muted-foreground">No MTC road legs are present. Rail options use static timetable-based estimates; no road-traffic adjustment is necessary.</p>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

      <div className="grid gap-2 sm:grid-cols-2">
        {options.slice(0, 6).map((option) => {
          const result = response?.journeys.find((x) => x.id === option.id);
          const completeFastest = response?.comparisonComplete && response.fastestId === option.id;
          return (
            <button key={option.id} type="button" onClick={() => onSelect?.(option)}
              className={"rounded-lg border bg-white p-3 text-left text-xs hover:border-blue-400 " +
                (option.id === selectedId ? "border-blue-500" : "border-slate-200")}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{option.mode}: Option {option.optionIndex ?? options.indexOf(option) + 1}</span>
                {completeFastest && <span className="font-bold text-emerald-700">Fastest traffic-aware estimate</span>}
              </div>
              <p className="mt-1 truncate text-slate-600" title={option.routeName}>{option.routeName}</p>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-slate-600">Static ~{option.totalDurationMinutes} min</span>
                <span className="font-semibold">{readMinutes(result)}</span>
              </div>
              {result?.status === "TRAFFIC_AWARE" && <p className="mt-1 text-blue-700">
                Traffic difference {result.congestionAdjustmentMinutes! >= 0 ? "+" : ""}{result.congestionAdjustmentMinutes} min
                {result.adjustedTotalMinutes != null && response &&
                  " · Est. arrival " + etaAt(result.adjustedTotalMinutes, response.requestedAt)}
              </p>}
              {result?.status === "NOT_APPLICABLE" && <p className="mt-1 text-slate-600">Rail: static estimate; real train delays unavailable</p>}
              {result?.status === "UNAVAILABLE" && <p className="mt-1 text-amber-700">Road traffic unavailable</p>}
            </button>
          );
        })}
      </div>

      {response && !response.comparisonComplete && (
        <p role="status" className="flex items-center gap-2 text-xs text-amber-700">
          <AlertTriangle className="h-4 w-4" /> Traffic comparison is incomplete.
          No traffic-aware fastest journey can be confirmed for all available choices.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {response?.disclaimer ?? "Traffic checking is optional. It requires Google Maps billing and a working server-side API. Road congestion is applied to buses only; Metro and suburban estimates exclude live train delays."}
      </p>
      <p className="text-[11px] text-muted-foreground">
        <Route className="mr-1 inline h-3 w-3" />
        Estimates include existing GTFS walking, waiting and vehicle timing assumptions.
        Traffic is applied to MTC portions only. Not an official MTC arrival prediction.
      </p>
    </div>
  );
}
