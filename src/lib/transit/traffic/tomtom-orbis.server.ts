/** TomTom Orbis Routing API v3, executed only in the server environment.
 * Replaces Google billing for selected MTC road-congestion comparisons.
 * Never call TomTom directly from the browser with this private API key.
 *
 * It compares the same ordered MTC GTFS stops in historical and live
 * traffic modes, then adjusts the existing GTFS bus-only travel estimate
 * by the *incremental* live road delay. This is NOT a live MTC vehicle ETA.
 */
import {
  baselineTrafficResult, compactStops, unavailableTrafficResult,
  validateTrafficRequest,
} from "./logic";
import type {
  LocationPoint, TrafficCompareRequest, TrafficCompareResponse,
  TrafficJourneyInput, TrafficResult,
} from "./types";

const URL = "https://api.tomtom.com/maps/orbis/routing/routes/calculate?apiVersion=3";
const MAX_PROVIDER_REQUESTS = 10;
const MAX_STOPS_PER_LEG = 70;
const CACHE_MS = 60_000;
const responseCache = new Map<string,{until:number;durationSeconds:number;distanceMeters:number}>();

type TomTomRoute = {
  summary?: {
    travelDurationInSeconds?: number;
    trafficDelayDurationInSeconds?: number;
    lengthInMeters?: number;
  };
};
type TomTomResponse = { routes?: TomTomRoute[] };
type TomTomDuration = { durationSeconds:number;distanceMeters:number };

function toPoint(p:LocationPoint) {
  return { type:"Point" as const, coordinates:[p[1],p[0]] };
}
function makeBody(stops:LocationPoint[],traffic:"live"|"historical") {
  return {
    routePlanningLocations: {
      origin:toPoint(stops[0]!),
      ...(stops.length>2 ? {
        waypoints: {
          type:"MultiPoint" as const,
          coordinates:stops.slice(1,-1).map((p)=>[p[1],p[0]]),
        },
      } : {}),
      destination:toPoint(stops[stops.length-1]!),
    },
    traffic,
    routeType:"fast",
    travelMode:"car",
  };
}

export function tomtomTrafficEnabled(
  env: Record<string,string|undefined> = process.env,
):boolean {
  return env.TOMTOM_TRAFFIC_ENABLED === "true" && !!env.TOMTOM_API_KEY;
}

async function calculateTomTom(
  stops:LocationPoint[], traffic:"live"|"historical",
  apiKey:string, fetcher:typeof fetch,
):Promise<TomTomDuration|null> {
  if(stops.length<2 || stops.length>MAX_STOPS_PER_LEG)return null;
  const cacheKey = traffic + "|" + stops.map((p)=>p[0].toFixed(5)+","+p[1].toFixed(5)).join(";");
  const cache = responseCache.get(cacheKey);
  if(cache && cache.until>Date.now()) return {
    durationSeconds:cache.durationSeconds,
    distanceMeters:cache.distanceMeters,
  };
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12_000);
  try{
    const resp=await fetcher(URL,{
      method:"POST",
      signal:controller.signal,
      headers:{
        "Content-Type":"application/json",
        "TomTom-Api-Version":"3",
        "TomTom-Api-Key":apiKey,
        "Attributes":"routes.summary",
      },
      body:JSON.stringify(makeBody(stops,traffic)),
    });
    if(!resp.ok)return null;
    const json=(await resp.json()) as TomTomResponse;
    const summary=json.routes?.[0]?.summary;
    const seconds=summary?.travelDurationInSeconds;
    const distance=summary?.lengthInMeters;
    if(typeof seconds!=="number" || !Number.isFinite(seconds) ||
       seconds<=0 || seconds>=43_200 || typeof distance!=="number" ||
       !Number.isFinite(distance) || distance<=0) return null;
    const value={durationSeconds:seconds,distanceMeters:distance};
    if(responseCache.size>80)responseCache.clear();
    responseCache.set(cacheKey,{...value,until:Date.now()+CACHE_MS});
    return value;
  }catch{
    return null;
  }finally{
    clearTimeout(timer);
  }
}

export function incrementalRoadTrafficMinutes(
  live:TomTomDuration, historical:TomTomDuration,
):number|null {
  // Comparing wildly different geographic alignments would be unreliable.
  if(live.distanceMeters/historical.distanceMeters>1.8 ||
     historical.distanceMeters/live.distanceMeters>1.8) return null;
  return (live.durationSeconds-historical.durationSeconds)/60;
}

