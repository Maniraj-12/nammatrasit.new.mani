import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCcw, TrafficCone } from "lucide-react";
import type { CanonicalItinerary } from "@/lib/transit/engine";
import { buildTrafficRequest } from "@/lib/transit/traffic/logic";
import type { TrafficCompareResponse } from "@/lib/transit/traffic/types";

function displayArrival(minutes:number,requestedAt:string):string {
  const base=Date.parse(requestedAt);
  if(!Number.isFinite(base)) return "Unavailable";
  return new Date(base+minutes*60_000).toLocaleTimeString("en-IN",{
    timeZone:"Asia/Kolkata",hour:"numeric",minute:"2-digit",
  });
}

/** Traffic-aware ETA comparison without Google Maps or browser-side API keys.
 * Static route geometry remains in the existing Leaflet map above this panel.
 * TomTom data is shown as numbers with clear attribution; no map mixing.
 */
export function TomTomTrafficComparison({
  options,selectedId,onSelect,
}:{
  options:CanonicalItinerary[];
  selectedId:string;
  onSelect?:(journey:CanonicalItinerary)=>void;
}){
  const query=useMemo(()=>buildTrafficRequest(options),[options]);
  const [data,setData]=useState<TrafficCompareResponse|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const hasBus=options.some((route)=>route.legs.some((leg)=>leg.mode==="Bus"));

  useEffect(()=>{
    setData(null);
    setError("");
  },[options]);

  async function checkTraffic(){
    if(!hasBus || loading) return;
    setLoading(true);
    setError("");
    try{
      const response=await fetch("/api/tomtom-traffic",{
        method:"POST",cache:"no-store",
        headers:{"Content-Type":"application/json",Accept:"application/json"},
        body:JSON.stringify(query),
      });
      if(!response.ok){
        setData(null);
        setError(response.status===429
          ? "TomTom free traffic-check limit reached. Please retry later."
          : "Traffic-check backend is unavailable. Check your hosting and TomTom settings.");
        return;
      }
      const result=(await response.json()) as TrafficCompareResponse;
      if(!Array.isArray(result.journeys) || result.journeys.length!==query.journeys.length){
        setData(null);
        setError("Invalid traffic service response; keeping original journey estimates.");
        return;
      }
      setData(result);
    }catch{
      setData(null);
      setError("Could not connect to the TomTom traffic-check backend in this preview.");
    }finally{
      setLoading(false);
    }
  }

  return(
    <section className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3"
      aria-label="Traffic-aware journey comparison">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrafficCone className="h-4 w-4 text-orange-600"/>
          <div>
            <p className="text-sm font-bold">Current Chennai road traffic</p>
            <p className="text-[11px] text-muted-foreground">TomTom Routing API v1 · evaluation key</p>
          </div>
        </div>
        <button type="button" onClick={()=>void checkTraffic()} disabled={loading||!hasBus}
          className="inline-flex items-center gap-1.5 rounded-full border border-blue-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">
          <RefreshCcw className="h-3.5 w-3.5"/>
          {loading?"Checking road congestion…":"Check current road traffic"}
        </button>
      </div>

      {!hasBus&&(
        <p className="text-xs text-muted-foreground">
          Only Metro/suburban journeys are shown. Road congestion is not applied to rail journeys.
        </p>
      )}
      {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}

      {data&&data.sourceStatus==="UNAVAILABLE"&&(
        <p role="status" className="flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0"/>
          Live road traffic is unavailable or incomplete. These are not verified current ETAs.
          Set TOMTOM_API_KEY and TOMTOM_TRAFFIC_ENABLED on your deployed server.
        </p>
      )}
      {data?.comparisonComplete&&(
        <p role="status" className="flex items-center gap-2 text-xs text-emerald-800">
          <CheckCircle2 className="h-4 w-4"/>
          Current traffic checked · {new Date(data.requestedAt).toLocaleTimeString("en-IN",{
            timeZone:"Asia/Kolkata",hour:"numeric",minute:"2-digit",
          })} IST
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.slice(0,6).map((option,i)=>{
          const result=data?.journeys.find((x)=>x.id===option.id);
          const fastest=data?.comparisonComplete&&data.fastestId===option.id;
          return(
            <button type="button" key={option.id} onClick={()=>onSelect?.(option)}
              className={"space-y-1 rounded-lg border bg-white p-3 text-left text-xs hover:border-blue-400 "+
                (selectedId===option.id?"border-blue-500":"border-slate-200")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>Option {option.optionIndex??i+1} · {option.mode}</strong>
                {fastest&&<span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">
                  Fastest traffic-aware estimate
                </span>}
              </div>
              <p className="line-clamp-2 text-muted-foreground">{option.routeName}</p>
              <div className="mt-2 flex justify-between gap-2">
                <span>Static ~{option.totalDurationMinutes} min</span>
                <strong>{result?.adjustedTotalMinutes!=null
                  ?"~"+result.adjustedTotalMinutes+" min"
                  :"Traffic time unavailable"}</strong>
              </div>
              {result?.status==="TRAFFIC_AWARE"&&(
                <p className="text-blue-800">
                  Current road deviation {result.congestionAdjustmentMinutes!>=0?"+":""}
                  {result.congestionAdjustmentMinutes} min vs typical conditions
                </p>
              )}
              {result?.status==="NOT_APPLICABLE"&&(
                <p className="text-muted-foreground">Rail static estimate; no live train delay feed</p>
              )}
              {result?.status==="UNAVAILABLE"&&(
                <p className="text-amber-800">Traffic data unavailable</p>
              )}
              {result?.adjustedTotalMinutes!=null&&result.status==="TRAFFIC_AWARE"&&data&&(
                <p className="text-emerald-800">Estimated arrival:
                  {" "+displayArrival(result.adjustedTotalMinutes,data.requestedAt)} IST</p>
              )}
            </button>
          );
        })}
      </div>
      {data&&!data.comparisonComplete&&hasBus&&(
        <p className="text-xs text-amber-800">
          Comparison incomplete: no verified fastest traffic-aware option is selected.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        TomTom traffic data is used only for road-time comparisons, not vehicle GPS.
        MTC boarding waits, bus stop delays and scheduled trains remain estimates.
        The static route map above does not represent TomTom's live traffic overlay.
      </p>
      <p className="text-[11px] text-muted-foreground">
        {data?.disclaimer}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Source: TomTom Routing API v1. Traffic requests require an active free account
        and are subject to TomTom's usage limits.
      </p>
    </section>
  );
}
