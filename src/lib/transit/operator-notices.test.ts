import {describe,expect,it,vi} from "vitest";
import {
  OPERATOR_NOTICE_URLS,isRecentNotice,parseCmrlNotices,parseMtcNotices,
} from "./operator-notices";
import {fetchOperatorChecks,fetchPartnerServiceAlerts} from "./operator-alert-source.server";

const now=new Date("2026-11-06T04:00:00.000Z");
const cmrlHtml='<table><tbody>'+
'<tr><td>21/10/2026</td><td>Revised Metro service timings for Corridor 4</td><td><a href="press.pdf">View</a></td></tr>'+
'<tr><td>02/11/2026</td><td>Metro connect service linking Porur Bypass</td><td>View</td></tr>'+
'<tr><td>15/08/2026</td><td>Construction event unrelated to passenger operations</td><td>View</td></tr>'+
'<tr><td>01/01/2024</td><td>Old service disruption</td><td>View</td></tr>'+
'</tbody></table>';
const mtcHtml='<div class="notice"><h5>Bus services temporarily shifted to alternative depot</h5>'+
'<p>MTC advisory</p><h6>Date: 01/11/2026</h6></div>'+
'<div class="notice"><h5>MTC recruitment advertisement</h5>'+
'<h6>Date: 31/10/2026</h6></div>';
const response=(html:string)=>new Response(html,{status:200,headers:{"Content-Type":"text/html"}});

describe("Operator notice polling is NOT a current-incident claim",()=>{
  it("extracts only recent, dated and relevant CMRL public advisories",()=>{
    const found=parseCmrlNotices(cmrlHtml,now);
    expect(found.map(n=>n.publishedDate)).toEqual(["2026-10-21","2026-11-02"]);
    expect(found.every(n=>n.category==="published_advisory")).toBe(true);
    expect(found.every(n=>n.sourceUrl===OPERATOR_NOTICE_URLS.CMRL)).toBe(true);
  });
  it("reads dated MTC notices and avoids unrelated announcements",()=>{
    const found=parseMtcNotices(mtcHtml,now);
    expect(found).toHaveLength(1);
    expect(found[0]?.title).toMatch(/temporarily shifted/i);
    expect(found[0]?.operator).toBe("MTC");
  });
  it("does not present stale, undated or future-dated notices as current",()=>{
    expect(isRecentNotice("2023-01-01",now)).toBe(false);
    expect(isRecentNotice("2026-12-01",now)).toBe(false);
    expect(isRecentNotice("2026-11-04",now)).toBe(true);
    expect(parseCmrlNotices("<tr><td>Today</td><td>Metro closed</td></tr>",now)).toEqual([]);
  });
  it("checks fixed official sources without accepting an arbitrary URL",async()=>{
    const fetcher=vi.fn(async(u:string|URL|Request)=>
      response(String(u).includes("chennaimetrorail.org")?cmrlHtml:mtcHtml));
    const checks=await fetchOperatorChecks(fetcher as unknown as typeof fetch,now);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(checks.map(x=>x.status)).toEqual(["checked","checked"]);
    expect(checks[0]?.notices.length).toBe(2);
    expect(checks[1]?.notices.length).toBe(1);
  });
  it("marks unreachable and changed pages unavailable rather than all-clear",async()=>{
    const result=await fetchOperatorChecks(vi.fn(async()=>response("<html>layout changed</html>")) as unknown as typeof fetch,now);
    expect(result.every(x=>x.status==="unavailable")).toBe(true);
    expect(result.every(x=>x.notices.length===0)).toBe(true);
  });
  it("never uses an unconfigured source to claim live incidents",async()=>{
    const res=await fetchPartnerServiceAlerts(undefined,undefined,fetch,now);
    expect(res.liveFeedStatus).toBe("not_configured");
    expect(res.activeAlerts).toEqual([]);
  });
  it("rejects unsafe, unapproved or unmatched partner URLs before network requests",async()=>{
    const request=vi.fn();
    const fetcher=request as unknown as typeof fetch;
    for(const url of ["http://example.org/alerts","https://evil.org/alerts","https://user:pass@example.org/feed"]){
      const res=await fetchPartnerServiceAlerts(url,"example.org",fetcher,now);
      expect(res.activeAlerts).toEqual([]);
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("reads only fresh active validated structured incidents from a configured feed",async()=>{
    const good={
      id:"cmrl-1",title:"CMRL blue line interruption",mode:"metro",
      severity:"major",sourceKind:"official",sourceLabel:"CMRL partner feed",
      publishedAt:"2026-11-06T03:58:00.000Z",
      startsAt:"2026-11-06T03:57:00.000Z",
      endsAt:"2026-11-06T06:00:00.000Z",
      affectedRouteIds:["CMRL-BLUE"],
    };
    const stale={...good,id:"stale",publishedAt:"2026-11-05T20:00:00.000Z"};
    const simulated={...good,id:"simulation",sourceKind:"simulation"};
    const expired={...good,id:"expired",endsAt:"2026-11-06T03:59:00.000Z"};
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({alerts:[good,stale,simulated,expired]}),{
      status:200,headers:{"Content-Type":"application/json"},
    }));
    const result=await fetchPartnerServiceAlerts("https://alerts.example.org/alerts","alerts.example.org",
      fetcher as unknown as typeof fetch,now);
    expect(result.liveFeedStatus).toBe("connected");
    expect(result.activeAlerts.map(a=>a.id)).toEqual(["cmrl-1"]);
  });
  it("reports malformed partner feed as unavailable without guessing",async()=>{
    const fetcher=vi.fn(async()=>new Response("<html>not JSON</html>",{status:200}));
    const status=await fetchPartnerServiceAlerts("https://alerts.example.org/alerts","alerts.example.org",
      fetcher as unknown as typeof fetch,now);
    expect(status.liveFeedStatus).toBe("unavailable");
    expect(status.activeAlerts).toHaveLength(0);
  });
});
