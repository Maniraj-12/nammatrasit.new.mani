/**
 * Adapted from the teammate's NammaTransit Disruption Engine ZIP.
 * Pure evaluator: it does not fetch official updates, create journeys or
 * claim that routes are operating. All demo alerts are explicit simulations.
 */
export type TransitMode = "bus" | "metro" | "suburban" | "walk" | "other";
export type AlertSourceKind = "official" | "third_party" | "simulation";
export type AlertSeverity = "info" | "minor" | "major" | "suspended";
export type TransitStopRef = { id?: string; name?: string };
export type TransitLeg = {
  id: string; mode: TransitMode; routeId?: string;
  from: TransitStopRef; to: TransitStopRef;
  viaStops?: TransitStopRef[]; durationMinutes?: number; fareRupees?: number;
};
export type TransitJourney = {
  id: string; legs: TransitLeg[]; durationMinutes?: number; fareRupees?: number;
};
export type TransitDisruption = {
  id: string; title: string; details?: string;
  mode: "bus" | "metro" | "suburban"; severity: AlertSeverity;
  sourceKind: AlertSourceKind; sourceLabel: string; sourceUrl?: string;
  publishedAt: string; startsAt: string; endsAt?: string;
  affectedRouteIds?: string[]; affectedStops?: TransitStopRef[]; modeWide?: boolean;
};
export type MatchConfidence = "confirmed" | "possible";
export type JourneyImpact = {
  alertId: string; title: string; severity: AlertSeverity;
  confidence: MatchConfidence; affectedLegIds: string[];
  sourceKind: AlertSourceKind; sourceLabel: string;
};
export type AnalyzedJourney = {
  journey: TransitJourney; status: "clear" | "possibly_affected" | "affected";
  impacts: JourneyImpact[];
};
export type RerouteResult = {
  current: AnalyzedJourney; alternatives: AnalyzedJourney[];
  uncertainAlternatives: AnalyzedJourney[]; message: string;
};

const norm = (x: string | undefined) => (x ?? "").normalize("NFKC").trim()
  .toLowerCase().replace(/[\s_-]+/g, " ");
const validDate = (x: unknown) => typeof x === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/i.test(x) &&
  Number.isFinite(Date.parse(x));

export function validateDisruption(alert: TransitDisruption): string[] {
  if (!alert || typeof alert !== "object") return ["Invalid alert"];
  const err: string[] = [];
  if (typeof alert.id !== "string" || !alert.id.trim() ||
      typeof alert.title !== "string" || !alert.title.trim()) err.push("id and title required");
  if (typeof alert.sourceLabel !== "string" || !alert.sourceLabel.trim()) err.push("sourceLabel required");
  if (!["bus","metro","suburban"].includes(alert.mode)) err.push("Invalid transit mode");
  if (!["simulation","official","third_party"].includes(alert.sourceKind)) err.push("Invalid alert source");
  if (!["info","minor","major","suspended"].includes(alert.severity)) err.push("Invalid severity");
  if (!validDate(alert.publishedAt) || !validDate(alert.startsAt) ||
      (alert.endsAt !== undefined && !validDate(alert.endsAt))) err.push("Invalid dated alert");
  if (validDate(alert.endsAt) && validDate(alert.startsAt) &&
      Date.parse(alert.endsAt!) <= Date.parse(alert.startsAt)) err.push("endsAt must follow startsAt");
  const routes = Array.isArray(alert.affectedRouteIds) &&
    alert.affectedRouteIds.some(x => typeof x === "string" && x.trim());
  const stops = Array.isArray(alert.affectedStops) &&
    alert.affectedStops.some(x => x && (x.id?.trim() || x.name?.trim()));
  if (!routes && !stops && alert.modeWide !== true) err.push("Alert has no affected routes or stops");
  // "not a live service alert" is the *required disclaimer*, not a claim
  // of live status. Reject affirmative live/official marketing language.
  const falselyLive = /\blive\b/i.test(alert.sourceLabel) &&
    !/\bnot\s+(?:a\s+)?live\b/i.test(alert.sourceLabel);
  if (alert.sourceKind === "simulation" &&
      (/\b(?:official|verified)\b/i.test(alert.sourceLabel) || falselyLive)) {
    err.push("Simulation must not be presented as official or live");
  }
  return err;
}

