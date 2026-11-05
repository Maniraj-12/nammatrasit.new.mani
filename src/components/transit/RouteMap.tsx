import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, MapPinned, RadioTower } from "lucide-react";
import type { CanonicalItinerary } from "@/lib/transit/engine";
import {
  itineraryMapSegments, type TransitMapSegment,
} from "@/lib/transit/route-map-data";
import { roadAlignedBusPath } from "@/lib/transit/road-routing";
import { LiveArrivalStatus } from "./LiveArrivalStatus";
import "leaflet/dist/leaflet.css";

/**
 * Draw trip-specific GTFS track shapes and route-on-road approximations.
 * Do NOT connect stop positions with solid straight lines: these are not
 * driveable bus routes or railway tracks.
 */
export function RouteMap({ itinerary }: { itinerary: CanonicalItinerary }) {
  const host = useRef<HTMLDivElement | null>(null);
  const segments = useMemo(() => itineraryMapSegments(itinerary), [itinerary]);
  const [mappedSegments, setMappedSegments] = useState<TransitMapSegment[]>(segments);
  const [roadStatus, setRoadStatus] = useState<"none" | "loading" | "ready" | "unavailable">("none");

  useEffect(() => {
    let cancelled = false;
    setMappedSegments(segments);

    const needsRoad = segments.some((segment) =>
      segment.mode === "Bus" && !segment.geometry && segment.coordinates.length >= 2);
    if (!needsRoad) {
      setRoadStatus("none");
      return () => { cancelled = true; };
    }
    setRoadStatus("loading");

    void Promise.all(segments.map(async (segment): Promise<TransitMapSegment> => {
      if (segment.mode !== "Bus" || segment.geometry || segment.coordinates.length < 2) {
        return segment;
      }
      const road = await roadAlignedBusPath(segment.coordinates);
      return road ? {
        ...segment, geometry: road, geometrySource: "road-router",
      } : segment;
    })).then((result) => {
      if (cancelled) return;
      setMappedSegments(result);
      setRoadStatus(result.some((segment) => segment.geometrySource === "road-router")
        ? "ready" : "unavailable");
    });

    return () => { cancelled = true; };
  }, [segments]);

  useEffect(() => {
    if (!host.current || !mappedSegments.length) return;
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    const container = host.current;

    void import("leaflet").then((L) => {
      if (cancelled || !container) return;
      map = L.map(container, {
        scrollWheelZoom: false,
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const colours: Record<string, string> = {
        Bus: "#ea580c",
        Metro: "#2563eb",
        "Suburban Rail": "#9333ea",
      };
      const bounds = L.latLngBounds([]);

      for (const segment of mappedSegments) {
        const colour = colours[segment.mode] || "#059669";

        // A solid line is only allowed for published GTFS shape geometry
        // or a returned OSM road-routing geometry. Never draw one from stops.
        if (segment.geometry && segment.geometry.length >= 3 && segment.geometrySource) {
          const attribution = segment.geometrySource === "gtfs-shape"
            ? "Trip geometry from GTFS shapes.txt"
            : "OSM driving-route approximation — not the confirmed MTC road itinerary";
          L.polyline(segment.geometry, {
            color: colour,
            weight: 5,
            opacity: 0.9,
            lineJoin: "round",
          }).bindTooltip(segment.mode + " — " + attribution).addTo(map);
          segment.geometry.forEach((point) => bounds.extend(point));
        }

        // Keep genuine stops visible even when precise geometry is missing.
        segment.coordinates.forEach((point, index) => {
          L.circleMarker(point, {
            color: colour,
            fillColor: "#ffffff",
            fillOpacity: 1,
            weight: 2,
            radius: index === 0 || index === segment.coordinates.length - 1 ? 5 : 3,
          }).bindTooltip(segment.mode + " stop — " + segment.name).addTo(map);
          bounds.extend(point);
        });
      }

      const allStops = mappedSegments.flatMap((segment) => segment.coordinates);
      const first = allStops[0];
      const last = allStops[allStops.length - 1];
      if (first) {
        L.circleMarker(first, {
          radius: 8, color: "#064e3b", fillColor: "#34d399",
          fillOpacity: 1, weight: 2,
        }).bindTooltip("Start", { permanent: false }).addTo(map);
      }
      if (last) {
        L.circleMarker(last, {
          radius: 8, color: "#7f1d1d", fillColor: "#fb7185",
          fillOpacity: 1, weight: 2,
        }).bindTooltip("Destination", { permanent: false }).addTo(map);
      }
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.18), { maxZoom: 15 });
    }).catch((error) => {
      console.warn("Map rendering unavailable", error);
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [mappedSegments]);

  const modes = [...new Set(itinerary.legs.map((leg) => leg.mode))];
  const withGeometry = mappedSegments.filter((segment) => segment.geometry && segment.geometrySource);
  const withoutGeometry = mappedSegments.length - withGeometry.length;

  return (
    <section className="mt-4 rounded-xl border border-border/70 bg-card p-3" aria-label="Selected transit route map">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPinned className="h-4 w-4 text-emerald-600" />
          <h5 className="text-sm font-bold">Selected journey map</h5>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">
          GTFS tracks / OSM roads · Not live GPS
        </span>
      </div>

      {segments.length ? (
        <div
          ref={host}
          className="h-[245px] w-full overflow-hidden rounded-lg border bg-slate-100 sm:h-[325px]"
          role="img"
          aria-label="Map showing selected transit stops and aligned paths where verified geometry is available"
        />
      ) : (
        <div className="grid h-28 place-items-center rounded-lg border border-dashed bg-muted/30 p-3 text-center text-xs text-muted-foreground">
          Geographic stop coordinates are not available for this journey.
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {modes.includes("Bus") && <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-600" />MTC Bus</span>}
        {modes.includes("Metro") && <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" />Metro</span>}
        {modes.includes("Suburban Rail") && <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-purple-600" />Suburban Rail</span>}
      </div>

      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
        {mappedSegments.some((segment) => segment.geometrySource === "gtfs-shape") && (
          <p>Metro track alignment follows the published trip's GTFS shape, where the source matches your boarding and alighting stations.</p>
        )}
        {roadStatus === "loading" && <p role="status">Checking OpenStreetMap roads for the selected bus route…</p>}
        {roadStatus === "ready" && (
          <p>Bus line follows an OpenStreetMap driving-route approximation through its recorded stops. Actual MTC road directions may differ.</p>
        )}
        {roadStatus === "unavailable" && (
          <p role="status">Road geometry is unavailable; showing bus stops without an invented straight-line route.</p>
        )}
        {withoutGeometry > 0 && roadStatus !== "loading" && (
          <p>Some segments have stop locations only. Their road/track alignment is not confirmed, so no solid route line is drawn.</p>
        )}
      </div>

      <div role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <div className="flex items-center gap-2 font-semibold">
          <RadioTower className="h-4 w-4" />
          Live tracking requires an authorised data provider
        </div>
        <p className="mt-1">
          The provider integration is permission-gated. Road-aligned route lines are static, not live vehicle positions or arrival predictions.
        </p>
        <LiveArrivalStatus itinerary={itinerary} />
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
