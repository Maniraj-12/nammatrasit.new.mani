import { describe, expect, it, vi } from "vitest";
import { respond, normalizeComplaintCategory, type Context } from "./engine";
import { requestTransitResponse } from "./chat-client";
import { respondFromFullGtfs } from "./full-gtfs-chat";
import { isServiceUpdateRequest } from "./conversation-intents";

const journey: Context = {
  origin: "Guindy",
  destination: "Chennai Airport",
  passengers: 2,
  concessionType: "senior",
  wheelchairRequired: true,
};

describe("Explicit service-update requests never become journey results", () => {
  const queries = [
    "Show service updates",
    "Show service update",
    "Show me service updates",
    "Any service alerts?",
    "Check current service status",
    "Current service disruptions",
    "Latest service notices",
    "Show Metro service alerts",
    "Are there any delays?",
    "Is the metro delayed?",
    "Is the train service cancelled?",
    "Status of my metro",
    "Check alerts for my bus",
    "Service updates for Guindy",
    "SHOW SERVICE UPDATES!",
    "Are there any disruptions on my route?",
  ];
  it.each(queries)("routes '%s' to service alerts (not GTFS options)", async (msg) => {
    expect(isServiceUpdateRequest(msg)).toBe(true);
    const send = vi.fn(async () => { throw new Error("AI Studio server disabled"); });
    const answer = await requestTransitResponse(msg, journey, send);
    expect(send).not.toHaveBeenCalled();
    expect(answer.reply.intent).toBe("service_alerts");
    expect(answer.reply.cards).toHaveLength(1);
    expect(answer.reply.cards[0]?.kind).toBe("alerts");
    expect(answer.reply.cards.some((c) => c.kind === "route_options")).toBe(false);
    expect(answer.reply.reply).toMatch(/simulated/i);
    expect(answer.reply.context.origin).toBe("Guindy");
    expect(answer.reply.context.destination).toBe("Chennai Airport");
    expect(answer.reply.context.passengers).toBe(2);
    expect(await respondFromFullGtfs(msg, journey)).toBeNull();
  });

  it.each([
    "Guindy to Chennai Airport",
    "Show all routes",
    "Is there a bus route?",
    "Which is faster?",
    "Show mixed options",
    "Bus 70 fare",
    "Report a problem with the Metro lift",
    "Where is my bus?",
    "Book 2 tickets",
    "Show service route 70",
  ])("does not misclassify '%s' as a service-update request", (msg) => {
    expect(isServiceUpdateRequest(msg)).toBe(false);
  });

  it("handles service updates during an unfinished complaint without replacing its pending answer", async () => {
    const started = respond("Report a problem", journey);
    const afterOperator = respond("Metro", started.context);
    const send = vi.fn(async () => { throw new Error("No server"); });
    const alerts = await requestTransitResponse("Show service updates", afterOperator.context, send);
    expect(alerts.reply.cards[0]?.kind).toBe("alerts");
    expect(alerts.reply.context.grievance).toEqual(afterOperator.context.grievance);
    expect(alerts.reply.context.origin).toBe("Guindy");
    expect(send).not.toHaveBeenCalled();
    const resume = await requestTransitResponse("Resume complaint", alerts.reply.context, send);
    expect(resume.reply.context.grievance?.step).toBe("location");
    expect(resume.reply.reply).toMatch(/which station/i);
    expect(resume.reply.cards).toEqual([]);
  });
});