async function compareBusJourney(
  journey:TrafficJourneyInput,apiKey:string,fetcher:typeof fetch,now:string,
):Promise<TrafficResult> {
  let currentRoad=0, historicalRoad=0, adjustment=0;
  for(const leg of journey.legs){
    if(leg.mode!=="Bus")continue;
    const coords=compactStops(leg.stops);
    if(coords.length<2 || coords.length>MAX_STOPS_PER_LEG){
      return unavailableTrafficResult(journey,"Bus route has insufficient valid GTFS stop coordinates.");
    }
    // This pair intentionally uses the same waypoints and mode so the delta
    // represents current congestion relative to expected historical traffic.
    const current=await calculateTomTom(coords,"live",apiKey,fetcher);
    const historical=await calculateTomTom(coords,"historical",apiKey,fetcher);
    if(!current || !historical){
      return unavailableTrafficResult(journey,
        "TomTom live or historical road duration is unavailable for one or more MTC legs.");
    }
    const difference=incrementalRoadTrafficMinutes(current,historical);
    if(difference===null){
      return unavailableTrafficResult(journey,
        "Live and historic TomTom road alignments differ too much to compare safely.");
    }
    adjustment+=difference;
    currentRoad+=current.durationSeconds/60;
    historicalRoad+=historical.durationSeconds/60;
  }
  return {
    id:journey.id,
    status:"TRAFFIC_AWARE",
    baselineTotalMinutes:journey.baselineTotalMinutes,
    adjustedTotalMinutes:Math.max(1,Math.round(journey.baselineTotalMinutes+adjustment)),
    congestionAdjustmentMinutes:Math.round(adjustment),
    googleDriveMinutes:null,
    googleStaticDriveMinutes:null,
    checkedAt:now,
    googleBusRoutePolylines:[],
    message:"TomTom live-vs-historical road traffic adjustment on MTC legs only. Actual bus arrival, waiting and operator diversions are not verified.",
  };
}

export const tomtomDisclaimer =
  "Traffic-adjusted estimates, not guaranteed actual arrivals: TomTom uses road vehicle routing, not live MTC bus GPS. Bus stop dwell, service headways, waiting times and actual train delays remain unverified. Estimates compare TomTom live and typical historical road travel time along the recorded bus stops.";

export async function compareTomTomTraffic(
  input:TrafficCompareRequest,
  opts:{key?:string;enabled?:boolean;fetcher?:typeof fetch;now?:string}={},
):Promise<TrafficCompareResponse> {
  const valid=validateTrafficRequest(input);
  if(!valid)throw new Error("Invalid traffic request");
  const now=opts.now??new Date().toISOString();
  const enabled=opts.enabled??tomtomTrafficEnabled();
  const key=opts.key??process.env.TOMTOM_API_KEY;
  const usable=enabled && !!key;
  const busCount=valid.journeys.reduce((n,journey)=>n+
    journey.legs.filter((leg)=>leg.mode==="Bus").length,0);
  const underLimit=busCount*2<=MAX_PROVIDER_REQUESTS;
  const results:TrafficResult[]=[];
  for(const journey of valid.journeys){
    if(!journey.legs.some((leg)=>leg.mode==="Bus")){
      results.push(baselineTrafficResult(journey));
    }else if(!usable){
      results.push(unavailableTrafficResult(journey,"TomTom free developer API key not configured on this server."));
    }else if(!underLimit){
      results.push(unavailableTrafficResult(journey,
        "Too many MTC legs for one traffic query. Select fewer alternatives."));
    }else{
      results.push(await compareBusJourney(journey,key!,opts.fetcher??fetch,now));
    }
  }
  const allComplete=usable && underLimit && busCount>0 &&
    results.every((r,i)=>!valid.journeys[i]!.legs.some((leg)=>leg.mode==="Bus") ||
      r.status==="TRAFFIC_AWARE");
  const ordered=allComplete && results.length>1 ?
    [...results].sort((a,b)=>(a.adjustedTotalMinutes??Infinity)-(b.adjustedTotalMinutes??Infinity)) : [];
  return {
    provider:usable?"TomTom Orbis Routing API":null,
    requestedAt:now,
    sourceStatus:allComplete?"LIVE_ROAD_TRAFFIC":"UNAVAILABLE",
    journeys:results,
    comparisonComplete:allComplete,
    fastestId:ordered[0]?.id??null,
    disclaimer:tomtomDisclaimer,
  };
}
