import { describe, expect, it, vi } from "vitest";
import { requestTransitResponse } from "./chat-client";
import { respond, type Context } from "./engine";
import { respondFromFullGtfs } from "./full-gtfs-chat";

const existingJourney: Context = {
  origin: "Guindy",
  destination: "Chennai Airport",
  passengers: 2,
  wheelchairRequired: true,
  concessionType: "senior",
  concessionPassengers: 1,
};

describe("Sticky conversational grievances — Phase 1 regression", () => {
  it("auto-extracts explicit operator, location, category, and description", () => {
    const first = respond(
      "Report a problem: Guindy Metro North Gate lift is not working!",
      existingJourney,
    );
    expect(first.context.grievance?.step).toBe("datetime");
    expect(first.context.grievance?.data).toEqual({
      operator: "CMRL (Chennai Metro)",
      location: "Guindy Metro North Gate",
      category: "Lift / escalator",
      description: "Guindy Metro North Gate lift is not working!",
    });
    expect(first.reply).toContain("When did it happen");
    expect(first.context.origin).toBe("Guindy");
    expect(first.context.destination).toBe("Chennai Airport");
    expect(first.context.passengers).toBe(2);
    expect(first.context.wheelchairRequired).toBe(true);

    const second = respond("Today morning", first.context);
    expect(second.cards).toHaveLength(1);
    expect(second.cards[0]?.kind).toBe("grievance");
    expect(second.reply).toMatch(/not.*filed|nothing has been filed/i);
    expect(second.context.grievance).toBeUndefined();
    expect(second.context.origin).toBe("Guindy");
    if(second.cards[0]?.kind === "grievance") {
      expect(second.cards[0].draft.datetime).toBe("Today morning");
      expect(second.cards[0].draft.location).toContain("North Gate");
    }
  });

  it("routes 'Metro' to active complaint, not a Metro journey search", async () => {
    const pending = respond("I want to report a problem", existingJourney);
    expect(pending.context.grievance?.step).toBe("operator");
    const serverFn = vi.fn(async () => { throw new Error("unavailable"); });

    const after = await requestTransitResponse("Metro", pending.context, serverFn);
    expect(serverFn).not.toHaveBeenCalled();
    expect(after.reply.context.grievance?.step).toBe("location");
    expect(after.reply.context.grievance?.data.operator).toBe("CMRL (Chennai Metro)");
    expect(after.reply.reply).toContain("Which station");
    expect(after.reply.cards).toEqual([]);
    expect(after.reply.context.origin).toBe("Guindy");
    expect(after.reply.context.destination).toBe("Chennai Airport");
    expect(after.reply.context.concessionType).toBe("senior");
    expect(await respondFromFullGtfs("Metro",pending.context)).toBeNull();
  });

  it("can finish a manual five-step complaint without losing previous route", async () => {
    const serverFn = vi.fn(async () => { throw new Error("server unavailable"); });
    let context = respond("Report a problem", existingJourney).context;
    for (const [input,nextStep] of [
      ["Metro","location"],
      ["Guindy Metro North Gate","category"],
      ["Lift / escalator","description"],
      ["The lift is stuck and I cannot use it","datetime"],
    ]) {
      const res = await requestTransitResponse(input,context,serverFn);
      context = res.reply.context;
      expect(context.grievance?.step).toBe(nextStep);
      expect(context.destination).toBe("Chennai Airport");
      expect(context.passengers).toBe(2);
    }
    const last = await requestTransitResponse("Today morning",context,serverFn);
    expect(last.reply.cards[0]?.kind).toBe("grievance");
    expect(last.reply.context.grievance).toBeUndefined();
    expect(last.reply.context.wheelchairRequired).toBe(true);
    expect(serverFn).not.toHaveBeenCalled();
  });

  it("does not invent the grievance operator from the selected journey", () => {
    const first = respond("Report a problem", existingJourney);
    expect(first.context.grievance?.step).toBe("operator");
    expect(first.context.grievance?.data.operator).toBeUndefined();
  });

  it("captures direct bus stop complaints, not a new bus itinerary", () => {
    const r = respond("Report a problem: MTC bus 570 skipped the stop", existingJourney);
    expect(r.context.grievance?.data.operator).toBe("MTC (Bus)");
    expect(r.context.grievance?.data.location).toBe("MTC Bus Route 570");
    expect(r.context.grievance?.data.category).toBe("Bus skipped stop");
    expect(r.context.origin).toBe("Guindy");
  });

  it("does not auto-submit a grievance or create fake official receipt IDs", () => {
    const pending = respond("Guindy Metro North Gate lift is not working!", existingJourney);
    // This direct engine call is not normalised by chat-client, but should
    // not accidentally create a verified operator grievance either.
    expect(pending.cards.every((c) => c.kind !== "grievance")).toBe(true);
  });

  it("allows cancellation without erasing the journey", () => {
    const started = respond("Report a problem", existingJourney);
    const cancelled = respond("Cancel complaint", started.context);
    expect(cancelled.context.grievance).toBeUndefined();
    expect(cancelled.context.origin).toBe("Guindy");
    expect(cancelled.context.destination).toBe("Chennai Airport");
  });
});
