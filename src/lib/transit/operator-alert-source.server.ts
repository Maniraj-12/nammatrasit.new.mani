import {
  OPERATOR_NOTICE_URLS,parseCmrlNotices,parseMtcNotices,
  type AlertMonitorSnapshot,type OperatorCode,type OperatorNotice,type OperatorSourceCheck,
} from "./operator-notices";
import {isDisruptionActive,validateDisruption,type TransitDisruption} from "./disruption-engine";

const MAX_BODY=1_000_000;
const timeoutMs=6500;
type FetchLike=typeof fetch;

async function readText(url:string,fetcher:FetchLike):Promise<string>{
  const r=await fetcher(url,{
    headers:{Accept:"text/html", "User-Agent":"NammaTransitAI/1.0 (+public-notice-monitor)"},
    signal:AbortSignal.timeout(timeoutMs),
  });
  if(!r.ok)throw Error("Upstream HTTP "+r.status);
  const type=r.headers.get("content-type")??"";
  if(type&&!/text\/html|text\/plain/i.test(type))throw Error("Unexpected content type");
  const body=await r.text();
  if(!body||body.length>MAX_BODY)throw Error("Response missing or too large");
  return body;
}

export async function fetchOperatorChecks(
  fetcher:FetchLike=fetch,now=new Date(),
):Promise<OperatorSourceCheck[]>{
  const entries=Object.entries(OPERATOR_NOTICE_URLS) as Array<[OperatorCode,string]>;
  return Promise.all(entries.map(async([operator,sourceUrl]):Promise<OperatorSourceCheck>=>{
    const checkedAt=now.toISOString();
    try{
      const html=await readText(sourceUrl,fetcher);
      // Parsing an unrecognised document is not proof there are no notices.
      const parseable=operator==="CMRL"
        ? /<tr\b/i.test(html)&&/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(html)
        : /\bDate\s*:/i.test(html)&&/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(html);
      if(!parseable)throw Error("Upstream page layout unrecognised");
      const notices:OperatorNotice[]=operator==="CMRL"
        ? parseCmrlNotices(html,now):parseMtcNotices(html,now);
      return {operator,sourceUrl,checkedAt,status:"checked",notices};
    }catch{
      return {operator,sourceUrl,checkedAt,status:"unavailable",notices:[]};
    }
  }));
}

function permittedPartnerUrl(value:string|undefined,host:string|undefined):string|null{
  if(!value||!host)return null;
  try{
    const u=new URL(value);
    if(u.protocol!=="https:"||u.username||u.password||u.port||
       u.hostname.toLowerCase()!==host.toLowerCase())return null;
    // URLs are provided only through deployment environment configuration,
    // never through an arbitrary visitor's query parameters.
    return u.toString();
  }catch{return null;}
}

export async function fetchPartnerServiceAlerts(
  url:string|undefined,allowedHost:string|undefined,
  fetcher:FetchLike=fetch,now=new Date(),
):Promise<Pick<AlertMonitorSnapshot,"liveFeedStatus"|"activeAlerts">>{
  const configured=permittedPartnerUrl(url,allowedHost);
  if(!configured)return {liveFeedStatus:"not_configured",activeAlerts:[]};
  try{
    const res=await fetcher(configured,{
      headers:{Accept:"application/json"},signal:AbortSignal.timeout(timeoutMs),
    });
    if(!res.ok)throw Error("Feed unavailable");
    const raw=await res.text();
    if(raw.length>MAX_BODY)throw Error("Feed too large");
    const parsed:unknown=JSON.parse(raw);
    if(!parsed||typeof parsed!=="object")throw Error("Feed invalid");
    const envelope=parsed as {alerts?:unknown};
    if(!Array.isArray(envelope.alerts))throw Error("Feed lacks alerts array");
    const activeAlerts:AlertMonitorSnapshot["activeAlerts"]=[];
    for(const item of envelope.alerts.slice(0,60)){
      if(!item||typeof item!=="object")continue;
      const alert=item as TransitDisruption;
      if(alert.sourceKind==="simulation" || validateDisruption(alert).length ||
         !isDisruptionActive(alert,now))continue;
      const publicationAge=now.getTime()-Date.parse(alert.publishedAt);
      if(publicationAge< -300_000 || publicationAge>900_000)continue;
      activeAlerts.push({
        id:alert.id,title:alert.title,mode:alert.mode,severity:alert.severity,
        publishedAt:alert.publishedAt,sourceLabel:alert.sourceLabel,
        affectedRouteIds:alert.affectedRouteIds?.filter(x=>typeof x==="string")??[],
      });
    }
    return {liveFeedStatus:"connected",activeAlerts};
  }catch{
    return {liveFeedStatus:"unavailable",activeAlerts:[]};
  }
}

let lastSnapshot:AlertMonitorSnapshot|null=null;
let expires=0;
let inflight:Promise<AlertMonitorSnapshot>|null=null;
/** Server-side TTL cache: many visitors do not hammer official websites.
 * When their servers are unreachable, never reuse stale results as current.
 */
export async function getOperatorAlertSnapshot(now=new Date()):Promise<AlertMonitorSnapshot>{
  if(lastSnapshot&&now.getTime()<expires)return lastSnapshot;
  if(inflight)return inflight;
  inflight=(async()=>{
    const [operators,feed]=await Promise.all([
      fetchOperatorChecks(fetch,now),
      fetchPartnerServiceAlerts(
        process.env.TRANSIT_ALERTS_FEED_URL,
        process.env.TRANSIT_ALERTS_ALLOWED_HOST,fetch,now),
    ]);
    const snapshot:AlertMonitorSnapshot={checkedAt:now.toISOString(),
      operators,...feed};
    lastSnapshot=snapshot;
    expires=now.getTime()+120_000;
    return snapshot;
  })();
  try{return await inflight;}finally{inflight=null;}
}
