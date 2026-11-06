import {describe,it,expect,vi} from "vitest";
import type {CanonicalItinerary} from "./engine";
import {createItineraryDemoAlert,rerouteForDemo,toDisruptionJourney} from "./disruption-integration";
import {validateDisruption} from "./disruption-engine";

// Deterministic unit tests; an actual route search is separately covered by
// the project's existing full-GTFS integration suite.
vi.mock("./full-gtfs",()=>({
  loadFullGtfs: vi.fn(async()=>null),
  planFullGtfs: vi.fn(()=>[]),
}));

function itinerary(id:string,mode:"Metro"|"Bus"|"Suburban Rail",
  routeId:string,duration:number):CanonicalItinerary {
  return {
    id,origin:"Guindy",destination:"Chennai Airport",routeName:id,
    mode,modesInvolved:[mode],totalDurationMinutes:duration,
    fare:{totalFare:mode==="Metro"?40:25,fareDataStatus:"estimated",components:[],
      fareSource:"test",lastVerificationDate:""},
    legs:[{mode,routeId,routeName:id,from:"Guindy",
      to:"Chennai Airport",stops:["Guindy","Chennai Airport"],
      durationMinutes:duration,distanceKm:12,frequencyMinutes:10}],
  } as CanonicalItinerary;
}
const blue=itinerary("metro-blue","Metro","BLUE_LINE",25);
const anotherBlue=itinerary("metro-blue-other","Metro","BLUE_LINE",26);
const bus=itinerary("bus-70","Bus","MTC-70",46);
const rail=itinerary("rail","Suburban Rail","SR-BEACH-TBM",38);

describe("Real NammaTransit itinerary → teammate disruption adapter",()=>{
  const now=new Date("2026-11-06T04:00:00Z");
  it("uses the original exact GTFS route IDs, stop sequence and user journey endpoints",()=>{
    const result=toDisruptionJourney(blue);
    expect(result.legs[0]).toMatchObject({
      routeId:"BLUE_LINE",mode:"metro",
      from:{name:"Guindy"},to:{name:"Chennai Airport"},
      viaStops:[{name:"Guindy"},{name:"Chennai Airport"}],
    });
  });
  it("creates only explicitly simulated, time-limited, route-specific outages",()=>{
    const alert=createItineraryDemoAlert(blue,now);
    expect(alert).not.toBeNull();
    expect(alert?.sourceKind).toBe("simulation");
    expect(alert?.sourceLabel).toMatch(/not a live/);
    expect(alert?.affectedRouteIds).toEqual(["BLUE_LINE"]);
    expect(alert?.modeWide).toBeUndefined();
    expect(validateDisruption(alert!)).toEqual([]);
  });
  it("refuses to fake a disruption for unidentified services",()=>{
    const unknown={...blue,legs:[{...blue.legs[0]!,routeId:""}]};
    expect(createItineraryDemoAlert(unknown,now)).toBeNull();
  });
  it("ranks actual existing alternatives and rejects another trip using the disrupted route",async()=>{
    const result=await rerouteForDemo(blue,[blue,anotherBlue,bus,rail],now);
    expect(result).not.toBeNull();
    expect(result!.output.status).toBe("ready");
    expect(result!.output.simulation).toBe(true);
    expect(result!.suggestions.map(x=>x.id)).toEqual(["rail","bus-70"]);
    expect(result!.uncertainSuggestions.map(x=>x.id)).toEqual(["metro-blue-other"]);
    expect(result!.output.message).toMatch(/SIMULATION/);
  });
  it("does not suggest an arbitrary journey to a different destination",async()=>{
    const other={...bus,destination:"Chennai Central"};
    const out=await rerouteForDemo(blue,[blue,other],now);
    expect(out!.suggestions).toEqual([]);
    expect(out!.output.status).toBe("no_alternative");
  });
  it("does not manufacture an unaffected service where no alternate exists",async()=>{
    const out=await rerouteForDemo(blue,[blue,anotherBlue],now);
    expect(out!.suggestions).toEqual([]);
    expect(out!.output.status).toBe("uncertain");
  });
});
