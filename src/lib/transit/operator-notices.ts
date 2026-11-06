/**
 * Official Chennai operator notices are PUBLIC WEB NOTICES, not a verified
 * real-time GTFS-RT service-alert feed. Never turn these notices into live
 * outage claims or automatic disruption-avoidance decisions.
 */
export type OperatorCode = "CMRL" | "MTC";
export type NoticeStatus = "checked" | "unavailable";
export type OperatorNotice = {
  id: string;operator:OperatorCode; title:string;publishedDate:string;
  sourceUrl:string;category:"published_advisory";
};
export type OperatorSourceCheck = {
  operator:OperatorCode;status:NoticeStatus;sourceUrl:string;
  checkedAt:string;notices:OperatorNotice[];
};
export type AlertMonitorSnapshot = {
  checkedAt:string;
  liveFeedStatus:"not_configured"|"unavailable"|"connected";
  /** Feed-provided structured alerts, if an authorised integration exists. */
  activeAlerts: Array<{
    id:string;title:string;mode:string;severity:string;
    sourceLabel:string;publishedAt:string;
    affectedRouteIds:string[];
  }>;
  operators:OperatorSourceCheck[];
};

export const OPERATOR_NOTICE_URLS={
  CMRL:"https://chennaimetrorail.org/press-release/",
  MTC:"https://mtcbus.tn.gov.in/Home/news",
} as const;

/** Only announce recent items that can reasonably concern passenger operation.
 * These are published notices, NOT guaranteed active disruptions.
 */
const relevant=/\b(?:service (?:times?|timings?|updates?|changes?|frequency|interruption)|train service|bus service|schedule changes?|temporary closure|permanent closure|revised|entrances?|entry\/exit|shif(?:t|ted)|relocat(?:e|ed)|diversion|suspend(?:ed|sion)|disrupt(?:ion|ed)|cancel(?:led|lation)|special trains?|track maintenance)\b/i;
const decode=(x:string)=>x.replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&")
  .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,"<").replace(/&gt;/gi,">");
const plain=(x:string)=>decode(x.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim());
function normalizeDate(raw:string):string|null{
  const m=raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if(!m)return null;
  const d=Number(m[1]),month=Number(m[2]),y=Number(m[3]);
  const dt=new Date(Date.UTC(y,month-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==month-1||dt.getUTCDate()!==d)return null;
  return [String(y),String(month).padStart(2,"0"),String(d).padStart(2,"0")].join("-");
}
export function isRecentNotice(publishedDate:string,now=new Date(),days=90):boolean{
  const date=new Date(publishedDate+"T00:00:00+05:30").getTime();
  const diff=now.getTime()-date;
  return Number.isFinite(diff)&&diff>=-86_400_000&&diff<=days*86_400_000;
}

/** Parse only dated rows, never scrape a date-less breaking claim. */
export function parseCmrlNotices(html:string,now=new Date()):OperatorNotice[]{
  const matches=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const result:OperatorNotice[]=[];
  for(const match of matches){
    const cells=[...match[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>plain(x[1]!));
    if(cells.length<2)continue;
    const publishedDate=normalizeDate(cells[0]!);
    const title=cells[1]!.replace(/\s+View\s*$/i,"").trim().slice(0,230);
    if(!publishedDate||!isRecentNotice(publishedDate,now)||!relevant.test(title))continue;
    result.push({id:"cmrl-"+publishedDate+"-"+result.length,operator:"CMRL",
      title,publishedDate,sourceUrl:OPERATOR_NOTICE_URLS.CMRL,category:"published_advisory"});
  }
  return result.slice(0,12);
}

/** MTC publishes a news page, not a realtime alert JSON API.
 * Parse dated headlines only if the underlying HTML offers sufficient
 * structure. When parsing fails, show source unavailable rather than
 * claiming the operator has zero disruptions.
 */
export function parseMtcNotices(html:string,now=new Date()):OperatorNotice[]{
  const entries:OperatorNotice[]=[];
  // A news-item block normally includes a heading before its Date label.
  const chunks=html.split(/(?=<h[2-6]\b)/i);
  for(const chunk of chunks){
    const heading=chunk.match(/<h[2-6]\b[^>]*>([\s\S]*?)<\/h[2-6]>/i);
    if(!heading)continue;
    const raw=plain(chunk.slice(0,1600));
    const date=raw.match(/\bDate\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    const publishedDate=date&&normalizeDate(date[1]!);
    const title=plain(heading[1]!).slice(0,230);
    if(!publishedDate||!isRecentNotice(publishedDate,now)||!relevant.test(title))continue;
    entries.push({id:"mtc-"+publishedDate+"-"+entries.length,operator:"MTC",
      title,publishedDate,sourceUrl:OPERATOR_NOTICE_URLS.MTC,category:"published_advisory"});
  }
  return entries.slice(0,12);
}
