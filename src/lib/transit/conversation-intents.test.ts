import { describe, expect, it, vi } from "vitest";
import { isServiceUpdateRequest, isExplicitIncidentReport } from "./conversation-intents";
import { requestTransitResponse } from "./chat-client";
import { respond, type Context, type GrievanceDraft } from "./engine";
import { respondFromFullGtfs } from "./full-gtfs-chat";

const journey: Context = {
  origin: "Koyambedu",
  destination: "Guindy",
  passengers: 2,
  wheelchairRequired: true,
  concessionType: "senior",
  concessionPassengers: 1,
};

const serviceQueries = [
  "Show service updates", "Show service update", "show the service updates",
  "Service Updates", "show latest service updates", "Any service alerts?",
  "Are there any disruptions?", "Show disruptions", "show alerts",
  "check service status", "service status", "current bus alerts",
  "Show metro disruptions", "Show train alerts", "any delays?",
  "any rain delay on OMR right now?", "Is the Metro delayed?",
  "Show me updates", "transit alerts", "transport disruptions",
  "list all alerts", "show bus delays", "Show Service Updates!", "SHOW SERVICE UPDATES",
];

describe("Regression matrix: service intent MUST NOT turn into routes", () => {
  it.each(serviceQueries)("%s displays service-update cards with sticky journey context", async (phrase) => {
    expect(isServiceUpdateRequest(phrase)).toBe(true);
    const routeServer = vi.fn(async () => { throw Error("Should not route to server"); });
    const response = await requestTransitResponse(phrase, journey, routeServer);
    expect(routeServer).not.toHaveBeenCalled();
    expect(response.reply.intent).toBe("service_alerts");
    expect(response.reply.cards.some((card) => card.kind === "alerts")).toBe(true);
    expect(response.reply.cards.every((card) => card.kind !== "route_options")).toBe(true);
    expect(response.reply.reply).toMatch(/simulated/i);
    expect(response.reply.context.origin).toBe("Koyambedu");
    expect(response.reply.context.destination).toBe("Guindy");
    expect(response.reply.context.passengers).toBe(2);
  });

  it.each(serviceQueries)("FullGTFS defers service phrase %s to the correct intent", async (phrase) => {
    expect(await respondFromFullGtfs(phrase, journey)).toBeNull();
  });

  it.each([
    "Koyambedu to Guindy",
    "Show all options",
    "How much is the fare?",
    "How long does this journey take?",
    "Which is faster?",
    "Check traffic congestion",
    "Traffic delay on my bus route",
    "Plan another journey",
    "Select Option 2",
    "I want to report a problem",
    "Is there a bus route?",
    "Book 2 tickets",
  ])("does not misclassify unrelated intent %s", (phrase) => {
    expect(isServiceUpdateRequest(phrase)).toBe(false);
  });

  it("service updates during an active complaint do not fill complaint fields", async () => {
    const started = respond("Report a problem", journey);
    expect(started.context.grievance?.step).toBe("operator");
    const alerts = await requestTransitResponse("Show service updates", started.context, async () => {
      throw new Error("No external API expected");
    });
    expect(alerts.reply.cards[0]?.kind).toBe("alerts");
    expect(alerts.reply.context.grievance?.step).toBe("operator");
    const answer = await requestTransitResponse("Metro", alerts.reply.context, async () => {
      throw new Error("Do not make a new route search");
    });
    expect(answer.reply.context.grievance?.step).toBe("location");
    expect(answer.reply.context.origin).toBe("Koyambedu");
  });
});

function pending(step: keyof GrievanceDraft, fields: GrievanceDraft = {}): Context {
  return { ...journey, grievance: { step, data: fields } };
}
const metro = "CMRL (Chennai Metro)";
const locationContext: GrievanceDraft = { operator: metro };
const categoryContext: GrievanceDraft = { operator: metro, location: "Guindy" };
const descriptionContext: GrievanceDraft = {
  ...categoryContext, category: "Lift / escalator",
};
const timeContext: GrievanceDraft = {
  ...descriptionContext, description: "The lift stopped while boarding",
};

