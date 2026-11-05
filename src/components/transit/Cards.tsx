import { useState, useEffect, useRef } from "react";
import {
  Accessibility,
  AlertTriangle,
  ArrowRight,
  Bus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  Layers,
  Footprints,
  Share2,
  ArrowRightLeft,
  Phone,
  ShieldCheck,
  Ticket,
  TrainFront,
  Zap,
} from "lucide-react";
import type { Card, CanonicalItinerary, ComparisonItem } from "@/lib/transit/engine";
import {
  ROUTE_FILTERS,
  filterRouteOptions,
  routeFilterCounts,
  routeHighlights,
  type RouteFilter,
} from "@/lib/transit/route-options";
import { OFFICIAL_LINKS, type Alert, type StationFacility } from "@/lib/transit/data";

const Badge = ({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "warn" | "ok" | "danger" | "fast" | "neutral";
}) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
      tone === "fast"
        ? "bg-accent text-accent-foreground shadow-sm"
        : tone === "ok"
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : tone === "danger"
            ? "bg-destructive text-destructive-foreground"
            : tone === "warn"
              ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
              : "bg-muted text-muted-foreground"
    }`}
  >
    {children}
  </span>
);

const Shell = ({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: typeof Ticket;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="animate-rise rounded-2xl border bg-card p-4.5 shadow-soft transition-all hover:border-accent/40">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
      <div className="flex items-center gap-2">
        <Icon className="h-4.5 w-4.5 text-accent" />
        <h4 className="font-display text-sm font-semibold text-card-foreground">{title}</h4>
      </div>
      <div>{badge}</div>
    </div>
    {children}
  </div>
);

export function ResultCard({
  card,
  onSelectOption,
}: {
  card: Card;
  onSelectOption?: (itinerary: CanonicalItinerary) => void;
}) {
  if (card.kind === "route_options") {
    return (
      <RouteOptionsCard
        options={card.options}
        activeItineraryId={card.activeItineraryId}
        origin={card.origin}
        destination={card.destination}
        selectedFilter={card.selectedFilter}
        onSelectOption={onSelectOption}
      />
    );
  }
  if (card.kind === "journey") {
    return <JourneyCard itinerary={card.itinerary} />;
  }
  if (card.kind === "comparison") {
    return (
      <ComparisonCard
        items={card.items}
        origin={card.origin}
        destination={card.destination}
        fastestMode={card.fastestMode}
      />
    );
  }
  if (card.kind === "fare_breakdown") {
    return <FareBreakdownCard itinerary={card.itinerary} />;
  }
  if (card.kind === "facility") {
    return <FacilityCard station={card.station} facility={card.facility} />;
  }
  if (card.kind === "alerts") {
    return <AlertsCard alerts={card.alerts} />;
  }
  return <GrievanceCard card={card} />;
}

function JourneyCard({ itinerary: j }: { itinerary: CanonicalItinerary }) {
  const [showStops, setShowStops] = useState(false);

  const modeIcon = j.mode === "Metro" ? TrainFront : j.mode === "Bus" ? Bus : TrainFront;

  return (
    <Shell
      icon={modeIcon}
      title={`${j.origin} → ${j.destination}`}
      badge={
        <div className="flex items-center gap-1.5">
          {j.isFastest && (
            <Badge tone="fast">
              <Zap className="h-3 w-3" /> Fastest
            </Badge>
          )}
          <Badge tone="ok">{j.mode}</Badge>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Route header */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/60 p-3 text-sm">
          <div>
            <p className="font-display font-semibold text-foreground">{j.routeName}</p>
            <p className="text-xs text-muted-foreground">
              {j.totalStops} stops · ~{j.totalDistanceKm} km
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-base font-bold text-accent">
              ~{j.totalDurationMinutes} mins
            </p>
            <p className="text-xs font-semibold text-foreground">₹{j.fare.totalFare}</p>
          </div>
        </div>

        {/* Legs breakdown */}
        <div className="space-y-3">
          {j.legs.map((leg, i) => (
            <div key={i} className="rounded-xl border border-border/60 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">{leg.routeName}</span>
                <span className="text-xs text-muted-foreground">{leg.direction}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {leg.stops.length} stops (~{leg.durationMinutes} mins in-vehicle)
                </span>
                <span>Frequency: every {leg.frequencyMinutes}m</span>
              </div>

              {/* Stops toggle */}
              <button
                type="button"
                onClick={() => setShowStops(!showStops)}
                className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                {showStops ? "Hide station sequence" : "Show all stops"}
                {showStops ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>

              {showStops && (
                <ol className="mt-2 border-l-2 border-accent/40 pl-3 space-y-1 text-xs">
                  {leg.stops.map((s, idx) => (
                    <li
                      key={s}
                      className={
                        idx === 0 || idx === leg.stops.length - 1
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      {s} {idx === 0 ? "(Board)" : idx === leg.stops.length - 1 ? "(Alight)" : ""}
                    </li>
                  ))}
                </ol>
              )}

              {j.transferCount > 0 && i === 0 && (
                <div className="mt-2.5 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Transfer at {j.transferPoints[0]}: ~{j.transferMinutes} min walk to connecting
                  platform
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Timing and fare footer */}
        <div className="space-y-1.5 border-t pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-accent" />
            <span>
              Time breakdown: ~{j.inVehicleMinutes}m travel + ~{j.waitingMinutes}m wait
              {j.transferMinutes > 0 ? ` + ~${j.transferMinutes}m transfer` : ""} + ~
              {j.walkingMinutes}m walk
            </span>
          </div>
          <p className="italic text-[11px] opacity-80">{j.timingLabel}</p>
        </div>
      </div>
    </Shell>
  );
}

function ComparisonCard({
  items,
  origin,
  destination,
  fastestMode,
}: {
  items: ComparisonItem[];
  origin: string;
  destination: string;
  fastestMode: string;
}) {
  return (
    <Shell
      icon={Zap}
      title={`Route Comparison: ${origin} → ${destination}`}
      badge={<Badge tone="fast">Fastest: {fastestMode}</Badge>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="pb-2 font-semibold">Mode</th>
              <th className="pb-2 font-semibold">Est. Duration</th>
              <th className="pb-2 font-semibold">Fare</th>
              <th className="pb-2 font-semibold">Transfers</th>
              <th className="pb-2 font-semibold">Frequency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {items.map((item, idx) => (
              <tr key={idx} className={item.isFastest ? "bg-accent/5 font-medium" : ""}>
                <td className="py-2.5">
                  <div className="flex items-center gap-1.5">
                    {item.mode === "Metro" ? (
                      <TrainFront className="h-3.5 w-3.5 text-line-blue" />
                    ) : item.mode === "Bus" ? (
                      <Bus className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <TrainFront className="h-3.5 w-3.5 text-line-green" />
                    )}
                    <span>{item.mode}</span>
                    {item.isFastest && (
                      <span className="rounded bg-accent px-1.5 py-0.2 text-[9px] font-bold text-accent-foreground">
                        FASTEST
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 font-semibold text-foreground">
                  ~{item.durationMinutes} mins
                </td>
                <td className="py-2.5 font-semibold text-foreground">₹{item.totalFare}</td>
                <td className="py-2.5 text-muted-foreground">
                  {item.transfers === 0 ? "Direct" : `${item.transfers} transfer`}
                </td>
                <td className="py-2.5 text-muted-foreground">{item.frequency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Note: Durations are estimated based on GTFS schedules, inter-station distances and average
        road traffic. Live vehicle GPS delay tracking is not available.
      </p>
    </Shell>
  );
}

function FareBreakdownCard({ itinerary: j }: { itinerary: CanonicalItinerary }) {
  const f = j.fare;
  return (
    <Shell
      icon={Ticket}
      title={`Fare Breakdown: ${j.origin} → ${j.destination}`}
      badge={
        <Badge tone={f.fareDataStatus === "estimated" ? "warn" : "neutral"}>
          <Ticket className="h-3 w-3" />
          {f.fareDataStatus === "estimated"
            ? "Estimated Fare — Not Verified"
            : f.fareDataStatus === "official_gtfs"
              ? "GTFS Fare Reference"
              : "Published Fare Reference"}
        </Badge>
      }
    >
      <div className="space-y-3">
        <div className="flex items-baseline justify-between rounded-xl bg-muted/60 p-3">
          <div>
            <p className="text-xs text-muted-foreground">Total Standard Fare ({j.mode})</p>
            <p className="font-display text-2xl font-bold text-foreground">₹{f.totalFare}</p>
          </div>
          {f.discountNote && (
            <div className="text-right">
              <span className="rounded-md bg-accent-soft px-2 py-1 text-xs font-semibold text-accent">
                {f.discountNote}
              </span>
            </div>
          )}
        </div>

        {/* Fare components list */}
        <div className="space-y-2">
          {f.components.map((c, i) => (
            <div key={i} className="rounded-lg border p-2.5 text-xs">
              <div className="flex items-center justify-between font-medium">
                <span>{c.leg}</span>
                <span className="font-bold text-foreground">₹{c.amount}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{c.ticketType}</p>
              {c.notes && <p className="mt-0.5 text-muted-foreground/80">{c.notes}</p>}
            </div>
          ))}
        </div>

        {/* Booking links */}
        <div className="space-y-1.5 border-t pt-3 text-xs">
          <p className="font-semibold text-foreground">Official Ticketing Channels:</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {j.mode === "Metro" && (
              <>
                <a
                  href={OFFICIAL_LINKS.cmrlWhatsApp}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border bg-background px-3 py-1.5 font-medium text-accent hover:bg-accent hover:text-accent-foreground"
                >
                  CMRL WhatsApp QR (20% Off) <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href={OFFICIAL_LINKS.cmrlTickets}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border bg-background px-3 py-1.5 font-medium hover:bg-muted"
                >
                  CMRL Portal <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
            {j.mode === "Bus" && (
              <a
                href={OFFICIAL_LINKS.mtc}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border bg-background px-3 py-1.5 font-medium hover:bg-muted"
              >
                MTC Bus Pass Portal <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {j.mode === "Suburban Rail" && (
              <a
                href={OFFICIAL_LINKS.utsApp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border bg-background px-3 py-1.5 font-medium hover:bg-muted"
              >
                UTS Mobile App <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">
            Source: {f.fareSource} ·{" "}
            {f.fareDataStatus === "estimated"
              ? "Operator fare has not been verified for this journey."
              : `Reference date: ${f.lastVerificationDate}.`}{" "}
            Tickets must be purchased through official channels.
          </p>
        </div>
      </div>
    </Shell>
  );
}

function FacilityCard({ station, facility }: { station: string; facility: StationFacility }) {
  const checklist = [
    { label: "Lifts to Concourse & Platform", active: facility.hasLifts },
    { label: "Escalators Available", active: facility.hasEscalators },
    { label: "Wheelchair Accessible Entry / Ramps", active: facility.wheelchairAccessible },
    { label: "Tactile Ground Surface Indicators", active: facility.tactilePaving },
    { label: "Accessible Low-Height Ticket Counter", active: facility.accessibleTicketCounter },
    { label: "Designated Vehicle Parking", active: facility.parkingAvailable },
    { label: "Last-Mile Feeder Bus Facility", active: facility.feederBusAvailable },
  ];

  return (
    <Shell
      icon={Accessibility}
      title={`${station} — Station Facilities & Accessibility`}
      badge={<Badge tone="ok">Published Facilities</Badge>}
    >
      <div className="space-y-3">
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {checklist.map((item, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-2 rounded-lg p-2 ${
                item.active ? "bg-muted/50 text-foreground" : "text-muted-foreground opacity-60"
              }`}
            >
              <Check
                className={`h-3.5 w-3.5 ${item.active ? "text-accent font-bold" : "text-muted-foreground"}`}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {facility.notes && (
          <p className="rounded-lg bg-accent-soft/40 p-2.5 text-xs text-foreground">
            <b>Interchange Note:</b> {facility.notes}
          </p>
        )}

        <div className="flex items-center gap-2 border-t pt-2.5 text-xs text-muted-foreground">
          <Phone className="h-3.5 w-3.5 text-accent" />
          <span>
            <b>Station Helpline:</b> {facility.helpline}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground italic">
          Source: CUMTA Transit Data & Station Directory. Real-time lift maintenance status is not
          available.
        </p>
      </div>
    </Shell>
  );
}

