/**
 * Independent Chennai One external handoff.
 *
 * These are verified public landing/listing URLs, NOT undocumented booking
 * deep links or an official partner API. No private journey details are sent
 * to Chennai One until the traveller chooses to enter them there.
 */
import type { CanonicalItinerary } from "./engine";

export const CHENNAI_ONE_OFFICIAL = {
  website: "https://www.chennaione.in/",
  android: "https://play.google.com/store/apps/details?id=in.mobility.cumta",
  ios: "https://apps.apple.com/in/app/chennai-one/id6741205665",
} as const;

export function chennaiOneJourneySummary(itinerary: CanonicalItinerary): string {
  const parts = [
    "NammaTransit AI — reference for booking in the official Chennai One app",
    "From: " + itinerary.origin,
    "To: " + itinerary.destination,
    "Selected option: " + itinerary.routeName,
    "Travel modes: " + itinerary.modesInvolved.join(" + "),
    "Approximate journey duration: " + itinerary.totalDurationMinutes + " minutes",
    "Journey legs:",
    ...itinerary.legs.map((leg, index) =>
      String(index + 1) + ". " + leg.mode + " — " + leg.routeName +
      " (" + leg.from + " to " + leg.to + ")"),
    "",
    "This is NOT a ticket or a reservation. In Chennai One, search for the journey,",
    "reconfirm route, fares, accessibility and current availability, then book there.",
    "NammaTransit AI is an independent hackathon prototype, not an official CUMTA app.",
  ];
  return parts.join("\n");
}
