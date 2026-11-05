/**
 * Server-only Google Maps Routes API traffic adapter.
 * No keys are sent to browsers. Disabled until owner deliberately enables
 * billing and sets a server-side key; this never fetches traffic without opt-in.
 *
 * Google Maps Routes Content must only be displayed with a GOOGLE map, not
 * the application's existing Leaflet/OpenStreetMap canvas.
 */
import {
  baselineTrafficResult, combineTrafficResults, compactStops,
  splitIntoGoogleSegments, unavailableTrafficResult, validateTrafficRequest,
} from "./logic";
import type {
  LocationPoint, TrafficCompareResponse, TrafficJourneyInput,
  TrafficCompareRequest, TrafficResult,
} from "./types";

const GOOGLE_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = "routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline";
const CACHE_MILLIS = 40_000;
const CACHE_MAX = 60;
const cached = new Map<string,{expiry:number,value:RoadDuration}>();

type GoogleRoute = {
  duration?: string;
  staticDuration?: string;
  distanceMeters?: number;
  polyline?: { encodedPolyline?: string };
};
type GoogleResponse = { routes?: GoogleRoute[] };
type RoadDuration = {
  durationMinutes:number;
  staticMinutes:number;
  polyline:string;
};

export function parseGoogleSeconds(text: string | undefined): number | null {
  if (typeof text !== "string" || !/^\d+(?:\.\d+)?s$/.test(text)) return null;
  const value=Number(text.slice(0,-1));
  return Number.isFinite(value) && value >= 0 && value < 43_200 ? value : null;
}

export function trafficFeatureEnabled(env: Record<string,string | undefined> = process.env): boolean {
  return env.TRAFFIC_API_ENABLED === "true" &&
    env.TRAFFIC_API_BILLING_ACKNOWLEDGED === "true" &&
    !!env.GOOGLE_MAPS_ROUTES_API_KEY;
}

async function googleDriveForStops(
  stops: LocationPoint[], key: string,
  fetcher: typeof fetch = fetch,
): Promise<RoadDuration | null> {
  if(stops.length<2 || stops.length>12) return null;
  const hash=stops.map(([lat,lon])=>lat.toFixed(5)+","+lon.toFixed(5)).join(";");
  const hit=cached.get(hash);
  if(hit && hit.expiry>Date.now()) return hit.value;
  const waypoint=(p:LocationPoint)=>({ location:{ latLng:{latitude:p[0],longitude:p[1]} } });
  const body={
    origin:waypoint(stops[0]!),
    destination:waypoint(stops[stops.length-1]!),
    intermediates:stops.slice(1,-1).map(p=>({ ...waypoint(p), via:true })),
    travelMode:"DRIVE",
    routingPreference:"TRAFFIC_AWARE",
    computeAlternativeRoutes:false,
    languageCode:"en-IN",
    units:"METRIC",
  };
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetcher(GOOGLE_URL,{
      method:"POST", signal:controller.signal,
      headers:{
        "Content-Type":"application/json",
        "X-Goog-Api-Key":key,
        "X-Goog-FieldMask":FIELD_MASK,
      },
      body:JSON.stringify(body),
    });
    if(!response.ok) return null;
    const json=(await response.json()) as GoogleResponse;
    const route=json.routes?.[0];
    const duration=parseGoogleSeconds(route?.duration);
    const staticDuration=parseGoogleSeconds(route?.staticDuration);
    if(duration===null || staticDuration===null || duration <= 0 || staticDuration <= 0) return null;
    const value:RoadDuration={
      durationMinutes:duration/60,
      staticMinutes:staticDuration/60,
      polyline:typeof route?.polyline?.encodedPolyline==="string"?
        route.polyline.encodedPolyline:"",
    };
    if(cached.size>=CACHE_MAX) cached.clear();
    cached.set(hash,{expiry:Date.now()+CACHE_MILLIS,value});
    return value;
  }catch{
    return null;
  }finally{clearTimeout(timer)}
}

async function estimateJourney(
  journey: TrafficJourneyInput, key:string,
  fetcher: typeof fetch,
  checkedAt:string,
):Promise<TrafficResult>{
  const buses=journey.legs.filter((leg)=>leg.mode==="Bus");
  if(!buses.length) return baselineTrafficResult(journey);
  let googleCurrent=0, googleStatic=0;
  const polylines:string[]=[];
  for(const leg of buses){
    const stops=compactStops(leg.stops);
    const chunks=splitIntoGoogleSegments(stops);
    if(!chunks.length){
      return unavailableTrafficResult(journey,"The bus leg has insufficient mapped GTFS stop coordinates for traffic lookup.");
    }
    for(const chunk of chunks){
      const road=await googleDriveForStops(chunk,key,fetcher);
      if(!road) return unavailableTrafficResult(journey,
        "Current congestion information could not be verified for every part of this bus route.");
      googleCurrent+=road.durationMinutes;
      googleStatic+=road.staticMinutes;
      if(road.polyline) polylines.push(road.polyline);
    }
  }
  // Preserve baseline bus dwell/wait estimates. Add Google's observed
  // traffic penalty relative to its own normal road baseline, NOT the entire
  // Google car journey time as if it were an MTC timetable.
  const difference=googleCurrent-googleStatic;
  const adjusted=Math.max(1,Math.round(journey.baselineTotalMinutes+difference));
  return{
    id:journey.id,
    status:"TRAFFIC_AWARE",
    baselineTotalMinutes:journey.baselineTotalMinutes,
    adjustedTotalMinutes:adjusted,
    congestionAdjustmentMinutes:Math.round(difference),
    googleDriveMinutes:Math.round(googleCurrent),
    googleStaticDriveMinutes:Math.round(googleStatic),
    checkedAt,
    googleBusRoutePolylines:polylines,
    message:"Google live road-traffic driving comparison applied to estimated MTC in-vehicle time. Bus dwell, waiting and headways are still unverified.",
  };
}

export async function compareTraffic(
  input: TrafficCompareRequest,
  options: { key?:string;enabled?:boolean;fetcher?:typeof fetch;now?:string }={},
):Promise<TrafficCompareResponse>{
  const valid=validateTrafficRequest(input);
  if(!valid) throw new Error("Invalid or overly expensive comparison request");
  const at=options.now??new Date().toISOString();
  const enabled=options.enabled??trafficFeatureEnabled();
  const key=options.key??process.env.GOOGLE_MAPS_ROUTES_API_KEY;
  const withTraffic=enabled&&!!key;
  const results:TrafficResult[]=[];
  for(const journey of valid.journeys){
    if(!journey.legs.some(leg=>leg.mode==="Bus")){
      results.push(baselineTrafficResult(journey));
      continue;
    }
    results.push(withTraffic
      ? await estimateJourney(journey,key!,options.fetcher??fetch,at)
      : unavailableTrafficResult(journey,"Traffic comparison not enabled. Configure a billed Google Routes API key on the server."));
  }
  return combineTrafficResults(valid.journeys,results,withTraffic,at);
}
