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

  it("does not record a repeated operator answer as incident date", async () => {
    const first = respond("Report a problem: Guindy Metro North Gate lift is not working!",existingJourney);
    expect(first.context.grievance?.step).toBe("datetime");
    const repeated = await requestTransitResponse("Metro",first.context,async () => {
      throw new Error("Should be handled by the ongoing complaint flow");
    });
    expect(repeated.reply.context.grievance?.step).toBe("datetime");
    expect(repeated.reply.context.grievance?.data.datetime).toBeUndefined();
    expect(repeated.reply.context.grievance?.data.operator).toBe("CMRL (Chennai Metro)");
    const invalid = respond("Blue Line",repeated.reply.context);
    expect(invalid.context.grievance?.step).toBe("datetime");
    expect(invalid.cards).toEqual([]);
    expect(invalid.reply).toMatch(/approximately when/i);
  });

  it.each([
    ["lift", "Lift / escalator"],
    ["escalator", "Lift / escalator"],
    ["Lift / escalator", "Lift / escalator"],
    ["staff", "Staff behaviour"],
    ["staff behaviour", "Staff behaviour"],
    ["ticket", "Ticketing"],
    ["dirty", "Cleanliness"],
    ["overcrowded", "Overcrowding"],
    ["bus skipped stop", "Bus skipped stop"],
    ["safety", "Safety"],
    ["refund", "Ticketing"],
  ])("recognises one-phrase category %s as %s without asking again", (word, expected) => {
    const first = respond("Report a problem", existingJourney);
    const second = respond("Metro", first.context);
    const third = respond("Guindy", second.context);
    expect(third.context.grievance?.step).toBe("category");
    const typed = respond(word, third.context);
    expect(typed.context.grievance?.step).toBe("description");
    expect(typed.context.grievance?.data.category).toBe(expected);
    expect(typed.reply).toMatch(/describe what happened/i);
    expect(typed.context.origin).toBe("Guindy");
    expect(typed.context.destination).toBe("Chennai Airport");
  });

  it("stores category but still asks for location if user types 'lift' too early", () => {
    const started = respond("Report a problem", existingJourney);
    const operator = respond("Metro", started.context);
    const early = respond("lift", operator.context);
    expect(early.context.grievance?.step).toBe("location");
    expect(early.context.grievance?.data.category).toBe("Lift / escalator");
    expect(early.context.grievance?.data.location).toBeUndefined();
    expect(early.reply).toMatch(/Which station/i);
    const location = respond("Guindy", early.context);
    expect(location.context.grievance?.step).toBe("description");
    expect(location.context.grievance?.data.location).toContain("Guindy");
  });

  it("accepts station and issue together as a single followup", () => {
    const started = respond("Report a problem", existingJourney);
    const operator = respond("Metro", started.context);
    const both = respond("Guindy North Gate lift is stuck", operator.context);
    expect(both.context.grievance?.step).toBe("datetime");
    expect(both.context.grievance?.data.category).toBe("Lift / escalator");
    expect(both.context.grievance?.data.location).toContain("Guindy");
    expect(both.context.grievance?.data.description).toContain("stuck");
    const finish = respond("Today morning", both.context);
    expect(finish.cards[0]?.kind).toBe("grievance");
    expect(finish.context.origin).toBe("Guindy");
    expect(finish.context.passengers).toBe(2);
  });

  it("when only 'lift is stuck' is supplied, keeps the issue and asks for location", () => {
    const first = respond("Report a problem", existingJourney);
    const op = respond("Metro", first.context);
    const earlyIssue = respond("lift is stuck", op.context);
    expect(earlyIssue.context.grievance?.step).toBe("location");
    expect(earlyIssue.context.grievance?.data.category).toBe("Lift / escalator");
    expect(earlyIssue.context.grievance?.data.description).toBe("lift is stuck");
    expect(earlyIssue.context.grievance?.data.location).toBeUndefined();
    const finalLocation = respond("Guindy", earlyIssue.context);
    expect(finalLocation.context.grievance?.step).toBe("datetime");
  });

  it("a detailed incident submitted at description step is not mistaken for a category", () => {
    const first = respond("Report a problem", existingJourney);
    const op = respond("Metro", first.context);
    const place = respond("Guindy", op.context);
    const category = respond("lift", place.context);
    const desc = respond("lift is stuck", category.context);
    expect(desc.context.grievance?.step).toBe("datetime");
    expect(desc.context.grievance?.data.description).toBe("lift is stuck");
  });

  it("does not misfile a location-only answer as the complaint category", () => {
    const started = respond("Report a problem", existingJourney);
    const operator = respond("Metro", started.context);
    const place = respond("Guindy", operator.context);
    const wrong = respond("Tambaram", place.context);
    expect(wrong.context.grievance?.step).toBe("category");
    expect(wrong.context.grievance?.data.location).toContain("Tambaram");
    expect(wrong.context.grievance?.data.category).toBeUndefined();
  });

  it("does not misfile time supplied early as a location", () => {
    const started = respond("Report a problem", existingJourney);
    const op = respond("Metro", started.context);
    const early = respond("Today morning", op.context);
    expect(early.context.grievance?.step).toBe("location");
    expect(early.context.grievance?.data.datetime).toBe("Today morning");
    expect(early.context.grievance?.data.location).toBeUndefined();
  });

  it("keeps the draft explicit, never auto-submits a government grievance", () => {
    const started = respond("Report a problem", existingJourney);
    const operator = respond("Metro", started.context);
    const location = respond("Guindy", operator.context);
    const cat = respond("lift", location.context);
    const details = respond("The lift stopped between floors", cat.context);
    const finished = respond("Not sure", details.context);
    expect(finished.cards).toHaveLength(1);
    expect(finished.cards[0]?.kind).toBe("grievance");
    expect(finished.reply).toMatch(/Nothing has been filed/i);
    expect(finished.context.grievance).toBeUndefined();
  });

  it("allows cancellation without erasing the journey", () => {
    const started = respond("Report a problem", existingJourney);
    const cancelled = respond("Cancel complaint", started.context);
    expect(cancelled.context.grievance).toBeUndefined();
    expect(cancelled.context.origin).toBe("Guindy");
    expect(cancelled.context.destination).toBe("Chennai Airport");
  });
});