function AlertsCard({ alerts }: { alerts: Alert[] }) {
  return (
    <Shell
      icon={AlertTriangle}
      title="Service Updates & Disruptions"
      badge={<Badge tone="danger">Simulation · Demo Dataset</Badge>}
    >
      <div className="space-y-2.5">
        {alerts.map((a) => (
          <div key={a.id} className="rounded-xl border border-border/80 bg-muted/40 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="font-semibold text-foreground">{a.affected}</span>
              <div className="flex items-center gap-1">
                <Badge tone="warn">{a.mode}</Badge>
                <Badge tone="neutral">{a.type}</Badge>
              </div>
            </div>
            <p className="mt-1 text-muted-foreground">{a.description}</p>
            {a.alternative && (
              <p className="mt-1 text-accent font-medium">Alternative: {a.alternative}</p>
            )}
            <p className="mt-1.5 text-[10px] text-muted-foreground/75">
              Source: {a.source} · Updated: {new Date(a.updatedAt).toLocaleString("en-IN")}
            </p>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground italic pt-1">
          Disclaimer: This is a demonstration alert feed for testing mobility disruption response in
          the CUMTA hackathon.
        </p>
      </div>
    </Shell>
  );
}

function GrievanceCard({ card }: { card: Extract<Card, { kind: "grievance" }> }) {
  const [d, setD] = useState(card.draft);
  const [copied, setCopied] = useState(false);

  const text = `Transport Operator: ${d.operator}\nStation / Route: ${d.location}\nIssue Category: ${d.category}\nDate & Time: ${d.datetime}\n\nDescription of Grievance:\n${d.description}`;

  const fields: [keyof typeof d, string][] = [
    ["operator", "Operator"],
    ["location", "Station / Route / Stop"],
    ["category", "Issue Category"],
    ["datetime", "Date & Time"],
  ];

  return (
    <Shell
      icon={AlertTriangle}
      title="Structured Grievance Draft"
      badge={<Badge tone="danger">Draft Only · Not Submitted</Badge>}
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Review or edit your complaint details below. Copy the formatted draft and submit it
          directly on the operator's official grievance portal.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {fields.map(([k, label]) => (
            <label key={k} className="text-xs font-semibold text-muted-foreground">
              {label}
              <input
                value={d[k] || ""}
                onChange={(e) => setD({ ...d, [k]: e.target.value })}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          ))}
        </div>

        <label className="block text-xs font-semibold text-muted-foreground">
          Detailed Description
          <textarea
            value={d.description || ""}
            onChange={(e) => setD({ ...d, description: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-accent" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied to Clipboard!" : "Copy Complaint Draft"}
          </button>
          <a
            href={card.link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bexport function RouteOptionsCard({
  options,
  activeItineraryId,
  origin,
  destination,
  selectedFilter = "All",
  onSelectOption,
}: {
  options: CanonicalItinerary[];
  activeItineraryId: string;
  origin: string;
  destination: string;
  selectedFilter?: string;
  onSelectOption?: (itinerary: CanonicalItinerary) => void;
}) {
  const [selectedId, setSelectedId] = useState(activeItineraryId);
  const [filter, setFilter] = useState<RouteFilter>(
    ROUTE_FILTERS.includes(selectedFilter as RouteFilter)
      ? (selectedFilter as RouteFilter)
      : "All",
  );
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [shareLabel, setShareLabel] = useState("Share Journey");
  const [expandedStops, setExpandedStops] = useState<string[]>([]);
  const slider = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedId(activeItineraryId);
  }, [activeItineraryId]);

  useEffect(() => {
    if (ROUTE_FILTERS.includes(selectedFilter as RouteFilter)) {
      setFilter(selectedFilter as RouteFilter);
    }
  }, [selectedFilter]);

  const counts = routeFilterCounts(options);
  const highlights = routeHighlights(options);
  const displayed = filterRouteOptions(options, filter);
  const selected = options.find((route) => route.id === selectedId) ?? options[0];

  const selectRoute = (route: CanonicalItinerary) => {
    setSelectedId(route.id);
    setDetailsOpen(true);
    setExpandedStops([]);
    onSelectOption?.(route);
  };

  const chooseFilter = (next: RouteFilter) => {
    setFilter(next);
    slider.current?.scrollTo({ left: 0, behavior: "smooth" });
  };

  const shareJourney = async () => {
    if (!selected) return;
    const message = [
      "NammaTransit AI - Estimated Journey",
      origin + " to " + destination,
      selected.routeName,
      "Time: approximately " + selected.totalDurationMinutes + " minutes",
      "Fare: approximately INR " + selected.fare.totalFare + " (" + selected.fare.fareDataStatus + ")",
      "Legs:",
      ...selected.legs.map(
        (leg, i) =>
          String(i + 1) + ". " + leg.mode + ": " + leg.routeName + " (" + leg.from + " to " + leg.to + ")",
      ),
      "Static routing data. Check current services and fares with operators.",
    ].join("\n");

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "NammaTransit AI Journey", text: message });
        setShareLabel("Shared");
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
        setShareLabel("Copied!");
      } else {
        setShareLabel("Share unavailable");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setShareLabel("Share unavailable");
    }
  };

  const filterIcon = (name: RouteFilter) => {
    switch (name) {
      case "Fastest": return <Zap className="h-4 w-4" />;
      case "Metro": return <TrainFront className="h-4 w-4" />;
      case "Bus": return <Bus className="h-4 w-4" />;
      case "Suburban Rail": return <TrainFront className="h-4 w-4" />;
      case "Mixed": return <ArrowRightLeft className="h-4 w-4" />;
      default: return <Layers className="h-4 w-4" />;
    }
  };

  return (
    <section className="animate-rise min-w-0 rounded-3xl border border-border/70 bg-card p-3 shadow-soft sm:p-5" aria-label="Route alternatives">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-foreground sm:text-lg">
              Route Alternatives ({options.length})
            </h3>
            <p className="truncate text-xs text-muted-foreground">{origin} → {destination}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={shareJourney}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-2 text-xs font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <Share2 className="h-3.5 w-3.5 text-accent" />
            {shareLabel}
          </button>
          <button type="button" onClick={() => setDetailsOpen(!detailsOpen)}
            aria-expanded={detailsOpen}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-2 text-xs font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            {detailsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {detailsOpen ? "Hide Details" : "Show Details"}
          </button>
        </div>
      </header>

      <nav aria-label="Filter transport alternatives" className="mt-3 flex gap-2 overflow-x-auto pb-3">
        {ROUTE_FILTERS.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={filter === name}
            onClick={() => chooseFilter(name)}
            className={[
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              filter === name
                ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                : "border-border bg-muted/30 text-muted-foreground hover:border-emerald-400 hover:bg-muted",
            ].join(" ")}
          >
            {filterIcon(name)}
            {name}
            <span className={[
              "rounded-full px-1.5 py-0.5 text-[10px]",
              filter === name ? "bg-white/20 text-white" : "bg-muted text-foreground",
            ].join(" ")}>{counts[name]}</span>
          </button>
        ))}
      </nav>

      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">Select a card to compare. Swipe sideways for more routes.</p>
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-label="Scroll route cards left"
            onClick={() => slider.current?.scrollBy({ left: -310, behavior: "smooth" })}
            className="rounded-full border border-border p-1.5 text-muted-foreground hover:bg-muted">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Scroll route cards right"
            onClick={() => slider.current?.scrollBy({ left: 310, behavior: "smooth" })}
            className="rounded-full border border-border p-1.5 text-muted-foreground hover:bg-muted">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {displayed.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No {filter === "Fastest" ? "comparable fastest" : filter.toLowerCase()} route is available in the current results.
          <button type="button" onClick={() => chooseFilter("All")}
            className="ml-2 font-semibold text-accent underline underline-offset-2">
            Show all
          </button>
        </div>
      ) : (
        <div ref={slider} className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto pb-3" aria-label="Selectable route cards">
          {displayed.map((route, index) => {
            const active = route.id === selected?.id;
            const direct = route.transferCount === 0;
            const cheapest = highlights.cheapestId === route.id;
            const leastWalking = highlights.leastWalkingId === route.id;
            const fastest = highlights.fastestId === route.id;
            return (
              <button
                key={route.id}
                type="button"
                aria-pressed={active}
                aria-label={"Select option " + (route.optionIndex ?? index + 1) + ": " + route.routeName}
                onClick={() => selectRoute(route)}
                className={[
                  "flex w-[84%] min-w-[245px] shrink-0 snap-start flex-col rounded-3xl border p-4 text-left transition",
                  "sm:w-[47%] xl:w-[31.5%] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  active
                    ? "border-emerald-500 bg-emerald-50/70 shadow-md ring-2 ring-emerald-400/70 dark:bg-emerald-950/30"
                    : "border-border bg-card hover:border-emerald-300 hover:shadow-sm",
                ].join(" ")}
              >
                <div className="mb-3 flex min-h-12 flex-wrap content-start items-start gap-1.5">
                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                    #{route.optionIndex ?? index + 1}
                  </span>
                  {fastest && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                      <Zap className="h-3 w-3" /> FASTEST EST.
                    </span>
                  )}
                  {cheapest && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      LOWEST EST. FARE
                    </span>
                  )}
                  {direct && (
                    <span className="rounded-full bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-900 dark:bg-sky-950 dark:text-sky-200">
                      DIRECT ROUTE
                    </span>
                  )}
                  {leastWalking && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-1 text-[10px] font-bold text-teal-900 dark:bg-teal-950 dark:text-teal-200">
                      <Footprints className="h-3 w-3" /> LEAST WALKING
                    </span>
                  )}
                </div>

                {active && <span className="mb-2 self-end text-xs font-semibold text-emerald-700 dark:text-emerald-300"><Check className="mr-1 inline h-3.5 w-3.5" />Selected</span>}
                <div className="flex w-full items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 min-h-10 font-display text-sm font-bold leading-snug text-foreground">
                      {route.routeName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{route.mode === "Mixed" ? route.modesInvolved?.join(" + ") : route.mode}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-xl font-bold tabular-nums text-accent">~{route.totalDurationMinutes}</p>
                    <p className="text-[10px] text-muted-foreground">min</p>
                    <p className="mt-1 text-xs font-semibold tabular-nums text-foreground">₹{route.fare.totalFare}</p>
                  </div>
                </div>

                <div className="mt-3 flex min-h-12 flex-wrap items-center gap-1.5 rounded-2xl bg-muted/60 p-2">
                  {route.legs.map((leg, legIndex) => (
                    <span key={leg.routeId + "-" + legIndex} className="inline-flex max-w-full items-center gap-1">
                      {legIndex > 0 && <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                      <span className="inline-flex max-w-[150px] items-center gap-1 truncate rounded-lg border border-border/60 bg-card px-2 py-1 text-[10px] font-semibold text-foreground">
                        {leg.mode === "Bus" ? <Bus className="h-3 w-3 shrink-0" /> : <TrainFront className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{leg.routeName}</span>
                      </span>
                    </span>
                  ))}
                </div>

                <div className="mt-3 grid w-full grid-cols-3 gap-1 border-t border-border/60 pt-3 text-center">
                  <div><p className="font-bold text-foreground">{route.transferCount}</p><p className="text-[10px] text-muted-foreground">Transfers</p></div>
                  <div><p className="font-bold text-foreground">{route.totalStops}</p><p className="text-[10px] text-muted-foreground">Stops</p></div>
                  <div><p className="font-bold text-foreground">~{route.walkingMinutes}m</p><p className="text-[10px] text-muted-foreground">Walking</p></div>
                </div>
                <div className="mt-3 flex w-full flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span>Ride ~{route.inVehicleMinutes}m</span>
                  <span>Wait ~{route.waitingMinutes}m</span>
                </div>
                <div className={[
                  "mt-auto w-full border-t border-border/60 pt-3 text-center text-xs font-semibold",
                  active ? "text-emerald-700 dark:text-emerald-300" : "text-accent",
                ].join(" ")}>
                  {active ? "Active Route" : "Select Option"}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {detailsOpen && selected && (
        <section className="mt-3 rounded-2xl border border-border/70 bg-muted/20 p-3 sm:p-4" aria-label="Selected itinerary details">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                Currently selected journey
              </p>
              <h4 className="mt-1 font-display text-sm font-bold text-foreground">{selected.routeName}</h4>
              <p className="text-xs text-muted-foreground">
                {selected.transferCount} transfer(s) · {selected.totalStops} stops · estimated {selected.totalDistanceKm} km
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-bold text-accent">~{selected.totalDurationMinutes} min</p>
              <p className="text-sm font-bold text-foreground">₹{selected.fare.totalFare} <span className="text-[10px] font-normal text-muted-foreground">estimated / reference</span></p>
            </div>
          </div>

          <ol className="mt-3 space-y-3">
            {selected.legs.map((leg, index) => {
              const key = selected.id + "-leg-" + index;
              const isExpanded = expandedStops.includes(key);
              return (
                <li key={key} className="rounded-xl border border-border/60 bg-card p-3">
                  <div className="flex items-start gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{leg.mode}: {leg.routeName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{leg.from} → {leg.to}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {Math.max(0, leg.stops.length - 1)} stops · ~{leg.durationMinutes} min ride · estimated frequency {leg.frequencyMinutes} min
                      </p>
                      <button type="button"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedStops((old) =>
                            isExpanded ? old.filter((item) => item !== key) : [...old, key],
                          )
                        }>
                        {isExpanded ? "Hide stops" : "Show all stops"}
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      {isExpanded && (
                        <ol className="mt-2 ml-3 list-decimal space-y-1 text-xs text-muted-foreground">
                          {leg.stops.map((stop, i) => <li key={stop + i}>{stop}</li>)}
                        </ol>
                      )}
                    </div>
                  </div>
                  {index < selected.legs.length - 1 && (
                    <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      Change services{selected.transferPoints[index] ? " at " + selected.transferPoints[index] : ""}. Follow station/stop signs and confirm walking access.
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-card p-3 text-center text-xs">
            <div><p className="font-bold text-foreground">~{selected.inVehicleMinutes}m</p><p className="text-muted-foreground">Travel</p></div>
            <div><p className="font-bold text-foreground">~{selected.waitingMinutes}m</p><p className="text-muted-foreground">Waiting</p></div>
            <div><p className="font-bold text-foreground">~{selected.walkingMinutes}m</p><p className="text-muted-foreground">Walking</p></div>
          </div>
          <p className="mt-2 text-[11px] italic text-muted-foreground">
            {selected.timingLabel} Fares and timings are estimates or reference values; not live arrivals.
          </p>
        </section>
      )}
    </section>
  );
}
