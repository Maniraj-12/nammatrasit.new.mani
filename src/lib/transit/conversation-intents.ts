/**
 * High-priority conversational intents are decided before GTFS route search.
 * This is deliberately narrow: a "show" verb alone is not a travel request.
 */
export function isServiceUpdateRequest(message: string): boolean {
  const t = message.toLowerCase().replace(/[?!.,:]+/g, " ").replace(/\s+/g, " ").trim();
  return (
    /\b(?:service|transit|transport)\s+(?:updates?|alerts?|status|disruptions?|delays?)\b/.test(t) ||
    /\b(?:show|check|see|give|list|display|latest|current)\s+(?:me\s+)?(?:(?:the|all|any|current|latest)\s+)?(?:metro\s+|mtc\s+|bus\s+|train\s+)?(?:alerts?|disruptions?|updates?)\b/.test(t) ||
    /\b(?:are there|is there|any)\s+(?:any\s+)?(?:service\s+)?(?:alerts?|disruptions?|delays?|cancellations?)\b/.test(t) ||
    /\b(?:rain|waterlogging)\s+(?:delay|disruption)s?\b/.test(t) ||
    /\b(?:bus|train|metro)\s+(?:service\s+)?(?:delayed|cancelled|disrupted|running today)\b/.test(t)
  );
}

/** A short affirmative report is not a question about a service's condition. */
export function isExplicitIncidentReport(message: string): boolean {
  const t = message.trim().toLowerCase();
  if (!t || /\?$/.test(t) ||
      /^(?:is|are|will|does|do|how|when|where|what|can)\b/.test(t)) return false;
  return (
    /\b(?:lift|elevator|escalator)\b.{0,90}\b(?:stuck|broken|not working|out of order|failed|stopped)\b/.test(t) ||
    /\b(?:mtc|bus)\b.{0,50}\b(?:skipp?ed|did not stop|didn't stop|broke down|breakdown)\b/.test(t)
  );
}
