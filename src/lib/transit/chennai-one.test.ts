import { describe, expect, it } from "vitest";
import { CHENNAI_ONE_OFFICIAL, chennaiOneJourneySummary } from "./chennai-one";
import type { CanonicalItinerary } from "./engine";

const itinerary = {
  id: "selected-journey",
  origin: "Guindy",
  destination: "Chennai Airport",
  routeName: "Blue Line Metro",
  modesInvolved: ["Metro"],
  totalDurationMinutes: 30,
  legs: [{
    mode: "Metro", routeName: "Blue Line",
    from: "Guindy", to: "Chennai Airport",
  }],
} as CanonicalItinerary;

describe("Independent Chennai One booking handoff", () => {
  it("uses only verified public landing/listing URLs, no invented booking API links", () => {
    expect(CHENNAI_ONE_OFFICIAL.website).toBe("https://www.chennaione.in/");
    expect(CHENNAI_ONE_OFFICIAL.android).toContain("id=in.mobility.cumta");
    expect(CHENNAI_ONE_OFFICIAL.ios).toContain("id6741205665");
    for (const url of Object.values(CHENNAI_ONE_OFFICIAL)) {
      expect(new URL(url).protocol).toBe("https:");
      expect(url).not.toContain("origin=");
      expect(url).not.toContain("destination=");
      expect(url).not.toContain("token=");
    }
  });
  it("gives the traveller manually usable route details and clear non-booking language", () => {
    const summary = chennaiOneJourneySummary(itinerary);
    expect(summary).toContain("From: Guindy");
    expect(summary).toContain("To: Chennai Airport");
    expect(summary).toContain("Selected option: Blue Line Metro");
    expect(summary).toContain("1. Metro — Blue Line (Guindy to Chennai Airport)");
    expect(summary).toContain("NOT a ticket");
    expect(summary).toContain("reconfirm route");
  });
});
