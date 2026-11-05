import { useEffect, useMemo, useRef } from "react";
import { ExternalLink, MapPinned, RadioTower } from "lucide-react";
import type { CanonicalItinerary } from "@/lib/transit/engine";
import { itineraryMapSegments } from "@/lib/transit/route-map-data";
import "leaflet/dist/leaflet.css";

/**
 * Interactive geographic representation of selected GTFS route stop coordinates.
 * No moving vehicle or ETA is shown without a licensed/authorised provider feed.
 * Connecting stop coordinates with straight lines is NOT a navigable road path.
 */
export function RouteMap({ itinerary }: { itinerary: CanonicalItinerary }) {
  const host = useRef<HTMLDivElement | null>(null);
  const segments = useMemo(() => itineraryMapSegments(itinerary), [itinerary]);
  useEffect(() => {
    if (!host.current || !segments.length) return;
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    const container = host.current;

    void import("leaflet").then((L) => {
      if (cancelled || !container) return;
      map = L.map(container, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const palette: Record<string, string> = {
        Bus: "#ea580c", Metro: "#2563eb", "Suburban Rail": "#9333ea",
      };
      const bounds = L.latLngBounds([]);
      for (const segment of segments) {
        const coordinates = segment.coordinates as [number, number][];
        const color = palette[segment.mode] || "#059669";
        L.polyline(coordinates, { color, weight: 5, opacity: 0.85 }).addTo(map);
        for (const point of coordinates) bounds.extend(point);
      }
      const points = segments.flatMap((segment) => segment.coordinates);
      if (points[0]) {
        L.circleMarker(points[0], { radius: 8, weight: 2, color: "#064e3b", fillColor: "#34d399", fillOpacity: 1 })
          .addTo(map);
      }
      const last = points[points.length - 1];
      if (last) {
        L.circleMarker(last, { radius: 8, weight: 2, color: "#7f1d1d", fillColor: "#fb7185", fillOpacity: 1 })
          .addTo(map);
      }
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.15), { maxZoom: 15 });
    }).catch((err) => {
      console.warn("Map tiles/Leaflet unavailable", err);
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [segments]);

  const modes = [...new Set(itinerary.legs.map((leg) => leg.mode))];

  return (
    <section className="mt-4 rounded-xl border border-border/70 bg-card p-3" aria-label="Selected transit route map">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-emerald-600" />
          <h5 className="text-sm font-bold">Selected journey map</h5>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
          GTFS stop positions — not live GPS
        </span>
      </div>

      {segments.length ? (
        <div ref={host} className="h-[245px] w-full overflow-hidden rounded-lg border bg-slate-100 sm:h-[325px]" role="img"
          aria-label="Map showing the selected transit route using geographic GTFS stop points" />
      ) : (
        <div className="grid h-28 place-items-center rounded-lg border border-dashed bg-muted/30 p-3 text-center text-xs text-muted-foreground">
          Map coordinates are not available for this manually curated route.
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {modes.includes("Bus") && <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-600" />MTC Bus</span>}
        {modes.includes("Metro") && <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" />Metro</span>}
        {modes.includes("Suburban Rail") && <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-purple-600" />Suburban Rail</span>}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Lines connect recorded stop coordinates; they do not follow actual roads,
        tracks or verified walking paths. Always confirm interchanges in person.
      </p>
      <div role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <div className="flex items-center gap-2 font-semibold">
          <RadioTower className="h-4 w-4" />
          Live vehicle locations and arrival countdowns: unavailable
        </div>
        <p className="mt-1">
          An authorised GTFS-Realtime or operator API has not been connected.
          Static journey duration is not a live ETA.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          {modes.includes("Bus") && (
            <a href="https://mtcbus.tn.gov.in/" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
              Official MTC tracking <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {modes.includes("Metro") && (
            <a href="https://chennaimetrorail.org/" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
              Official CMRL <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
