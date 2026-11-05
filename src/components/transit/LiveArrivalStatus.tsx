import { useEffect, useMemo, useState } from "react";
import type { CanonicalItinerary } from "@/lib/transit/engine";
import { checkSelectedRealtime, realtimeQueryForLeg } from "@/lib/transit/realtime/selection";
import type { RealtimeSnapshot } from "@/lib/transit/realtime/types";

/** Explicit opt-in check: no polling against an unlicensed provider. */
export function LiveArrivalStatus({ itinerary }: { itinerary: CanonicalItinerary }) {
  const options = useMemo(
    () => itinerary.legs.flatMap((leg, index) => {
      const query = realtimeQueryForLeg(leg);
      return query ? [{ query, index, name: leg.routeName, boarding: leg.from }] : [];
    }),
    [itinerary],
  );
  const [chosen, setChosen] = useState(0);
  const [snapshot, setSnapshot] = useState<RealtimeSnapshot | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setChosen(0);
    setSnapshot(null);
    setChecking(false);
  }, [itinerary.id]);

  const selected = options[chosen] ?? options[0];
  const check = async () => {
    if (!selected || checking) return;
    setChecking(true);
    setSnapshot(null);
    const response = await checkSelectedRealtime(selected.query);
    setSnapshot(response);
    setChecking(false);
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-amber-200/70 bg-white/60 p-2">
      <p className="text-xs font-semibold">Check live availability for the selected route</p>
      {options.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-xs">
          <span>Transport leg:</span>
          <select
            className="max-w-full rounded border px-2 py-1 text-foreground"
            value={chosen}
            onChange={(event) => { setChosen(Number(event.target.value)); setSnapshot(null); }}
          >
            {options.map((option, i) => (
              <option key={option.index + "-" + option.name} value={i}>
                {option.name} — board at {option.boarding}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        disabled={!selected || checking}
        onClick={check}
        className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {checking ? "Checking…" : "Check current API status"}
      </button>
      {!selected && (
        <p className="text-[11px]">No exact GTFS boarding stop identifier is available for this journey. Live data cannot be matched safely.</p>
      )}
      {snapshot && (
        <div role="status" className="space-y-1 text-[11px]">
          <p className="font-semibold">
            {snapshot.status === "LIVE" ? "Authorised provider response" : "Live information unavailable"}
          </p>
          <p>{snapshot.source.reason}</p>
          {snapshot.status === "LIVE" && (
            <>
              <p>Provider: {snapshot.source.provider} · Updated {snapshot.source.freshnessSeconds ?? "?"}s ago</p>
              <p>{snapshot.vehicles.length} fresh vehicle position(s) matched this route.</p>
              {snapshot.arrivals.map((arrival) => (
                <p key={arrival.stopId + "-" + (arrival.tripId ?? "")}>
                  Stop {arrival.stopId}: predicted arrival {arrival.predictedArrivalTime ?? "unavailable"} (official prediction)
                </p>
              ))}
            </>
          )}
        </div>
      )}
      <p className="text-[11px] text-amber-900">
        This feature does not provide GPS or ETA without an authorised operator feed.
        A static route estimate must never be treated as a live countdown.
      </p>
    </div>
  );
}