describe("Regression matrix: grievance accepts natural, short, and out-of-order replies", () => {
  it.each([
    ["lift", "Lift / escalator"],
    ["Lift / escalator", "Lift / escalator"],
    ["escalator", "Lift / escalator"],
    ["elevator", "Lift / escalator"],
    ["escalatr", "Lift / escalator"],
    ["staff", "Staff behaviour"],
    ["driver", "Staff behaviour"],
    ["cleanliness", "Cleanliness"],
    ["dirty", "Cleanliness"],
    ["overcrowding", "Overcrowding"],
    ["crowded", "Overcrowding"],
    ["ticket", "Ticketing"],
    ["refund", "Ticketing"],
    ["breakdown", "Vehicle breakdown"],
    ["Bus skipped stop", "Bus skipped stop"],
    ["delayed", "Service delay"],
    ["other", "Other"],
  ])("category '%s' normalises to %s and asks for description", (input, expected) => {
    const r = respond(input, pending("category", categoryContext));
    expect(r.context.grievance?.data.category).toBe(expected);
    expect(r.context.grievance?.step).toBe("description");
    expect(r.context.origin).toBe("Koyambedu");
    expect(r.context.destination).toBe("Guindy");
    expect(r.context.passengers).toBe(2);
    expect(r.cards).toEqual([]);
  });

  it.each([
    "Guindy", "Tambaram", "Chennai Central", "Saidapet station",
    "At Guindy Metro North Gate", "Route 70", "Bus Stand near T Nagar",
  ])("accepts freely typed incident place %s", (place) => {
    const r = respond(place, pending("location", locationContext));
    expect(r.context.grievance?.data.location).toBeTruthy();
    expect(r.context.grievance?.step).toBe("category");
    expect(r.context.origin).toBe("Koyambedu");
    expect(r.context.destination).toBe("Guindy");
  });

  it.each(["lift", "escalator", "Lift / escalator", "cleanliness", "staff", "overcrowding"])(
    "when asked for location, '%s' is saved as issue, NOT invented as place", (input) => {
      const r = respond(input, pending("location", locationContext));
      expect(r.context.grievance?.step).toBe("location");
      expect(r.context.grievance?.data.category).toBeTruthy();
      expect(r.context.grievance?.data.location).toBeUndefined();
      expect(r.reply).toMatch(/station|stop|route/i);
    },
  );

  it("when user provides location after category, next question skips known category", () => {
    const a = respond("lift", pending("location", locationContext));
    const b = respond("Guindy", a.context);
    expect(b.context.grievance?.data.location).toBe("Guindy");
    expect(b.context.grievance?.data.category).toBe("Lift / escalator");
    expect(b.context.grievance?.step).toBe("description");
  });

  it("can take an issue and a specific place before operator", () => {
    const a = respond("Report a problem", journey);
    const b = respond("Guindy lift not working", a.context);
    expect(b.context.grievance?.data.location).toContain("Guindy");
    expect(b.context.grievance?.data.category).toBe("Lift / escalator");
    expect(b.context.grievance?.step).toBe("operator");
    const c = respond("Metro", b.context);
    expect(c.context.grievance?.step).toBe("datetime");
    expect(c.context.origin).toBe("Koyambedu");
  });

  it.each(["Today morning", "Yesterday evening", "Yesterday 6 PM", "Just now", "Not sure", "06-11-2026 08:20", "2026-11-06"])(
    "accepts actual time wording %s", (time) => {
      const result = respond(time, pending("datetime", timeContext));
      expect(result.context.grievance).toBeUndefined();
      expect(result.cards[0]?.kind).toBe("grievance");
      if (result.cards[0]?.kind === "grievance") {
        expect(result.cards[0].draft.datetime).toBe(time);
      }
    },
  );

  it.each(["Metro", "lift", "Guindy", "Route 70", "Tomorrow", "show route options"])(
    "does not record '%s' as an incident time", (input) => {
      const r = respond(input, pending("datetime", timeContext));
      expect(r.context.grievance?.step).toBe("datetime");
      expect(r.context.grievance?.data.datetime).toBeUndefined();
      expect(r.cards).toEqual([]);
    },
  );

  it.each(["lift", "escalator", "problem", "none", "Not sure"])(
    "does not mistake '%s' for a complete description", (input) => {
      const r = respond(input, pending("description", descriptionContext));
      expect(r.context.grievance?.step).toBe("description");
      expect(r.context.grievance?.data.description).toBeUndefined();
    },
  );

  it.each([
    "The lift stopped between floors", "Lift is stuck",
    "Escalator is not working", "Bus did not stop",
    "Driver refused to stop at my stop",
  ])("accepts the natural incident description %s", (input) => {
    const r = respond(input, pending("description", descriptionContext));
    expect(r.context.grievance?.step).toBe("datetime");
    expect(r.context.grievance?.data.description).toBeTruthy();
  });

  it.each(["metro", "Metro", "CMRL", "MTC Bus", "Bus", "Suburban train", "train"])(
    "accepts natural operator response %s", (input) => {
      const r = respond(input, pending("operator"));
      expect(r.context.grievance?.data.operator).toBeTruthy();
      expect(r.context.grievance?.step).toBe("location");
    },
  );

  it("incident messages without the word 'report' begin an unsubmitted draft", async () => {
    expect(isExplicitIncidentReport("Guindy Metro North Gate lift is not working!")).toBe(true);
    expect(isExplicitIncidentReport("Bus 570 skipped the stop")).toBe(true);
    expect(isExplicitIncidentReport("Is the Metro lift working?")).toBe(false);
    expect(isExplicitIncidentReport("How long till my bus arrives?")).toBe(false);

    const r = await requestTransitResponse("Bus 570 skipped the stop", journey, async () => {
      throw new Error("No server needed for complaint");
    });
    expect(r.reply.context.grievance?.data.category).toBe("Bus skipped stop");
    expect(r.reply.context.grievance?.data.operator).toBe("MTC (Bus)");
    expect(r.reply.cards).toEqual([]);
  });

  it("original journey, wheelchair and concession remain after full complaint", () => {
    const r = respond("Today morning", pending("datetime", timeContext));
    expect(r.context).toMatchObject({
      origin: "Koyambedu", destination: "Guindy",
      passengers: 2, wheelchairRequired: true, concessionType: "senior",
    });
    expect(r.reply).toMatch(/not.*filed|nothing has been filed/i);
  });

  it("never turns 'Cancel complaint' into a new route", async () => {
    const start = respond("Report a problem", journey);
    const done = await requestTransitResponse("Cancel complaint", start.context, async () => {
      throw Error("Should not call the route server");
    });
    expect(done.reply.context.grievance).toBeUndefined();
    expect(done.reply.context.origin).toBe("Koyambedu");
    expect(done.reply.cards).toEqual([]);
  });
});
