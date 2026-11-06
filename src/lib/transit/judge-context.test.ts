import { describe, expect, it } from "vitest";
import { mergeTravellerContext, JUDGE_DEMO_TURNS } from "./judge-context";
import { normalizeCommuterMessage } from "./intent-recovery";
import { respond } from "./engine";

describe("Phase 1 — five-turn judge conversational memory", () => {
  it("has five ordered, clickable demo inputs", () => {
    expect(JUDGE_DEMO_TURNS).toHaveLength(5);
    expect(JUDGE_DEMO_TURNS[0]!.prompt).toMatch(/Ramapuram/i);
    expect(JUDGE_DEMO_TURNS[4]!.prompt).toMatch(/Guindy.*lift/i);
  });

  it("extracts the Tanglish journey with requested arrival-by time", () => {
    const first = JUDGE_DEMO_TURNS[0]!.prompt;
    const c = mergeTravellerContext(first, {});
    expect(c.origin).toBe("Ramapuram");
    expect(c.destination).toBe("Tidel Park");
    expect(c.arrivalBy).toBe("10:00 AM");
    expect(c.passengers).toBe(1);
    expect(c.preferredLanguage).toBe("tanglish");
    expect(normalizeCommuterMessage(first)).toBe("Ramapuram to Tidel Park");
  });

  it("retains origin/destination while adding wheelchair and two passengers", () => {
    const a = mergeTravellerContext(JUDGE_DEMO_TURNS[0]!.prompt, {});
    const b = mergeTravellerContext(JUDGE_DEMO_TURNS[1]!.prompt, a);
    const c = mergeTravellerContext(JUDGE_DEMO_TURNS[2]!.prompt, b);
    expect(b.origin).toBe("Ramapuram");
    expect(b.destination).toBe("Tidel Park");
    expect(b.wheelchairRequired).toBe(true);
    expect(c.passengers).toBe(2);
    expect(c.concessionType).toBe("senior");
    expect(c.concessionPassengers).toBe(1);
    expect(c.wheelchairRequired).toBe(true);
    expect(c.arrivalBy).toBe("10:00 AM");
    expect(normalizeCommuterMessage(JUDGE_DEMO_TURNS[2]!.prompt)).toContain("2 Unified Tickets");
  });

  it("does not turn a question about rain into a verified live disruption", () => {
    let context = {};
    for (const turn of JUDGE_DEMO_TURNS.slice(0,4)) {
      context = mergeTravellerContext(turn.prompt, context);
    }
    expect(context).toMatchObject({
      origin: "Ramapuram",
      destination: "Tidel Park",
      passengers: 2,
      wheelchairRequired: true,
      concessionType: "senior",
    });
    expect((context as {activeDisruption?:string}).activeDisruption).toBeUndefined();
  });

  it("starts a complaint draft rather than claiming an issue was dispatched", () => {
    let context = {};
    for (const turn of JUDGE_DEMO_TURNS) {
      context = mergeTravellerContext(turn.prompt, context);
    }
    const complaintText = normalizeCommuterMessage(JUDGE_DEMO_TURNS[4]!.prompt);
    expect(complaintText).toMatch(/^Report a problem:/);
    const reply = respond(complaintText, context);
    expect(reply.context.grievance).toBeDefined();
    expect(reply.context.origin).toBe("Ramapuram");
    expect(reply.context.destination).toBe("Tidel Park");
    expect(reply.context.passengers).toBe(2);
    expect(reply.context.wheelchairRequired).toBe(true);
    expect(reply.cards).toEqual([]);
  });

  it("can recover a very common Tamil-script journey phrase", () => {
    const message = "ராமாபுரம் இருந்து டைடல் பார்க் போகணும்";
    expect(normalizeCommuterMessage(message)).toBe("Ramapuram to Tidel Park");
  });

  it("does not invent lifts for a station without verified facility data", () => {
    const reply = respond("Is the starting station wheelchair accessible?", {
      origin:"Ramapuram",destination:"Tidel Park",wheelchairRequired:true,
      passengers:2,concessionType:"senior",
    });
    expect(reply.reply).toMatch(/not verified/i);
    expect(reply.cards.some((c) => c.kind === "facility")).toBe(false);
    expect(reply.context.origin).toBe("Ramapuram");
    expect(reply.context.wheelchairRequired).toBe(true);
  });
});
