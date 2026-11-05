# Realtime transport adapter readiness (NammaTransit AI)

**Current status: no authorised, tested live provider is connected.**
This implementation adds a *safe, disabled-by-default* realtime interface.
It does not access Chennai One, MTC, CMRL, CRIS or NTES private endpoints and
does not make up vehicle positions, predictions or operator timings.

## What was added

- `src/lib/transit/realtime/types.ts`: unified status, vehicle, arrival and alert types
- `src/lib/transit/realtime/contract.ts`: query validation, permissions and 90s freshness checks
- `src/lib/transit/realtime/provider.ts`: explicit server-side provider registry; defaults to no providers
- `src/routes/api/realtime.ts`: read-only GET /api/realtime using the documented TanStack Start server-route syntax
- `src/lib/transit/realtime/selection.ts`: convert exact GTFS route/boarding stop IDs and direction from the selected leg
- `src/components/transit/LiveArrivalStatus.tsx`: opt-in status button under the route map; no automatic background requests
- Automated tests with **synthetic** fixtures, never presented as live Chennai data

When deployed on a server that supports TanStack Start server routes,
a diagnostic call with a valid route+stop identifier looks like:

```http
GET /api/realtime?mode=BUS&routeId=MTC-70A&stopIds=MTC-STOP-001&directionId=0
```

This example uses PLACEHOLDER IDs for illustration. Pass actual IDs from
the imported GTFS journey legs instead.

With no authorised adapter installed, the endpoint returns:

```json
{
  "status": "UNAVAILABLE",
  "mode": "BUS",
  "routeId": "MTC-70A",
  "boardingStopIds": ["MTC-STOP-001"],
  "vehicles": [],
  "arrivals": [],
  "alerts": [],
  "source": { "authorization": "NONE", "reason": "No authorised realtime feed has been configured for this operator." }
}
```

The real JSON includes the additional nullable fields defined in `types.ts`.
Invalid cross-mode route/stop IDs and missing required values return HTTP 400.
The server handler sets `Cache-Control: no-store`.

## Before enabling a provider

1. Obtain written authorisation from CUMTA, MTC, CMRL or Southern Railway/CRIS,
   or from the operator's authorised data vendor. Passenger-facing map access
   **does not grant third-party API permission**.
2. Receive documented, approved API/feed URLs, auth headers, sample payloads,
   licence, allowed uses, refresh intervals and rate limits.
3. Store credentials in the hosting provider's **server-side secrets only**.
   Never publish credentials in GitHub, AI Studio frontend bundles or
   `VITE_*` environment variables.
4. Build and validate a provider adapter **server-side**. Map authorised
   provider route/trip/stop IDs to the actual ChennaiGTFS IDs.
5. Plug the implemented adapter into `configuredRealtimeAdapters()` in
   `provider.ts` only after access is approved and tests pass.
6. Test live route/direction/station ID matching with the official source,
   along with stale timestamps, privacy, request throttling, provider errors,
   changing trips, diversions and cancellations.
7. Extend the map to show LIVE vehicle markers only for fresh, authorised
   provider observations; show stop-specific ETA only from TripUpdates or
   equivalent officially predicted arrivals.
8. Run CI and preview tests. If the AI Studio preview cannot execute
   TanStack Start server routes, use a hosting environment supporting them.

## Recommended interoperability

Use the standard GTFS-Realtime data structures:
- VehiclePositions — actual GPS positions with vehicle-specific timestamps
- TripUpdates / StopTimeUpdates — predicted stop arrival/departure times
- ServiceAlerts — cancellations, diversions, incidents

Specifications:
https://gtfs.org/documentation/realtime/reference/
https://gtfs.org/documentation/realtime/realtime-best-practices/

Per GTFS-Realtime guidance, vehicle observations and predictions older than
90 seconds should not be represented as live.

## Safety guarantees

- The permission gate has **no provider activated by default**.
- Missing provider credentials do not trigger calls to an invented endpoint.
- Wrong-route, wrong-direction and unrelated-stop predictions are filtered.
- Observations with invalid timestamps or implausible future times are rejected.
- Static GTFS durations and unofficial estimates are never labelled LIVE.
- Errors do not leak provider URLs, API keys or exception contents to the browser.
- User selects the transit leg; the app does not poll unknown operators.

## Request access

Ask CUMTA/Chennai One first for authorised MTC vehicle GPS and stop ETA.
Ask CMRL for Metro station arrivals and Southern Railway/CRIS for suburban
train arrivals. Request a short-lived, read-only hackathon licence or
sandbox, published ID mapping and permitted polling rate.

The Perplexity research report provided to the project did not provide a
verified accessible authorised API; this is therefore only Phase 1 of a
realtime integration, not working live-tracking coverage.
