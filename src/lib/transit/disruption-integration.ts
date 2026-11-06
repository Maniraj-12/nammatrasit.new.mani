/**
 * Adapter between our CanonicalItinerary/ChennaiGTFS graph and the teammate's
 * disruption evaluation + automatic rerouting modules.
 *
 * All requests use the bundled *static* GTFS graph. Nothing here contacts an
 * operations centre or claims actual live outages.
 */
import type { CanonicalItinerary } from "./engine";
import { loadFullGtfs, planFullGtfs } from "./full-gtfs";
import {
  createSimulatedDisruption,type TransitDisruption,type TransitJourney,type TransitMode,
} from "./disruption-engine";
import { automaticallyReroute,type AutomaticRerouteOutput } from "./automatic-rerouting";

function transitMode(mode:string):TransitMode {
  if(mode==="Metro")return "metro";
  if(mode==="Bus")return "bus";
  if(mode==="Suburban Rail")return "suburban";
  return "other";
}

/** Preserve route IDs and the actual stop sequence. Match end-to-end by the
 * itinerary's user-selected origin/destination, not mode-specific platform IDs.
 */
export function toDisruptionJourney(itinerary:CanonicalItinerary):TransitJourney {
  return {
    id:itinerary.id,
    durationMinutes:itinerary.totalDurationMinutes,
    fareRupees:itinerary.fare.fareDataStatus==="unavailable"
      ? undefined:itinerary.fare.totalFare,
    legs:itinerary.legs.map((leg,i)=>({
      id:itinerary.id+":leg:"+i,mode:transitMode(leg.mode),
      routeId:leg.routeId,
      from:{name:i===0?itinerary.origin:leg.from},
      to:{name:i===itinerary.legs.length-1?itinerary.destination:leg.to},
      viaStops:leg.stops.map(name=>({name})),
      durationMinutes:leg.durationMinutes,
    })),
  };
}

export function createItineraryDemoAlert(
  selected:CanonicalItinerary,now=new Date(),
):TransitDisruption|null {
  const leg=selected.legs.find(l=>
    ["Bus","Metro","Suburban Rail"].includes(l.mode) &&
    typeof l.routeId==="string" && l.routeId.trim().length>0);
  if(!leg)return null;
  const mode=transitMode(leg.mode);
  if(mode==="walk"||mode==="other")return null;
  return createSimulatedDisruption({
    id:"demo-disruption-"+selected.id,
    title:"DEMO — service interruption on "+leg.routeName,
    details:"Hypothetical interruption to "+leg.routeId+" for rerouting demonstration.",
    mode,severity:"major",
    affectedRouteIds:[leg.routeId],
    startsAt:new Date(now.getTime()-60_000).toISOString(),
    endsAt:new Date(now.getTime()+60*60_000).toISOString(),
  },now);
}

export type SimulatedRerouteResult={
  alert:TransitDisruption; output:AutomaticRerouteOutput;
  suggestions:CanonicalItinerary[];uncertainSuggestions:CanonicalItinerary[];
  candidateCount:number;
};
const signature=(it:CanonicalItinerary)=>
  it.legs.map(l=>[l.mode,l.routeId,l.from,l.to,l.stops.join(">")].join("|")).join("→");

/** Run actual GTFS route searches, then filter/rank against the supplied
 * simulated alert. Existing screen options are included as a fail-safe.
 */
export async function rerouteForDemo(
  selected:CanonicalItinerary,existing:readonly CanonicalItinerary[],
  now=new Date(),
):Promise<SimulatedRerouteResult|null> {
  const alert=createItineraryDemoAlert(selected,now);
  if(!alert)return null;
  const byId=new Map<string,CanonicalItinerary>();
  const seenSignatures=new Set<string>();
  const add=(journey:CanonicalItinerary)=>{
    if(!journey?.id||!journey.legs?.length||
       journey.origin!==selected.origin || journey.destination!==selected.destination) return;
    const key=signature(journey);
    if(seenSignatures.has(key))return;
    if(byId.has(journey.id))return;
    seenSignatures.add(key);
    byId.set(journey.id,journey);
  };
  add(selected);
  existing.forEach(add);
  const output=await automaticallyReroute({
    selectedJourney:toDisruptionJourney(selected),disruptions:[alert],now,limit:6,
    searchJourneys:async()=>{
      try {
        const index=await loadFullGtfs();
        if(index){
          // This GTFS graph has no excluded-route search parameter. Explore
          // several actual modes, then exclude impacted options through the
          // disruption evaluator; never claim the graph search was constrained.
          for(const mode of ["All","Metro","Bus","Suburban Rail","Mixed"] as const){
            const limit=mode==="All"?14:5;
            planFullGtfs(index,selected.origin,selected.destination,mode,limit).forEach(add);
          }
        }
      }catch{
        // The selected journey's already-loaded alternatives remain usable.
      }
      return [...byId.values()].map(toDisruptionJourney);
    },
  });
  const resolve=(items:typeof output.suggestions)=>
    items.map(x=>byId.get(x.journey.id)).filter((it):it is CanonicalItinerary=>!!it);
  return {
    alert,output,suggestions:resolve(output.suggestions),
    uncertainSuggestions:resolve(output.uncertainSuggestions),
    candidateCount:byId.size,
  };
}
