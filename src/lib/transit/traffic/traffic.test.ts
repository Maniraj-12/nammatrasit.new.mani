import { describe, expect, it, vi } from "vitest";
import {
  buildTrafficRequest, combineTrafficResults, splitIntoGoogleSegments,
  validateTrafficRequest, trafficDisclaimer,
} from "./logic";
import { compareTraffic, parseGoogleSeconds, trafficFeatureEnabled } from "./google-routes.server";
import type { TrafficCompareRequest } from "./types";

const rail = {
  id:"metro", baselineTotalMinutes:35,
  legs:[{mode:"Metro" as const,routeId:"CMRL-SAP",baseMinutes:28,stops:[]}],
};
const bus = {
  id:"mtc-70",baselineTotalMinutes:45,
  legs:[{mode:"Bus" as const,routeId:"MTC-70",baseMinutes:27,
    stops:[[13.075,80.195],[13.068,80.203],[13.05,80.21]] as Array<[number,number]>}],
};
const request:TrafficCompareRequest={journeys:[rail,bus]};
const fakeRoute={routes:[{
  duration:"1200s",staticDuration:"900s",distanceMeters:5000,
  polyline:{encodedPolyline:"fake-google-encoded"}
}]};

describe("Google Maps traffic-aware MTC comparison",()=>{
  it("keeps the correct source and never marks unconfigured traffic as live", async()=>{
    const result=await compareTraffic(request,{enabled:false});
    expect(result.sourceStatus).toBe("UNAVAILABLE");
    expect(result.fastestId).toBeNull();
    expect(result.comparisonComplete).toBe(false);
    expect(result.journeys[0]!.status).toBe("NOT_APPLICABLE");
    expect(result.journeys[1]!.status).toBe("UNAVAILABLE");
    expect(result.journeys[1]!.adjustedTotalMinutes).toBeNull();
  });

  it("compares metro static duration with traffic-adjusted bus duration using Google road delta", async()=>{
    const fetcher=vi.fn(async (_url:unknown, init:RequestInit)=>{
      const body=JSON.parse(String(init.body));
      expect(body.travelMode).toBe("DRIVE");
      expect(body.routingPreference).toBe("TRAFFIC_AWARE");
      expect(body.intermediates).toHaveLength(1);
      expect(body.intermediates[0].via).toBe(true);
      expect((init.headers as Record<string,string>)["X-Goog-Api-Key"]).toBe("fixture-server-key");
      return {ok:true,json:async()=>fakeRoute} as Response;
    }) as unknown as typeof fetch;
    const result=await compareTraffic(request,{
      enabled:true,key:"fixture-server-key",fetcher,
      now:"2026-11-06T06:00:00.000Z",
    });
    expect(result.sourceStatus).toBe("LIVE_ROAD_TRAFFIC");
    expect(result.comparisonComplete).toBe(true);
    expect(result.fastestId).toBe("metro");
    expect(result.journeys[0]!.adjustedTotalMinutes).toBe(35);
    expect(result.journeys[1]!.adjustedTotalMinutes).toBe(50);
    expect(result.journeys[1]!.congestionAdjustmentMinutes).toBe(5);
    expect(result.journeys[1]!.googleBusRoutePolylines).toEqual(["fake-google-encoded"]);
    expect(result.disclaimer).toContain("not an actual arrival");
  });

  it("shows a bus as fastest if verified traffic comparison makes it faster",async()=>{
    const data:TrafficCompareRequest={journeys:[
      {...rail,baselineTotalMinutes:52},
      {...bus,baselineTotalMinutes:32},
    ]};
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>fakeRoute} as Response)) as unknown as typeof fetch;
    const result=await compareTraffic(data,{enabled:true,key:"key",fetcher});
    expect(result.journeys[1]!.adjustedTotalMinutes).toBe(37);
    expect(result.fastestId).toBe("mtc-70");
  });

  it("won't declare fastest when any bus route fails live traffic validation",async()=>{
    const fetcher=vi.fn(async()=>({ok:false,status:429} as Response)) as unknown as typeof fetch;
    const result=await compareTraffic(request,{enabled:true,key:"key",fetcher});
    expect(result.comparisonComplete).toBe(false);
    expect(result.fastestId).toBeNull();
    expect(result.journeys[1]!.status).toBe("UNAVAILABLE");
  });

  it("bounds GTFS stop count and number of potentially billable queries",()=>{
    const route=Array.from({length:26},(_,i)=>[13.075-i*0.001,80.195+i*0.001] as [number,number]);
    const chunks=splitIntoGoogleSegments(route);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(12);
    expect(chunks[1]![0]).toEqual(chunks[0]![11]);
    expect(chunks[2]![0]).toEqual(chunks[1]![11]);
    expect(splitIntoGoogleSegments(route.concat([[0,0]]))).toHaveLength(0);
    const tooMany={journeys:[...Array.from({length:7},(_,i)=>({...bus,id:"bus-"+i}))]};
    expect(validateTrafficRequest(tooMany)).toBeNull();
    const wrongMode={journeys:[{...bus,legs:[{...bus.legs[0],routeId:"CMRL-70"}]}]};
    expect(validateTrafficRequest(wrongMode)).toBeNull();
    expect(validateTrafficRequest(request)).not.toBeNull();
  });

  it("requires explicit server-side enable and billing acknowledgement",()=>{
    expect(trafficFeatureEnabled({GOOGLE_MAPS_ROUTES_API_KEY:"key"})).toBe(false);
    expect(trafficFeatureEnabled({TRAFFIC_API_ENABLED:"true",GOOGLE_MAPS_ROUTES_API_KEY:"key"})).toBe(false);
    expect(trafficFeatureEnabled({
      TRAFFIC_API_ENABLED:"true",
      TRAFFIC_API_BILLING_ACKNOWLEDGED:"true",
      GOOGLE_MAPS_ROUTES_API_KEY:"key",
    })).toBe(true);
  });

  it("rejects malformed Google duration values",()=>{
    expect(parseGoogleSeconds("900s")).toBe(900);
    expect(parseGoogleSeconds("45.5s")).toBe(45.5);
    expect(parseGoogleSeconds("10")).toBeNull();
    expect(parseGoogleSeconds("-1s")).toBeNull();
    expect(parseGoogleSeconds("abc")).toBeNull();
  });
});