describe("Natural grievance slot values", () => {
  const categoryCases: Array<[string,string]> = [
    ["lift", "Lift / escalator"],
    ["Lift", "Lift / escalator"],
    ["Lift / escalator", "Lift / escalator"],
    ["escalator", "Lift / escalator"],
    ["elevator", "Lift / escalator"],
    ["lifts not working", "Lift / escalator"],
    ["dirty", "Cleanliness"],
    ["unclean station", "Cleanliness"],
    ["cleanliness", "Cleanliness"],
    ["hygiene", "Cleanliness"],
    ["overcrowded", "Overcrowding"],
    ["crowding", "Overcrowding"],
    ["staff", "Staff behaviour"],
    ["rude driver", "Staff behaviour"],
    ["driver misbehaved", "Staff behaviour"],
    ["ticket", "Ticketing"],
    ["refund issue", "Ticketing"],
    ["payment failed", "Ticketing"],
    ["bus breakdown", "Vehicle breakdown"],
    ["bus skipped stop", "Bus skipped stop"],
    ["other", "Other"],
  ];
  it.each(categoryCases)("normalises short category '%s' into '%s'", (message, expected) => {
    expect(normalizeComplaintCategory(message)).toBe(expected);
  });

  it.each(["place", "here", "location", "problem", "not sure", ""])(
    "does not pretend '%s' is a complaint category",
    (message) => {
      expect(normalizeComplaintCategory(message)).toBeUndefined();
    },
  );

  it.each(["lift", "escalator", "cleanliness", "dirty", "crowding", "staff", "ticket", "other"])(
    "accepts '%s' when answering complaint's category question",
    async (value) => {
      const server = vi.fn(async () => { throw new Error("server disabled"); });
      let ctx = respond("Report a problem", journey).context;
      ctx = (await requestTransitResponse("Metro", ctx, server)).reply.context;
      ctx = (await requestTransitResponse("Guindy Metro", ctx, server)).reply.context;
      expect(ctx.grievance?.step).toBe("category");
      const chosen = await requestTransitResponse(value, ctx, server);
      expect(chosen.reply.context.grievance?.step).toBe("description");
      expect(chosen.reply.context.grievance?.data.category).toBeDefined();
      expect(chosen.reply.reply).toMatch(/describe what happened/i);
      expect(chosen.reply.cards).toEqual([]);
      expect(chosen.reply.context.origin).toBe("Guindy");
      expect(chosen.reply.context.destination).toBe("Chennai Airport");
      expect(chosen.reply.context.passengers).toBe(2);
      expect(server).not.toHaveBeenCalled();
    },
  );

  it("does not treat an unspecific 'place' as a station name", () => {
    const first = respond("Report a problem", journey);
    const second = respond("Metro", first.context);
    const invalid = respond("place", second.context);
    expect(invalid.context.grievance?.step).toBe("location");
    expect(invalid.context.grievance?.data.location).toBeUndefined();
    expect(invalid.reply).toMatch(/actual station/i);
    const valid = respond("place: Guindy Metro North Gate", invalid.context);
    expect(valid.context.grievance?.step).toBe("category");
    expect(valid.context.grievance?.data.location).toMatch(/Guindy/);
  });

  it("retains 'lift' if category is mentioned before the location", () => {
    let ctx = respond("Report a problem", journey).context;
    ctx = respond("Metro", ctx).context;
    const earlyCategory = respond("lift", ctx);
    expect(earlyCategory.context.grievance?.data.category).toBe("Lift / escalator");
    expect(earlyCategory.context.grievance?.step).toBe("location");
    expect(earlyCategory.reply).toMatch(/which station/i);
    const afterLocation = respond("Guindy", earlyCategory.context);
    expect(afterLocation.context.grievance?.step).toBe("description");
  });

  it("requires a meaningful incident description rather than accepting a bare 'lift' twice", () => {
    let ctx = respond("Report a problem", journey).context;
    ctx = respond("Metro", ctx).context;
    ctx = respond("Guindy Metro North Gate", ctx).context;
    ctx = respond("lift", ctx).context;
    expect(ctx.grievance?.step).toBe("description");
    const short = respond("lift", ctx);
    expect(short.context.grievance?.step).toBe("description");
    expect(short.reply).toMatch(/briefly describe/i);
    const enough = respond("North Gate lift is stuck", short.context);
    expect(enough.context.grievance?.step).toBe("datetime");
  });

  it("supports an entire complaint in one message and never claims submission", () => {
    const r = respond("Report a problem: Guindy Metro North Gate lift is stuck today morning", journey);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0]?.kind).toBe("grievance");
    expect(r.reply).toMatch(/nothing has been filed/i);
    expect(r.context.grievance).toBeUndefined();
    expect(r.context.origin).toBe("Guindy");
    expect(r.context.destination).toBe("Chennai Airport");
  });

  it("keeps complaint and route intact if a service question interrupts the form", () => {
    let ctx = respond("Report a problem", journey).context;
    ctx = respond("MTC Bus", ctx).context;
    ctx = respond("MTC Route 70", ctx).context;
    const interruption = respond("Show service updates", ctx);
    expect(interruption.cards[0]?.kind).toBe("alerts");
    expect(interruption.context.grievance?.step).toBe("category");
    const cat = respond("lift", interruption.context);
    expect(cat.context.grievance?.data.category).toBe("Lift / escalator");
    expect(cat.context.grievance?.step).toBe("description");
    const cancelled = respond("Cancel complaint", cat.context);
    expect(cancelled.context.grievance).toBeUndefined();
    expect(cancelled.context.origin).toBe("Guindy");
    expect(cancelled.context.destination).toBe("Chennai Airport");
  });
});
