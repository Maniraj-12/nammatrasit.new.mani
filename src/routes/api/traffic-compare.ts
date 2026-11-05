import { createFileRoute } from "@tanstack/react-router";
import { validateTrafficRequest } from "@/lib/transit/traffic/logic";

const WINDOW_MS = 15 * 60_000;
const PER_IP_MAX = 3;
const GLOBAL_MAX = 24;
const bucket = new Map<string, { start:number;count:number }>();

function permitted(key:string,max:number,now=Date.now()):boolean{
  const current=bucket.get(key);
  if(!current || now-current.start>WINDOW_MS){
    bucket.set(key,{start:now,count:1});
    return true;
  }
  if(current.count>=max) return false;
  current.count++;
  return true;
}

/**
 * Cost-sensitive endpoint. Requires deliberate billing opt-in plus an API key.
 * In-memory rate limit is defence-in-depth for demo, NOT a reliable distributed
 * quota. Add authentication and an edge/API-gateway limit before public release.
 */
export const Route = createFileRoute("/api/traffic-compare")({
  server: {
    handlers: {
      POST: async ({request}) => {
        const headers={
          "Cache-Control":"no-store",
          "X-Content-Type-Options":"nosniff",
        };
        const site=new URL(request.url);
        const origin=request.headers.get("origin");
        if(origin && new URL(origin).host!==site.host){
          return Response.json({error:"Cross-origin traffic requests are disabled."},{status:403,headers});
        }
        const length=Number(request.headers.get("content-length")??"0");
        if(length>24_000) return Response.json({error:"Request too large."},{status:413,headers});
        let payload:unknown;
        try{payload=await request.json()}catch{
          return Response.json({error:"Invalid JSON body."},{status:400,headers});
        }
        const input=validateTrafficRequest(payload);
        if(!input){
          return Response.json({error:"Invalid route geometry, mode, or excessive comparison size."},{status:400,headers});
        }
        // Server-only module deliberately loaded after validation. No private
        // API key is included in the client-side JavaScript bundle.
        const {compareTraffic,trafficFeatureEnabled}=await import(
          "@/lib/transit/traffic/google-routes.server"
        );
        if(!trafficFeatureEnabled()){
          const response=await compareTraffic(input,{enabled:false});
          return Response.json(response,{headers});
        }

        // Per-process limit protects testing; secure a global edge quota
        // and authentication before enabling live billing at scale.
        if(bucket.size>500) bucket.clear();
        const ip=request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-real-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "anonymous";
        if(!permitted("global",GLOBAL_MAX) || !permitted("ip:"+ip,PER_IP_MAX)){
          return Response.json({error:"Traffic API quota reached. Try again later."},{status:429,headers});
        }
        const response=await compareTraffic(input);
        return Response.json(response,{headers});
      },
    },
  },
});
