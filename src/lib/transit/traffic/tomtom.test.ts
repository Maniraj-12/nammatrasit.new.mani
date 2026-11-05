import { describe,expect,it,vi } from "vitest";
import { compareTomTomTraffic,incrementalRoadTrafficMinutes,tomtomTrafficEnabled } from "./tomtom-orbis.server";
import type { TrafficCompareRequest } from "./types";

const metro = {
  id:"metro",baselineTotalMinutes:35,
  legs:[{mode:"Metro" as const,routeId:"CMRL-SAP",baseMinutes:25,stops:[]}],
};
const bus = {
  id:"mtc-bus",baselineTotalMinutes:45,
  legs:[{mode:"Bus" as const,routeId:"MTC-70",baseMinutes:27,
    stops:[[13.075,80.195],[13.068,80.203],[13.05,80.21]] as Array<[number,number]>}],
};
const candidates:TrafficCompareRequest={journeys:[metro,bus]};

function mockTomTom() {
  return vi.fn(async(_url:RequestInfo|URL,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body));
    expect(body.travelMode).toBe("car");
    expect(body.routeType).toBe("fast");
    expect(body.routePlanningLocations.origin.coordinates).toEqual([80.195,13.075]);
    expect(body.routePlanningLocations.waypoints.coordinates).toEqual([[80.203,13.068]]);
    expect((init?.headers as Record<string,string>)["Attributes"]).toBe("routes.summary");
    expect((init?.headers as Record<string,string>)["TomTom-Api-Key"]).toBe("TEST-ONLY");
    const seconds=body.traffic==="live"?1200:900;
    return {ok:true,json:async()=>({routes:[{summary:{
      travelDurationInSeconds:seconds,lengthInMeters:5000,
      trafficDelayDurationInSeconds:body.traffic==="live"?300:0,
    }}]})} as Response;
  });
}

describe("TomTom traffic API integration without Google Cloud billing",()=>{
  it("does not contact TomTom without opt-in and a private server key",async()=>{
    const fetcher=vi.fn();
    const result=await compareTomTomTraffic(candidates,{enabled:false,fetcher:fetcher as unknown as typeof fetch});
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.provider).toBeNull();
    expect(result.sourceStatus).toBe("UNAVAILABLE");
    expect(result.fastestId).toBeNull();
    expect(result.journeys[1]!.status).toBe("UNAVAILABLE");
  });

  it("uses two TomTom API queries and adjusts only MTC traffic against usual road speed",async()=>{
    const f=mockTomTom();
    const result=await compareTomTomTraffic(candidates,{
      enabled:true,key:"TEST-ONLY",fetcher:f as unknown as typeof fetch,
      now:"2026-11-06T05:00:00.000Z",
    });
    expect(f).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe("TomTom Orbis Routing API");
    expect(result.comparisonComplete).toBe(true);
    expect(result.fastestId).toBe("metro");
    expect(result.journeys[0]!.adjustedTotalMinutes).toBe(35);
    expect(result.journeys[1]!.adjustedTotalMinutes).toBe(50);
    expect(result.journeys[1]!.congestionAdjustmentMinutes).toBe(5);
    expect(result.journeys[1]!.googleBusRoutePolylines).toEqual([]);
  });

  it("does not invent congestion differences when historical and live roads diverge",()=>{
    expect(incrementalRoadTrafficMinutes(
      {durationSeconds:1800,distanceMeters:10000},
      {durationSeconds:1000,distanceMeters:2000},
    )).toBeNull();
  });

  it("does not label stale static-only rail routing as a live road-traffic result",async()=>{
    const result=await compareTomTomTraffic({journeys:[metro]},{
      enabled:true,key:"TEST-ONLY",fetcher:mockTomTom() as unknown as typeof fetch,
    });
    expect(result.sourceStatus).toBe("UNAVAILABLE");
    expect(result.fastestId).toBeNull();
    expect(result.journeys[0]!.status).toBe("NOT_APPLICABLE");
  });

  it("can recommend MTC if its complete traffic-adjusted time is shorter",async()=>{
    const f=mockTomTom();
    const input:TrafficCompareRequest={journeys:[
      {...metro,baselineTotalMinutes:55},
      {...bus,baselineTotalMinutes:29},
    ]};
    const result=await compareTomTomTraffic(input,{
      enabled:true,key:"TEST-ONLY",fetcher:f as unknown as typeof fetch,
    });
    expect(result.journeys[1]!.adjustedTotalMinutes).toBe(34);
    expect(result.fastestId).toBe("mtc-bus");
  });

  it("rejects wrong credentials or API failures and does not claim fastest",async()=>{
    const anotherBus={...bus,id:"mtc-bus-failure",legs:[{
      ...bus.legs[0]!,stops:[[13.095,80.215],[13.094,80.214]] as Array<[number,number]>,
    }]};
    const fetcher=vi.fn(async()=>({ok:false,status:403} as Response));
    const result=await compareTomTomTraffic({journeys:[metro,anotherBus]},{
      enabled:true,key:"INVALID",fetcher:fetcher as unknown as typeof fetch,
    });
    expect(result.fastestId).toBeNull();
    expect(result.comparisonComplete).toBe(false);
    expect(result.journeys[1]!.status).toBe("UNAVAILABLE");
  });

  it("requires one server-only free developer key and explicit activation",()=>{
    expect(tomtomTrafficEnabled({})).toBe(false);
    expect(tomtomTrafficEnabled({TOMTOM_API_KEY:"TEST-ONLY"})).toBe(false);
    expect(tomtomTrafficEnabled({
      TOMTOM_API_KEY:"TEST-ONLY",TOMTOM_TRAFFIC_ENABLED:"true",
    })).toBe(true);
  });

  it("limits the maximum number of TomTom calls in one comparison",async()=>{
    const many:TrafficCompareRequest={journeys:Array.from({length:6},(_,i)=>({
      ...bus,id:"route-"+i,legs:[{...bus.legs[0]!,
        stops:[[13.08+i*.002,80.195],[13.068+i*.002,80.203]] as Array<[number,number]>}],
    }))};
    const fetcher=vi.fn();
    const result=await compareTomTomTraffic(many,{
      enabled:true,key:"TEST-ONLY",fetcher:fetcher as unknown as typeof fetch,
    });
    expect(result.comparisonComplete).toBe(false);
    expect(result.fastestId).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
