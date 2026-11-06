/**
 * Intent guards that must run before GTFS journey discovery.
 *
 * "Show service updates" is not "show [journeys]". Keep this deterministic
 * in Google AI Studio preview, where server chat functions may be unavailable.
 */
export function isServiceUpdateRequest(message: string): boolean {
  const t = message.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t || /\b(?:report|complain|complaint|grievance|file a)\b/.test(t)) {
    return false;
  }
  if (/\b(?:service|services)\s+(?:updates?|alerts?|status|disruptions?|notices?)\b/.test(t)) {
    return true;
  }
  if (/^(?:alerts?|disruptions?|delays?|service status)\??$/.test(t)) {
    return true;
  }
  if (/\b(?:show|check|any|latest|current|today|are there|is there|what(?:'s| is))\b.{0,55}\b(?:alerts?|disruptions?|delays?|closures?|cancellations?)\b/.test(t)) {
    return true;
  }
  if (/\b(?:is|are)\b.{0,52}\b(?:delayed|cancelled|disrupted|closed|suspended)\b/.test(t)) {
    return true;
  }
  if (/\b(?:status|alerts?|disruptions?)\s+(?:of|for)\s+(?:my\s+)?(?:bus|train|metro|route|service|suburban)\b/.test(t)) {
    return true;
  }
  return false;
}
