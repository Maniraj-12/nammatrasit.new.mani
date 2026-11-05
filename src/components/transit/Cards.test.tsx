import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalItinerary } from "@/lib/transit/engine";
import { RouteOptionsCard } from "./Cards";

const make = (
  id: string,
  mode: CanonicalItinerary["mode"],
  index: number,
  fare: number,
): CanonicalItinerary =>
  ({
    id,
    optionIndex: index,
    origin: "Koyambedu",
    destination: "Chennai Airport",
    routeName: id === "metro" ? "Green + Blue Metro" : "MTC Bus 70 + Metro Blue",
    mode,
    modesInvolved: mode === "Mixed" ? ["Bus", "Metro"] : ["Metro"],
    legs: [
      {
        mode: mode === "Mixed" ? "Bus" : "Metro",
        routeId: id,
        routeName: id === "metro" ? "Green Line" : "MTC 70",
        from: "Koyambedu",
        to: "Chennai Airport",
        direction: "Chennai Airport",
        stops: ["Koyambedu", "Chennai Airport"],
        durationMinutes: 15,
        distanceKm: 12,
        frequencyMinutes: 12,
      },
    ],
    totalStops: 1,
    totalDistanceKm: 12,
    inVehicleMinutes: 15,
    waitingMinutes: 8,
    walkingMinutes: 4,
    transferMinutes: 0,
    totalDurationMinutes: 27,
    transferCount: 0,
    transferPoints: [],
    fare: {
      components: [],
      totalFare: fare,
      fareDataStatus: "estimated",
      fareSource: "Test only",
      lastVerificationDate: "",
    },
    timingLabel: "Static estimates only",
    isFastest: index === 1,
  }) as CanonicalItinerary;

const options = [make("metro", "Metro", 1, 40), make("mixed", "Mixed", 2, 55)];

describe("Route alternatives card", () => {
  it("renders the gallery and updates details without creating a new message", () => {
    const onSelectOption = vi.fn();
    render(
      <RouteOptionsCard
        options={options}
        origin="Koyambedu"
        destination="Chennai Airport"
        activeItineraryId="metro"
        onSelectOption={onSelectOption}
      />,
    );
    expect(screen.getByText("Route Alternatives (2)")).toBeTruthy();
    const next = screen.getByRole("button", {
      name: "Select option 2: MTC Bus 70 + Metro Blue",
    });
    expect(next.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(next);
    expect(next.getAttribute("aria-pressed")).toBe("true");
    expect(onSelectOption).toHaveBeenCalledWith(options[1]);
    expect(screen.getByText(/Currently selected journey/)).toBeTruthy();
  });

  it("filters Mixed independently and toggles details", () => {
    render(
      <RouteOptionsCard
        options={options}
        origin="Koyambedu"
        destination="Chennai Airport"
        activeItineraryId="metro"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Mixed 1/i }));
    expect(screen.getByRole("button", { name: /Select option 2:/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Select option 1:/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Hide Details" }));
    expect(screen.queryByLabelText("Selected itinerary details")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show Details" }));
    expect(screen.getByLabelText("Selected itinerary details")).toBeTruthy();
  });
});
