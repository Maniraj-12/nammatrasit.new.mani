/**
 * High-priority conversational turns that must not be intercepted by
 * GTFS journey search simply because they contain words like "show", "bus",
 * "metro", or an already remembered origin/destination.
 *
 * This is a cautious offline intent gate, not broad LLM understanding.
 */
export type PriorityConversationIntent =
  | "service_alerts" | "grievance" | "accessibility" | "fare"
  | "itinerary_followup" | null;

export function detectPriorityConversationIntent(message: string): PriorityConversationIntent {
  const t = message.toLowerCase().replace(/\s+/g, " ").trim();

  // TomTom traffic comparisons and live-vehicle status have a separate,
  // source-labelled handler. Never turn road traffic into operator disruption.
  if (/\b(traffic|congestion|road jam|traffic[- ]aware|live tracking|next bus|next train)\b/.test(t)) {
    return null;
  }

  if (/\b(?:file|submit|make|draft|write|register|report)\b.{0,35}\b(?:complaint|grievance|problem|issue)\b/.test(t) ||
      /\b(?:complaint|grievance|report (?:another|a) (?:problem|issue))\b/.test(t) ||
      (!t.endsWith("?") && /\b(?:lift|elevator|escalator)\b.{0,45}\b(?:not working|broken|stuck|out of order)\b/.test(t))) {
    return "grievance";
  }
  if (/\b(?:service|transport|metro|mtc|bus|train|suburban|rail)\s+(?:status|updates?|alerts?|disruptions?)\b/.test(t) ||
      /\b(?:show|check|any|latest|current|what(?:'s| is))\b.{0,35}\b(?:service\s+updates?|service\s+alerts?|disruptions?|breakdowns?|cancellations?)\b/.test(t) ||
      /\b(?:rain|waterlogging|flood|strike)\s+(?:delay|disruption|closure|updates?)\b/.test(t) ||
      /\b(?:delay|disruption|cancellation|service alerts?)\b/.test(t) ||
      /\b(?:any|are there)\s+(?:rain|service|train|bus|metro)\s+delays?\b/.test(t)) {
    return "service_alerts";
  }
  if (/\b(?:wheelchair|accessible|accessibility|elevator|escalator|lift|ramp|step[- ]free|platform access)\b/.test(t)) {
    return "accessibility";
  }
  if (/\b(?:fare|fares|ticket price|ticket cost|ticket details|concession|how much|cost|pricing|refund)\b/.test(t)) {
    return "fare";
  }
  if (/\b(?:which is faster|which is fastest|compare routes|select option|choose option|pick option|previous option|fare breakdown|where should i change|where do i change|interchange|transfer station|how long will it take)\b/.test(t)) {
    return "itinerary_followup";
  }
  return null;
}
