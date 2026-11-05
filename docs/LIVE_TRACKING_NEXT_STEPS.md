# NammaTransit AI live tracking integration plan

The interactive map currently shows the **selected GTFS stop sequence**. It is
NOT a live vehicle map and does not claim real-time departure predictions.

## To activate actual live MTC/Metro/suburban ETA

Obtain an **authorised API / GTFS-Realtime feed** for each participating
operator, including terms granting third-party software access. In particular,
the Chennai One and MTC *passenger-facing* live tracking websites do NOT by
themselves authorise scraping or reusing private endpoints.

Preferred standard API sources:
- VehiclePositions: realtime vehicle ID, trip ID, route ID, coordinates and
  timestamp.
- TripUpdates / StopTimeUpdates: boarding stop, trip, estimated departure and
  arrival predictions.
- ServiceAlerts: cancellations, diversions and disruptions.

Implementation checklist:
1. Obtain operator/API-provider permission and private credentials.
2. Build a **server-side adapter** with API keys only in environment secrets,
   never in React source.
3. Map provider route and stop IDs to ChennaiGTFS IDs and validate selected
   itinerary trip direction, stop order and platform.
4. Convert to the normalised `LiveTransitSnapshot` contract in
   `src/lib/transit/route-map-data.ts`.
5. Require nonempty source and timestamp; treat data older than **90 seconds**
   as stale and remove vehicle markers and live ETA claims.
6. Calculate stop-specific arrival countdown from predicted StopTimeUpdates;
   don't derive an exact ETA from a vehicle's GPS position alone.
7. Show **LIVE** badges only for fresh authorised predictions, **SCHEDULED**
   only for applicable service dates/timetables, and **UNAVAILABLE** otherwise.
8. Test out-of-order updates, delayed feeds, missing vehicles, stop changes,
   permissions, rate limits, and network failures.
9. Do not broadcast operators' private vehicle feeds or passengers' locations
   outside the authorised usage terms.

Operator resources (passenger-facing):
- MTC official: https://mtcbus.tn.gov.in/
- CMRL official: https://chennaimetrorail.org/
- Chennai One via official CUMTA channels.

There is currently **no verified public developer endpoint** connected to
NammaTransit AI for all three modes. Until an authorised feed is provided,
never display simulated vehicle markers or live countdowns.
