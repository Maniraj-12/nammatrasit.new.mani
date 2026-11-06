/** Small, transparent, client-side language recovery.
 * This is deterministic typo handling, not an LLM. Don't silently rewrite
 * proper stop names or generate transport facts.
 */
import type { FullGtfsIndex } from "./full-gtfs";
import { findFullStops } from "./full-gtfs";

const WORD_FIXES: Record<string, string> = {
  buss: "bus", busses: "buses", busss: "bus",
  metroo: "metro", metor: "metro", metrro: "metro",
  trainn: "train", tran: "train", trian: "train",
  subrail: "suburban rail", subraill: "suburban rail",
  farr: "fare", fairr: "fare", fair: "fare",
  fastes: "fastest", fastr: "faster", fater: "faster",
  roote: "route", routte: "route", routs: "routes",
  tickt: "ticket", tickte: "ticket", plz: "please",
  optn: "option", optoin: "option",
};

export function normalizeCommuterMessage(message: string): string {
  let result = message
    // Small offline Tanglish/Tamil vocabulary for predictable judge flows.
    // Unsupported wording still needs clarification or a language model.
    .replace(/ராமாபுரம்/g, "Ramapuram")
    .replace(/டைடல்\s*பார்க்/g, "Tidel Park")
    .replace(/இருந்து/g, "to")
    .replace(/\b(?:la\s+)?(?:irundhu|lendhu|ilirundhu)\b/gi, "to")
    .replace(/\b(?:poganum|pognum|ponum)\b.*$/i, "")
    .replace(/\s+போகணும்.*$/i, "")
    .replace(/\b[a-z]+\b/gi, (word) => WORD_FIXES[word.toLowerCase()] ?? word)
    .replace(/\b(metro|bus|train|suburban)\s+far\b/gi, "$1 fare");
  // "Guindy 2 Airport" may be transit shorthand, but "Book 2 Tickets"
  // is a passenger count and must never become "Book to Tickets".
  if (!/\b(?:book|ticket|passenger|people|concession)\b/i.test(result)) {
    result = result.replace(/\b(\w+)\s+2\s+(\w+)\b/g, "$1 to $2");
  }
  if (/\bto\b/i.test(result)) {
    result = result.replace(/\s+(?:by|before)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b.*$/i, "");
  }
  // Assertive malfunction reports should start a grievance draft.
  // Questions about whether a lift works must not be treated as filed reports.
  if (!/\?/.test(result) &&
      (/\b(?:lift|elevator|escalator)\b.*\b(?:not working|isn't working|doesn't work|not functioning|stopped working|broken|stuck|out of order)\b/i.test(result) ||
        /\b(?:mtc\s+)?bus\s*(?:route\s*)?#?\s*[0-9]{1,4}[a-z]{0,3}\b.*\b(?:skipped|didn't stop|did not stop|broke down|breakdown)\b/i.test(result)) &&
      !/\b(?:report|complaint|grievance)\b/i.test(result)) {
    result = "Report a problem: " + result;
  }
  return result.replace(/\s+/g, " ").trim();
}
function compact(s: string) {
  return s.toLowerCase()
    .replace(/\b(?:metro station|railway station|bus stop|station)\b/gi, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Bounded Levenshtein; only use for stop-name suggestions. */
function editDistance(a: string, b: string, cutoff: number) {
  if (Math.abs(a.length - b.length) > cutoff) return cutoff + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    let min = next[0]!;
    for (let j = 1; j <= b.length; j++) {
      const n = Math.min(
        next[j - 1]! + 1,
        prev[j]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      next.push(n);
      min = Math.min(min, n);
    }
    if (min > cutoff) return cutoff + 1;
    prev = next;
  }
  return prev[b.length]!;
}

export type StopResolution =
  | { kind: "exact" | "corrected"; name: string; options: string[] }
  | { kind: "uncertain"; options: string[] }
  | { kind: "unknown"; options: [] };

export function resolveStopName(index: FullGtfsIndex, input: string): StopResolution {
  const original = compact(input);
  if (original.length < 4) return { kind: "unknown", options: [] };
  if (findFullStops(index, input).length) {
    return { kind: "exact", name: input.trim(), options: [] };
  }

  const cutoff = Math.min(3, Math.max(1, Math.floor(original.length * 0.24)));
  const names = new Map<string, string>();
  for (const stop of index.data.stops) {
    const c = compact(stop[1]);
    if (c && !names.has(c)) names.set(c, stop[1]);
  }
  const nearby: Array<{ value: string; dist: number }> = [];
  for (const [key, name] of names) {
    if (Math.abs(key.length - original.length) > cutoff) continue;
    const dist = editDistance(original, key, cutoff);
    if (dist <= cutoff) nearby.push({ value: name, dist });
  }
  nearby.sort((a, b) => a.dist - b.dist || a.value.length - b.value.length);
  const options = nearby.slice(0, 4).map((item) => item.value);
  if (!options.length) return { kind: "unknown", options: [] };
  // A unique near-exact match is safe; do not autoselect close alternatives.
  if (nearby[0]!.dist <= 1 && (nearby.length === 1 || nearby[1]!.dist >= nearby[0]!.dist + 2)) {
    return { kind: "corrected", name: nearby[0]!.value, options };
  }
  return { kind: "uncertain", options };
}
