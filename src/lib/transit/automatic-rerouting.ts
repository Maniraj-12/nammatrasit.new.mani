/**
 * Adapted from teammate's Automatic Rerouting ZIP.
 * Runs the existing GTFS search callback, validates endpoints and ranks only
 * alternatives with NO matches to supplied disruptions. No invented routes.
 */
import {
  analyzeJourney,findDisruptionAlternatives,isDisruptionActive,
  type AnalyzedJourney,type TransitDisruption,type TransitJourney,type TransitStopRef,
} from "./disruption-engine";

export type RerouteStatus="unaffected"|"ready"|"uncertain"|"no_alternative"|"search_failed";
export type RerouteSearchRequest={
  from:TransitStopRef;to:TransitStopRef;
  excludedModes:Array<"bus"|"metro"|"suburban">;
  excludedRouteIds:string[];excludedStopIds:string[];alertIds:string[];
};
export type SearchExistingJourneys=(request:RerouteSearchRequest)=>
  Promise<readonly TransitJourney[]> | readonly TransitJourney[];
export type AutomaticRerouteInput={
  selectedJourney:TransitJourney;disruptions:readonly TransitDisruption[];
  searchJourneys:SearchExistingJourneys;now?:Date;limit?:number;
};
export type AutomaticRerouteOutput={
  status:RerouteStatus;affectedJourney:AnalyzedJourney;
  suggestions:AnalyzedJourney[];uncertainSuggestions:AnalyzedJourney[];
  triggeringAlertIds:string[];request?:RerouteSearchRequest;message:string;
  simulation:boolean;
};

const norm=(x:string|undefined)=>(x??"").normalize("NFKC").trim()
  .toLowerCase().replace(/[\s_-]+/g," ");
function sameStop(a:TransitStopRef,b:TransitStopRef):boolean{
  if(a.id&&b.id)return norm(a.id)===norm(b.id);
  return Boolean(a.name&&b.name&&norm(a.name)===norm(b.name));
}
export function hasSameEndpoints(selected:TransitJourney,candidate:TransitJourney):boolean{
  const a=selected.legs[0],b=selected.legs[selected.legs.length-1];
  const c=candidate.legs[0],d=candidate.legs[candidate.legs.length-1];
  return Boolean(a&&b&&c&&d&&sameStop(a.from,c.from)&&sameStop(b.to,d.to));
}
function validJourney(j:TransitJourney):boolean{
  return Boolean(j && typeof j.id==="string" && j.id.trim() &&
    Array.isArray(j.legs) && j.legs.length &&
    j.legs.every(l=>l && typeof l.id==="string" && l.id.trim() &&
      !!l.from && !!l.to && typeof l.mode==="string"));
}

export function makeRerouteSearchRequest(
  selected:TransitJourney,alerts:readonly TransitDisruption[]):RerouteSearchRequest{
  const first=selected.legs[0],last=selected.legs[selected.legs.length-1];
  if(!first||!last)throw new Error("Selected journey needs at least one leg");
  const modes=new Set<"bus"|"metro"|"suburban">(),routes=new Set<string>(),stops=new Set<string>();
  for(const alert of alerts){
    if(alert.modeWide)modes.add(alert.mode);
    for(const r of alert.affectedRouteIds??[])if(r.trim())routes.add(r.trim());
    for(const stop of alert.affectedStops??[])if(stop.id?.trim())stops.add(stop.id.trim());
  }
  return {
    from:first.from,to:last.to,
    excludedModes:[...modes],excludedRouteIds:[...routes],
    excludedStopIds:[...stops],alertIds:alerts.map(a=>a.id),
  };
}

export async function automaticallyReroute(input:AutomaticRerouteInput):Promise<AutomaticRerouteOutput>{
  const {selectedJourney,disruptions,searchJourneys}=input;
  const now=input.now??new Date(),limit=Number.isFinite(input.limit)
    ? Math.max(1,Math.min(20,Math.floor(input.limit!))):3;
  if(!validJourney(selectedJourney))throw new Error("Selected journey is missing valid legs");
  const active=disruptions.filter(a=>isDisruptionActive(a,now));
  const impact=analyzeJourney(selectedJourney,active,now);
  const ids=new Set(impact.impacts.map(i=>i.alertId));
  const relevant=active.filter(a=>ids.has(a.id));
  const simulation=relevant.some(a=>a.sourceKind==="simulation");
  const base={affectedJourney:impact,triggeringAlertIds:relevant.map(a=>a.id),simulation};
  if(impact.status==="clear"){
    return {...base,status:"unaffected",suggestions:[],uncertainSuggestions:[],
      message:"No supplied disruption matches this journey; this does not confirm that services are operating."};
  }
  const request=makeRerouteSearchRequest(selectedJourney,relevant);
  let candidates:readonly TransitJourney[];
  try{
    candidates=await searchJourneys(request);
    if(!Array.isArray(candidates))throw Error("Planner must return an array");
  }catch{
    return {...base,request,status:"search_failed",suggestions:[],uncertainSuggestions:[],
      message:"GTFS alternative search failed. No replacement journey is being claimed."};
  }
  const valid=candidates.filter(j=>validJourney(j)&&hasSameEndpoints(selectedJourney,j));
  const result=findDisruptionAlternatives(selectedJourney,valid,active,now);
  const suggestions=result.alternatives.slice(0,limit);
  const uncertainSuggestions=result.uncertainAlternatives.slice(0,limit);
  let status:RerouteStatus,message:string;
  if(suggestions.length){
    status="ready";
    message=String(suggestions.length)+" GTFS alternative(s) have no matches in supplied alerts. Check actual operation before travel.";
  }else if(uncertainSuggestions.length){
    status="uncertain";
    message="Only potentially affected alternatives were found. No route can be called unaffected from this data.";
  }else{
    status="no_alternative";
    message="No unaffected GTFS alternative found. Try another departure point, destination or transport mode.";
  }
  if(simulation)message="SIMULATION — not a live alert. "+message;
  return {...base,request,status,suggestions,uncertainSuggestions,message};
}