export function isDisruptionActive(alert: TransitDisruption, now = new Date()): boolean {
  if (validateDisruption(alert).length) return false;
  const t = now.getTime();
  return Number.isFinite(t) && Date.parse(alert.startsAt) <= t &&
    (!alert.endsAt || t < Date.parse(alert.endsAt));
}

function sameStop(a: TransitStopRef,b: TransitStopRef): boolean {
  if (a.id && b.id) return norm(a.id) === norm(b.id);
  return !!a.name && !!b.name && norm(a.name) === norm(b.name);
}

export function matchDisruptionToLeg(alert: TransitDisruption, leg: TransitLeg): MatchConfidence | null {
  if (alert.mode !== leg.mode) return null;
  const routes = (alert.affectedRouteIds ?? []).filter(Boolean).map(norm);
  const affectedStops = (alert.affectedStops ?? []).filter(x => x.id?.trim() || x.name?.trim());
  if (routes.length) {
    if (!leg.routeId) return "possible";
    if (!routes.includes(norm(leg.routeId))) return null;
  }
  if (affectedStops.length) {
    const stops = [leg.from, ...(leg.viaStops ?? []), leg.to];
    if (affectedStops.some(a => stops.some(v => sameStop(a,v)))) return "confirmed";
    if (routes.length && !leg.viaStops?.length) return "possible";
    return null;
  }
  return alert.modeWide || routes.length > 0 ? "confirmed" : null;
}

export function analyzeJourney(journey: TransitJourney,
  alerts: readonly TransitDisruption[], now = new Date()): AnalyzedJourney {
  const impacts: JourneyImpact[] = [];
  for (const alert of alerts) {
    if (!isDisruptionActive(alert,now)) continue;
    const matches = journey.legs.map(leg => ({
      id: leg.id,confidence: matchDisruptionToLeg(alert,leg),
    })).filter(item => item.confidence !== null);
    if (!matches.length) continue;
    impacts.push({
      alertId:alert.id,title:alert.title,severity:alert.severity,
      confidence:matches.some(m => m.confidence==="confirmed")?"confirmed":"possible",
      affectedLegIds:matches.map(m=>m.id),sourceKind:alert.sourceKind,sourceLabel:alert.sourceLabel,
    });
  }
  return {
    journey,
    status: impacts.some(x=>x.confidence==="confirmed") ? "affected" :
      impacts.length ? "possibly_affected" : "clear",impacts,
  };
}

const score=(x:number|undefined)=>x!==undefined&&Number.isFinite(x)&&x>=0?x:Infinity;
export function findDisruptionAlternatives(
  current:TransitJourney,candidates:readonly TransitJourney[],
  alerts:readonly TransitDisruption[],now=new Date()):RerouteResult {
  const active=alerts.filter(a=>isDisruptionActive(a,now));
  const existing=new Map<string,TransitJourney>();
  for(const candidate of candidates){
    if(candidate.id!==current.id && !existing.has(candidate.id))existing.set(candidate.id,candidate);
  }
  const analyses=[...existing.values()].map(j=>analyzeJourney(j,active,now));
  const rank=(a:AnalyzedJourney,b:AnalyzedJourney)=>
    score(a.journey.durationMinutes)-score(b.journey.durationMinutes) ||
    score(a.journey.fareRupees)-score(b.journey.fareRupees);
  const alternatives=analyses.filter(a=>a.status==="clear").sort(rank);
  const uncertainAlternatives=analyses.filter(a=>a.status!=="clear").sort(rank);
  const currentAnalysis=analyzeJourney(current,active,now);
  const message=currentAnalysis.status==="clear"
    ? "No supplied active disruption matched this journey. This does not verify service operation."
    : alternatives.length
      ? String(alternatives.length)+" GTFS candidate(s) have no match in the supplied alerts. Confirm service operation before travel."
      : "No confirmed unaffected alternative was found among supplied routes.";
  return {current:currentAnalysis,alternatives,uncertainAlternatives,message};
}

export function createSimulatedDisruption(
  input:Omit<TransitDisruption,"sourceKind"|"sourceLabel"|"publishedAt">,
  now=new Date()):TransitDisruption {
  return {...input,sourceKind:"simulation",
    sourceLabel:"Hackathon demonstration — not a live service alert",
    publishedAt:now.toISOString()};
}
