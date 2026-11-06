import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, RefreshCw, Radio } from "lucide-react";
import {
  OPERATOR_NOTICE_URLS,type AlertMonitorSnapshot,
} from "@/lib/transit/operator-notices";

const INTERVAL_MS=120_000;
const emptyMessage="The public notice checker is unavailable here. This does not mean services are running normally.";

export function LiveDisruptionsPanel() {
  const [snapshot,setSnapshot]=useState<AlertMonitorSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [refresh,setRefresh]=useState(0);

  useEffect(()=>{
    const controller=new AbortController();
    let active=true;
    const update=async()=>{
      if(typeof document!=="undefined"&&document.visibilityState==="hidden")return;
      setLoading(true);
      try{
        const response=await fetch("/api/live-disruptions",{
          signal:controller.signal,cache:"no-store",
          headers:{Accept:"application/json"},
        });
        if(!response.ok)throw Error("Status unavailable");
        const data=await response.json() as AlertMonitorSnapshot;
        if(!Array.isArray(data.operators)||!Array.isArray(data.activeAlerts))throw Error("Invalid status");
        if(active){setSnapshot(data);setError(false);}
      }catch{
        if(active&&!controller.signal.aborted){setSnapshot(null);setError(true);}
      }finally{if(active)setLoading(false);}
    };
    void update();
    const timer=setInterval(()=>void update(),INTERVAL_MS);
    return ()=>{active=false;clearInterval(timer);controller.abort();};
  },[refresh]);

  return (
    <section aria-label="Checked operator notices and configured real-time service alerts"
      className="rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold">
            <Radio className="h-4 w-4 text-accent"/> Operator source monitor
          </p>
          <p className="mt-1 text-muted-foreground">
            Automatic check every 2 minutes while this card is open.
          </p>
        </div>
        <button type="button" disabled={loading} onClick={()=>setRefresh(x=>x+1)}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg border bg-background px-3 py-1.5 font-semibold disabled:opacity-50"
          aria-label="Check official transport notices again">
          <RefreshCw className={loading?"h-3.5 w-3.5 animate-spin":"h-3.5 w-3.5"}/>
          Check again
        </button>
      </div>
      {loading&&!snapshot&&<p role="status" className="mt-2 text-muted-foreground">Checking operator sources…</p>}
      {error&&<p role="status" className="mt-2 text-amber-800 dark:text-amber-200">
        {emptyMessage}
      </p>}
      {snapshot&&(
        <div className="mt-3 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Last checked: {new Date(snapshot.checkedAt).toLocaleString("en-IN")}. Operator websites contain
            published notices, <strong>not live-confirmed train or bus status</strong>.
          </p>
          {snapshot.liveFeedStatus==="not_configured"&&(
            <p className="flex items-start gap-1.5 text-amber-800 dark:text-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0"/>
              No authorised machine-readable live disruption feed is connected. We cannot confirm active outages, normal operation or disruption-aware ETAs.
            </p>
          )}
          {snapshot.liveFeedStatus==="unavailable"&&(
            <p role="status" className="text-amber-800 dark:text-amber-200">
              Configured live alert source is unreachable or stale. Its data is not displayed.
            </p>
          )}
          {snapshot.liveFeedStatus==="connected"&&(
            <div className="space-y-2">
              <p className="font-bold">Configured real-time alert feed: checked</p>
              {snapshot.activeAlerts.length ? snapshot.activeAlerts.map(a=>(
                <div key={a.id} className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-amber-950">
                  <p className="font-semibold">{a.title}</p>
                  <p>{a.mode} · {a.severity} · {a.sourceLabel}</p>
                  <p>Published: {new Date(a.publishedAt).toLocaleString("en-IN")}</p>
                  {!!a.affectedRouteIds.length&&<p>Affected IDs: {a.affectedRouteIds.join(", ")}</p>}
                </div>
              )):<p className="text-muted-foreground">
                No active alerts returned by the connected feed. This does not guarantee that all services are operating normally.
              </p>}
            </div>
          )}
          {snapshot.operators.map(source=>(
            <div key={source.operator} className="space-y-1 rounded-lg border bg-background p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{source.operator} — published notices</span>
                <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                  Official website <ExternalLink className="h-3 w-3"/>
                </a>
              </div>
              {source.status==="unavailable"
                ? <p className="text-amber-700 dark:text-amber-200">
                    Unable to read dated notices from the official page. Check directly; no normal-service assumption is made.
                  </p>
                : source.notices.length ? source.notices.map(note=>(
                  <p key={note.id} className="border-t pt-1.5">
                    <span className="font-medium">{note.title}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Published {note.publishedDate} · historical/public advisory, not confirmation of a current disruption
                    </span>
                  </p>
                )):<p className="text-muted-foreground">
                    No recent matching operational notice found in this public page. This is not a live all-clear.
                  </p>}
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Official links: <a className="underline" href={OPERATOR_NOTICE_URLS.CMRL}
          rel="noopener noreferrer" target="_blank">CMRL</a> ·{" "}
        <a className="underline" href={OPERATOR_NOTICE_URLS.MTC}
          rel="noopener noreferrer" target="_blank">MTC</a>.
        Historical advisories are never automatically treated as active service disruptions.
      </p>
    </section>
  );
}
