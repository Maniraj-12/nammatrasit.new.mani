import {describe,expect,it} from "vitest";
import {
  analyzeJourney,createSimulatedDisruption,findDisruptionAlternatives,
  isDisruptionActive,matchDisruptionToLeg,validateDisruption,
  type TransitDisruption,type TransitJourney,
} from "./disruption-engine";
import {
  automaticallyReroute,hasSameEndpoints,makeRerouteSearchRequest,
} from "./automatic-rerouting";

const now=new Date("2026-11-06T04:00:00Z");
const stop=(name:string)=>({name});
const journey=(id:string,mode:"metro"|"bus"|"suburban",routeId:string,
  minutes:number):TransitJourney=>({
  id,durationMinutes:minutes,fareRupees:minutes,
  legs:[{id:id+":0",mode,routeId,from:stop("Guindy"),
    to:stop("Chennai Airport"),viaStops:[stop("Guindy"),stop("Chennai Airport")]}],
});
const metro=journey("metro","metro","BLUE_LINE",25);
const anotherMetro=journey("metro2","metro","BLUE_LINE",27);
const bus=journey("bus","bus","MTC-70",42);
const rail=journey("rail","suburban","RAIL-TBM",35);
const alert:TransitDisruption={
  id:"demo-blue",title:"Test Metro Blue disruption",
  mode:"metro",severity:"major",sourceKind:"simulation",
  sourceLabel:"Hackathon test — not a live service alert",
  publishedAt:"2026-11-06T03:00:00Z",startsAt:"2026-11-06T03:00:00Z",
  endsAt:"2026-11-06T06:00:00Z",affectedRouteIds:["BLUE_LINE"],
};

describe("Teammate disruption engine — adapted to NammaTransit",()=>{
  it("recognises a scoped and active simulated Metro disruption",()=>{
    expect(validateDisruption(alert)).toEqual([]);
    expect(isDisruptionActive(alert,now)).toBe(true);
    expect(analyzeJourney(metro,[alert],now).status).toBe("affected");
    expect(analyzeJourney(bus,[alert],now).status).toBe("clear");
    expect(analyzeJourney(rail,[alert],now).status).toBe("clear");
  });
  it("does not treat stale incidents as live",()=>{
    expect(isDisruptionActive(alert,new Date("2026-11-06T07:00:00Z"))).toBe(false);
    expect(analyzeJourney(metro,[alert],new Date("2026-11-06T07:00:00Z")).status).toBe("clear");
  });
  it("rejects missing scope, misleading simulation claims and invalid timestamps",()=>{
    expect(validateDisruption({...alert,affectedRouteIds:[]})).not.toEqual([]);
    expect(validateDisruption({...alert,sourceLabel:"Official verified news"})).not.toEqual([]);
    expect(validateDisruption({...alert,startsAt:"not a date"})).not.toEqual([]);
  });
  it("handles stop-specific incidents safely when intermediate stops are missing",()=>{
    const located:TransitDisruption={...alert,affectedStops:[stop("Guindy")]};
    const known={...metro.legs[0]!,viaStops:[stop("Guindy")]};
    expect(matchDisruptionToLeg(located,known)).toBe("confirmed");
    const unknown={...known,from:stop("Other"),to:stop("Different"),viaStops:undefined};
    expect(matchDisruptionToLeg(located,unknown)).toBe("possible");
    const explicitlyElsewhere={...unknown,viaStops:[stop("Different")]};
    expect(matchDisruptionToLeg(located,explicitlyElsewhere)).toBeNull();
  });
  it("never makes up alternative routes; sorts only submitted unaffected choices",()=>{
    const out=findDisruptionAlternatives(metro,[metro,bus,rail,anotherMetro],[alert],now);
    expect(out.current.status).toBe("affected");
    expect(out.alternatives.map(x=>x.journey.id)).toEqual(["rail","bus"]);
    expect(out.uncertainAlternatives.map(x=>x.journey.id)).toEqual(["metro2"]);
  });
  it("always labels the generated alert as simulated",()=>{
    const {sourceKind:ignored,sourceLabel:ignoredLabel,publishedAt:ignoredDate,...input}=alert;
    void ignored;void ignoredLabel;void ignoredDate;
    const generated=createSimulatedDisruption(input,now);
    expect(generated.sourceKind).toBe("simulation");
    expect(generated.sourceLabel).toMatch(/not a live/i);
    expect(validateDisruption(generated)).toEqual([]);
  });
});

describe("Teammate automatic rerouting — connected only through a GTFS callback",()=>{
  it("does not query routes when the selected service is unaffected",async()=>{
    let queried=false;
    const out=await automaticallyReroute({selectedJourney:bus,disruptions:[alert],now,
      searchJourneys:()=>{queried=true;return [metro];}});
    expect(queried).toBe(false);
    expect(out.status).toBe("unaffected");
    expect(out.suggestions).toEqual([]);
  });
  it("requeries GTFS candidates, rejects the disrupted service and ranks alternatives",async()=>{
    let request;
    const out=await automaticallyReroute({selectedJourney:metro,disruptions:[alert],now,
      searchJourneys:(req)=>{request=req;return [metro,anotherMetro,bus,rail];}});
    expect(request).toMatchObject({excludedRouteIds:["BLUE_LINE"]});
    expect(out.status).toBe("ready");
    expect(out.simulation).toBe(true);
    expect(out.message).toMatch(/SIMULATION/);
    expect(out.suggestions.map(x=>x.journey.id)).toEqual(["rail","bus"]);
    expect(out.uncertainSuggestions.map(x=>x.journey.id)).toEqual(["metro2"]);
  });
  it("rejects candidates going somewhere else even if the route is shorter",async()=>{
    const wrong={...bus,legs:[{...bus.legs[0]!,to:stop("Chennai Central")}]};
    expect(hasSameEndpoints(metro,wrong)).toBe(false);
    const out=await automaticallyReroute({selectedJourney:metro,disruptions:[alert],now,
      searchJourneys:()=>[wrong]});
    expect(out.suggestions).toEqual([]);
    expect(out.status).toBe("no_alternative");
  });
  it("allows a mode-wide simulated outage but excludes that mode",()=>{
    const wide={...alert,modeWide:true,affectedRouteIds:[]};
    expect(makeRerouteSearchRequest(metro,[wide]).excludedModes).toEqual(["metro"]);
  });
  it("does not claim success if the GTFS callback fails",async()=>{
    const out=await automaticallyReroute({selectedJourney:metro,disruptions:[alert],now,
      searchJourneys:()=>{throw new Error("offline");}});
    expect(out.status).toBe("search_failed");
    expect(out.suggestions).toHaveLength(0);
  });
  it("rejects malformed itinerary input",async()=>{
    await expect(automaticallyReroute({selectedJourney:{id:"bad",legs:[]},
      disruptions:[alert],now,searchJourneys:()=>[bus]})).rejects.toThrow(/valid legs/);
  });
  it("limits recommendations and avoids automatic selection",async()=>{
    const out=await automaticallyReroute({selectedJourney:metro,disruptions:[alert],
      now,limit:1,searchJourneys:()=>[bus,rail]});
    expect(out.suggestions.map(x=>x.journey.id)).toEqual(["rail"]);
    expect(out.affectedJourney.journey.id).toBe("metro");
  });
});
