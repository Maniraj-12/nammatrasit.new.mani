import { useState, useEffect } from "react";
import {
  Accessibility,
  AlertTriangle,
  ArrowRight,
  Bus,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  Layers,
  Phone,
  ShieldCheck,
  Ticket,
  TrainFront,
  Zap,
} from "lucide-react";
import type { Card, CanonicalItinerary, ComparisonItem } from "@/lib/transit/engine";
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
  onSelectOption?: (optionIndex: number) => void;
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
        <Badge tone={f.fareDataStatus === "official_gtfs" ? "ok" : "warn"}>
          <ShieldCheck className="h-3 w-3" />
          {f.fareDataStatus === "official_gtfs" ? "Verified GTFS Tariff" : "Published Tariff"}
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
            Source: {f.fareSource} · Last verified: {f.lastVerificationDate}. Tickets must be
            purchased through official channels.
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
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
          >
            Official Grievance Portal <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </Shell>
  );
}

export function RouteOptionsCard({
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
  onSelectOption?: (optionIndex: number) => void;
}) {
  const [selectedId, setSelectedId] = useState(activeItineraryId);
  const [filter, setFilter] = useState<string>(selectedFilter || "All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(activeItineraryId);
  }, [activeItineraryId]);

  const filterTabs = [
    "All",
    "Fastest",
    "Metro",
    "Bus",
    "Suburban Rail",
    "Mixed",
    "Lowest Fare",
    "Fewest Transfers",
  ];

  let displayed = [...options];

  if (filter === "Fastest") {
    displayed.sort((a, b) => a.totalDurationMinutes - b.totalDurationMinutes);
  } else if (filter === "Lowest Fare") {
    displayed.sort((a, b) => a.fare.totalFare - b.fare.totalFare);
  } else if (filter === "Fewest Transfers") {
    displayed.sort((a, b) => a.transferCount - b.transferCount);
  } else if (filter === "Metro") {
    displayed = displayed.filter(
      (it) => it.mode === "Metro" || it.modesInvolved?.includes("Metro"),
    );
  } else if (filter === "Bus") {
    displayed = displayed.filter((it) => it.mode === "Bus" || it.modesInvolved?.includes("Bus"));
  } else if (filter === "Suburban Rail") {
    displayed = displayed.filter(
      (it) => it.mode === "Suburban Rail" || it.modesInvolved?.includes("Suburban Rail"),
    );
  } else if (filter === "Mixed") {
    displayed = displayed.filter(
      (it) => it.mode === "Mixed" || (it.modesInvolved && it.modesInvolved.length > 1),
    );
  }

  const handleSelect = (it: CanonicalItinerary, idx: number) => {
    setSelectedId(it.id);
    if (onSelectOption) {
      onSelectOption(it.optionIndex ?? idx + 1);
    }
  };

  return (
    <Shell
      icon={Layers}
      title={`Route Options: ${origin} → ${destination}`}
      badge={<Badge tone="fast">{options.length} Available Routes</Badge>}
    >
      <div className="space-y-3.5">
        {/* Filter Pills */}
        <div className="flex flex-wrap gap-1.5 border-b border-border/40 pb-2.5">
          {filterTabs.map((tab) => {
            const isActive = filter === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  isActive
                    ? "bg-accent text-accent-foreground shadow-xs"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {displayed.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No routes matching filter "{filter}". Select "All" to view all available options.
          </p>
        ) : (
          <div className="space-y-2.5">
            {displayed.map((it, idx) => {
              const isSelected = it.id === selectedId;
              const isExpanded = expandedId === it.id;

              return (
                <div
                  key={it.id}
                  onClick={() => handleSelect(it, idx)}
                  className={`cursor-pointer rounded-xl border p-3.5 transition-all ${
                    isSelected
                      ? "border-accent bg-accent/5 ring-1 ring-accent/30 shadow-xs"
                      : "border-border/70 hover:border-accent/40 hover:bg-muted/30"
                  }`}
                >
                  {/* Option Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                        Option {it.optionIndex ?? idx + 1}
                      </span>
                      {it.isFastest && (
                        <Badge tone="fast">
                          <Zap className="h-3 w-3" /> Fastest
                        </Badge>
                      )}
                      {it.modesInvolved && it.modesInvolved.length > 1 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-900 dark:bg-purple-950 dark:text-purple-300">
                          {it.modesInvolved.join(" + ")}
                        </span>
                      ) : (
                        <Badge tone="ok">{it.mode}</Badge>
                      )}
                    </div>
                    {isSelected && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Active Selection
                      </span>
                    )}
                  </div>

                  {/* Option Title & Key Metrics */}
                  <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-display text-sm font-semibold text-foreground">
                        {it.routeName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {it.transferCount === 0
                          ? "Direct route (0 transfers)"
                          : `${it.transferCount} transfer (${it.transferPoints.join(", ")})`}
                        {" · "}
                        {it.totalStops} stops · ~{it.totalDistanceKm} km
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-base font-bold text-accent">
                        ~{it.totalDurationMinutes} mins
                      </p>
                      <p className="text-xs font-semibold text-foreground">₹{it.fare.totalFare}</p>
                    </div>
                  </div>

                  {/* Door to door time summary */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3 text-accent" />
                      Travel: ~{it.inVehicleMinutes}m
                    </span>
                    <span>•</span>
                    <span>Wait: ~{it.waitingMinutes}m</span>
                    <span>•</span>
                    <span>Walk: ~{it.walkingMinutes}m</span>
                  </div>

                  {/* Boarding and transfer points */}
                  <div className="mt-2.5 rounded-lg bg-muted/50 p-2 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 text-foreground">
                      <span className="font-semibold text-[11px] text-muted-foreground uppercase">
                        Board:
                      </span>
                      <span>{it.boardingPoint || it.origin}</span>
                    </div>
                    {it.transferDescription ? (
                      <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-200 font-medium">
                        <span className="font-semibold text-[11px] uppercase">Transfer:</span>
                        <span>{it.transferDescription}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-1.5 text-foreground">
                      <span className="font-semibold text-[11px] text-muted-foreground uppercase">
                        Arrive:
                      </span>
                      <span>{it.arrivalPoint || it.destination}</span>
                    </div>
                  </div>

                  {/* Expand / Collapse Leg Details */}
                  <div className="mt-2.5 flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(isExpanded ? null : it.id);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                    >
                      {isExpanded ? "Hide route details" : "View route legs"}
                      {isExpanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(it, idx);
                      }}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                        isSelected
                          ? "bg-accent text-accent-foreground"
                          : "border border-border bg-background hover:bg-muted"
                      }`}
                    >
                      {isSelected ? "Active Route" : "Select Option"}
                    </button>
                  </div>

                  {/* Expanded legs preview */}
                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t pt-2.5 text-xs">
                      {it.legs.map((leg, legIdx) => (
                        <div
                          key={legIdx}
                          className="rounded-lg border border-border/50 bg-background/80 p-2.5"
                        >
                          <div className="flex items-center justify-between font-semibold">
                            <span className="text-foreground">{leg.routeName}</span>
                            <span className="text-muted-foreground">
                              ~{leg.durationMinutes} mins
                            </span>
                          </div>
                          <p className="mt-0.5 text-muted-foreground">
                            {leg.from} → {leg.to} ({leg.stops.length} stops) · Every{" "}
                            {leg.frequencyMinutes}m
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground italic">
          Tip: You can switch between routes by clicking any option or typing "Select Option 2",
          "Which is fastest?", or "Show mixed routes".
        </p>
      </div>
    </Shell>
  );
}
