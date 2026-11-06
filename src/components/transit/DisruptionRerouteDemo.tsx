import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCcw, Route } from "lucide-react";
import type { CanonicalItinerary } from "@/lib/transit/engine";
import { fareText } from "@/lib/transit/engine";
import {
  createItineraryDemoAlert,rerouteForDemo,
  type SimulatedRerouteResult,
} from "@/lib/transit/disruption-integration";

type Props={
  itinerary:CanonicalItinerary;existingOptions:readonly CanonicalItinerary[];
  onCandidates:(routes:CanonicalItinerary[])=>void;
  onChoose:(route:CanonicalItinerary)=>void;
};

/** Judge-initiated simulation. Never automatically shown as real operations
 * data, and never books, purchases, or switches the selected trip without a
 * visible user choice.
 */
export function DisruptionRerouteDemo({itinerary,existingOptions,onCandidates,onChoose}:Props){
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<SimulatedRerouteResult|null>(null);
  const [error,setError]=useState(false);
  const available=!!createItineraryDemoAlert(itinerary);
  const simulate=async()=>{
    if(busy||!available)return;
    setBusy(true);setError(false);setResult(null);
    try{
      const next=await rerouteForDemo(itinerary,existingOptions);
      if(next){
        onCandidates(next.suggestions);
        setResult(next);
      }else setError(true);
    }catch{
      setError(true);
    }finally{setBusy(false);}
  };
  return (
    <section aria-label="Simulated disruption and automatic GTFS rerouting"
      className="mt-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/25">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs font-bold uppercase text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" /> Disruption-aware rerouting
          </p>
          <p className="mt-1 text-xs text-amber-900 dark:text-amber-100">
            Judge demonstration only. No live MTC, Metro or railway disruption feed is connected.
          </p>
        </div>
        <button type="button" disabled={!available||busy} onClick={()=>void simulate()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-amber-800 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-900 disabled:opacity-50"
          aria-label="Simulate disruption and search real GTFS reroute options">
          {busy?<Loader2 className="h-4 w-4 animate-spin"/>:<RefreshCcw className="h-4 w-4"/>}
          {busy?"Searching GTFS routes…":"Simulate disruption & reroute"}
        </button>
      </div>
      {!available&&(
        <p role="status" className="mt-2 text-xs text-amber-800">
          This journey has no identifiable MTC/Metro/suburban route ID, so an exact service disruption cannot be simulated safely.
        </p>
      )}
      {error&&<p role="alert" className="mt-2 text-xs text-red-800">
        Reroute simulation could not complete. Your original journey is unchanged.
      </p>}
      {result&&(
        <div role="status" className="mt-3 space-y-2 border-t border-amber-300 pt-3">
          <p className="text-xs font-bold text-red-800 dark:text-red-200">
            SIMULATION — NOT AN ACTUAL SERVICE ALERT
          </p>
          <p className="text-sm font-semibold">{result.alert.title}</p>
          <p className="text-xs text-muted-foreground">{result.alert.details}</p>
          <p className="text-xs font-medium">
            Impact on original journey: {result.output.affectedJourney.status.replace("_"," ")}.
            Examined {result.candidateCount} GTFS route candidate(s).
          </p>
          <p className="text-xs">{result.output.message}</p>
          {result.suggestions.length>0&&(
            <div className="space-y-2">
              <p className="flex items-center gap-1 text-xs font-bold text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4"/>
                Unmatched by this simulated alert (not verified operating)
              </p>
              {result.suggestions.map((route)=>(
                <div key={route.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-2">
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-semibold">{route.routeName}</p>
                    <p className="text-muted-foreground">
                      {route.mode} · ~{route.totalDurationMinutes} min · {fareText(route.fare)}
                    </p>
                  </div>
                  <button type="button" onClick={()=>onChoose(route)}
                    aria-label={"Show suggested reroute "+route.routeName}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100">
                    <Route className="h-4 w-4"/> View this route
                  </button>
                </div>
              ))}
            </div>
          )}
          {result.uncertainSuggestions.length>0&&(
            <p className="text-xs text-amber-900 dark:text-amber-100">
              {result.uncertainSuggestions.length} additional candidate(s) also match or might pass through the simulated disruption; they are not shown as unaffected routes.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Based on static ChennaiGTFS candidate itineraries. Check real operator services, accessibility, and tickets independently. No booking or automatic trip switch occurs.
          </p>
        </div>
      )}
    </section>
  );
}
