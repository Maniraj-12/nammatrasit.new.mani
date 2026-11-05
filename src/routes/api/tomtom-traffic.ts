import { createFileRoute } from "@tanstack/react-router";
import { validateTrafficRequest } from "@/lib/transit/traffic/logic";

const WINDOW_MS=15*60_000;
const MAX_PER_CLIENT=4;
const MAX_ALL=28;
const hits=new Map<string,{opened:number;count:number}>();

function allow(key:string,limit:number,now=Date.now()){
  const entry=hits.get(key);
  if(!entry || now-entry.opened>=WINDOW_MS){
    hits.set(key,{opened:now,count:1});
    return true;
  }
  if(entry.count>=limit)return false;
  entry.count++;
  return true;
}

/** Only the server holds the TomTom key; this endpoint is opt-in.
 * In-memory limits are prototype safeguards, not a production-grade
 * distributed quota or authentication scheme.
 */
export const Route=createFileRoute("/api/tomtom-traffic")({
  server:{
    handlers:{
      POST: async ({request})=>{
        const headers={
          "Cache-Control":"no-store",
          "X-Content-Type-Options":"nosniff",
        };
        const requestUrl=new URL(request.url);
        const origin=request.headers.get("origin");
        if(origin){
          try{
            if(new URL(origin).origin!==requestUrl.origin){
              return Response.json({error:"Cross-origin requests disabled."},{status:403,headers});
            }
          }catch{
            return Response.json({error:"Invalid Origin."},{status:403,headers});
          }
        }
        const size=Number(request.headers.get("content-length")||"0");
        if(size>24_000)return Response.json({error:"Request too large."},{status:413,headers});
        let raw:unknown;
        try{raw=await request.json()}catch{
          return Response.json({error:"Invalid request body."},{status:400,headers});
        }
        const input=validateTrafficRequest(raw);
        if(!input)return Response.json({error:"Invalid GTFS traffic alternatives."},{status:400,headers});

        // Dynamic server-only import prevents secrets or the provider client
        // from being bundled into the public React application.
        const {compareTomTomTraffic,tomtomTrafficEnabled}=await import(
          "@/lib/transit/traffic/tomtom-orbis.server"
        );
        if(!tomtomTrafficEnabled()){
          return Response.json(await compareTomTomTraffic(input,{enabled:false}),{headers});
        }
        if(hits.size>400)hits.clear();
        // Do not trust client-provided forwarded-for chains without a trusted
        // proxy; anonymous traffic is conservatively limited globally.
        const ip=request.headers.get("cf-connecting-ip")||
          request.headers.get("x-real-ip")||"anonymous";
        if(!allow("global",MAX_ALL)||!allow("client:"+ip,MAX_PER_CLIENT)){
          return Response.json({error:"TomTom demo rate limit reached."},{status:429,headers});
        }
        return Response.json(await compareTomTomTraffic(input),{headers});
      },
    },
  },
});
