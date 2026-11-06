/**
 * Phase 1 judge-demo language slots. This is a transparent local fallback,
 * not an unrestricted generative AI model or a live transport-data provider.
 */
import type { Context } from "./engine";

export type DemoTurn = { title: string; prompt: string };

export const JUDGE_DEMO_TURNS: readonly DemoTurn[] = [
  { title: "1 · Tanglish journey", prompt: "Ramapuram lendhu Tidel Park by 10 AM" },
  { title: "2 · Wheelchair access", prompt: "Grandfather on wheelchair coming with me" },
  { title: "3 · Two tickets and fare", prompt: "Book 2 Unified Tickets (1 Senior Concession)" },
  { title: "4 · OMR rain disruption", prompt: "Any rain delay on OMR right now?" },
  { title: "5 · Lift grievance", prompt: "Guindy Metro North Gate lift is not working!" },
];

/** Update only traveller details actually mentioned; keep the rest sticky. */
export function mergeTravellerContext(message: string, oldContext: Context): Context {
  const ctx: Context = { passengers: 1, concessionType: "none", wheelchairRequired: false, ...oldContext };
  const t = message.toLowerCase();

  // Recognise a narrow, explicit Tanglish origin/destination pair for memory.
  // The actual journey planner must still validate both against GTFS.
  const pair = message.match(/^\s*([A-Za-z][A-Za-z .'-]{2,65}?)\s+(?:la\s+)?(?:lendhu|irundhu|ilirundhu)\s+(.+)$/i);
  if (pair) {
    const destination = pair[2]!
      .replace(/\s+(?:by|before)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b.*$/i, "")
      .replace(/\b(?:poganum|pognum|ponum)\b.*$/i, "")
      .replace(/[?!.,]+$/g, "").trim();
    if (destination && destination.length < 70) {
      ctx.origin = pair[1]!.trim();
      ctx.destination = destination;
    }
  }

  const number = t.match(/\b(\d{1,2})\s+(?:unified\s+)?(?:tickets?|passengers?|travell?ers?|people)\b/) ??
    t.match(/\b(?:for|book|need)\s+(\d{1,2})\s+(?:unified\s+)?(?:tickets?|passengers?|people)\b/);
  if (number) {
    const count = Number(number[1]);
    if (count >= 1 && count <= 12) ctx.passengers = count;
  }

  // Wheelchair is a travel requirement, not proof that any station or bus is accessible.
  if (/\b(?:no wheelchair|wheelchair not needed|without wheelchair)\b/i.test(message)) {
    ctx.wheelchairRequired = false;
  } else if (/\b(?:wheel\s?chair|wheel-chair|wheelchair-la|wheelchairil|mobility chair)\b/i.test(message) ||
      /வீல்சேர்|சக்கர நாற்காலி/i.test(message)) {
    ctx.wheelchairRequired = true;
  }

  if (/\b(?:senior\s+(?:citizen\s+)?concession|senior\s+ticket|senior\s+pass|one senior concession)\b/i.test(message)) {
    ctx.concessionType = "senior";
    const seniors = message.match(/\b(\d{1,2})\s+senior\b/i);
    ctx.concessionPassengers = seniors ? Number(seniors[1]) : 1;
  } else if (/\b(?:student\s+concession|student\s+pass|student\s+ticket)\b/i.test(message)) {
    ctx.concessionType = "student";
    ctx.concessionPassengers = 1;
  } else if (/\b(?:vidiyal|women(?:'s)?\s+ordinary\s+bus|free\s+ordinary\s+bus)\b/i.test(message)) {
    ctx.concessionType = "women_ordinary_bus";
    ctx.concessionPassengers = 1;
  } else if (/\b(?:no concession|full fare|regular fare)\b/i.test(message)) {
    ctx.concessionType = "none";
    ctx.concessionPassengers = undefined;
  }

  const arrival = message.match(/\b(?:by|before|reach by|arrive by)\s*(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i);
  if (arrival) {
    const hour = Number(arrival[1]);
    const minute = arrival[2] ?? "00";
    ctx.arrivalBy = `${hour}:${minute} ${arrival[3]!.toUpperCase()}`;
  }

  if (/\b(?:lendhu|irundhu|poganum|pognum|enna|varaaru|thatha|thaatha)\b/i.test(message)) {
    ctx.preferredLanguage = "tanglish";
  } else if (/[\u0B80-\u0BFF]/.test(message)) {
    ctx.preferredLanguage = "ta";
  }

  // A question about rain is NOT evidence of an active disruption.
  // Scenario activation will be wired to verified provider or simulated state in Phase 3.
  if (/\b(?:clear|reset)\s+(?:simulated\s+)?disruption\b/i.test(message)) {
    ctx.activeDisruption = undefined;
  }
  return ctx;
}
