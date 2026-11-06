import { describe, expect, it, vi } from "vitest";
import { detectPriorityConversationIntent } from "./conversation-intent";
import { requestTransitResponse } from "./chat-client";
import { normalizeCommuterMessage } from "./intent-recovery";
import { respond, type Context } from "./engine";
import { respondFromFullGtfs } from "./full-gtfs-chat";

const original: Context = {
  origin: "Guindy", destination: "Chennai Airport",
  passengers: 2, wheelchairRequired: true, concessionType: "senior",
  concessionPassengers: 1,
};

describe("High-priority intent dispatch, not GTFS route search", () => {
  const updates = [
    "Show service updates",
    "Show service update",
    "Any service alerts?",
    "Any rain delay on OMR right now?",
    "Metro service status",
    "Status of MTC bus 570",
    "Are there disruptions?",
    "Any train cancellations?",
    "Show breakdowns",
  ];
  for (const text of updates) {
    it("renders a labelled simulated disruption card for " + text, async () => {
      const send = vi.fn(async () => { throw new Error("backend unavailable"); });
      const r = await requestTransitResponse(text, original, send);
      expect(send).not.toHaveBeenCalled();
      expect(r.transport).toBe("local");
      expect(r.reply.cards.map((card) => card.kind)).toContain("alerts");
      expect(r.reply.cards.some((card) => card.kind === "route_options")).toBe(false);
      expect(r.reply.reply.toLowerCase()).toMatch(/simulat|demonstration/);
      expect(r.reply.context.origin).toBe("Guindy");
      expect(r.reply.context.destination).toBe("Chennai Airport");
      expect(r.reply.context.passengers).toBe(2);
      expect(r.reply.context.wheelchairRequired).toBe(true);
      expect(await respondFromFullGtfs(text, original)).toBeNull();
    });
  }

  const routeQueries = [
    "Guindy to Chennai Airport",
    "Show all options",
    "Show mixed routes",
    "Is there a bus route?",
    "Metro to Chennai Airport",
    "Which routes are available?",
    "Route 70A",
  ];
  for (const text of routeQueries) {
    it("does not classify an actual route search as a service incident: " + text, () => {
      expect(detectPriorityConversationIntent(text)).toBeNull();
    });
  }

  it("keeps current-road-traffic intent distinct from service alerts", () => {
    expect(detectPriorityConversationIntent("Compare current road traffic")).toBeNull();
    expect(detectPriorityConversationIntent("Any traffic congestion on OMR?")).toBeNull();
  });

  it("doesn't convert an accessibility question into a filed grievance", async () => {
    const input = "Is the Guindy Metro lift working?";
    expect(detectPriorityConversationIntent(input)).toBe("accessibility");
    expect(normalizeCommuterMessage(input)).toBe(input);
    const result = await requestTransitResponse(input, original, vi.fn());
    expect(result.reply.context.grievance).toBeUndefined();
  });

  it("recognises common one-message incident reports without inventing submissions", async () => {
    for (const input of [
      "Guindy Metro North Gate lift isn't working",
      "Guindy Metro North Gate lift is stuck",
      "MTC bus 570 skipped the stop",
      "Report bus 570 skipped the stop",
    ]) {
      const result = await requestTransitResponse(input, original, vi.fn());
      expect(result.reply.context.origin).toBe("Guindy");
      expect(result.reply.context.destination).toBe("Chennai Airport");
      expect(result.reply.context.grievance).toBeDefined();
      expect(result.reply.cards.some((card) => card.kind === "grievance")).toBe(false);
    }
  });

  it("the alert suggestion after a completed complaint does not restart the journey", async () => {
    const first = respond("Report a problem: Guindy Metro North Gate lift is not working!", original);
    const done = respond("Today morning", first.context);
    expect(done.cards[0]?.kind).toBe("grievance");
    const status = await requestTransitResponse("Show service updates", done.context,
      vi.fn(async () => { throw new Error("server unavailable"); }));
    expect(status.reply.cards.map((x) => x.kind)).toContain("alerts");
    expect(status.reply.context.destination).toBe("Chennai Airport");
    expect(status.reply.context.grievance).toBeUndefined();
  });

  it("keeps complaint follow-ups higher priority than alert and routing intents", async () => {
    const first = respond("Report a problem", original);
    expect(first.context.grievance?.step).toBe("operator");
    const mode = await requestTransitResponse("Metro", first.context, vi.fn());
    expect(mode.reply.context.grievance?.step).toBe("location");
    expect(mode.reply.cards.some((card) => card.kind === "route_options")).toBe(false);
  });
});
