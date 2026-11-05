# Traffic-aware Chennai journey comparisons

## What it does

A commuter opens a journey's **Compare current road traffic** tab. That
tab deliberately replaces the Leaflet/OpenStreetMap map with a separate
**Google Maps** traffic view. This is required because Google Routes API
content cannot be used in conjunction with a non-Google map:

https://cloud.google.com/maps-platform/terms/maps-service-terms

The optional Google Maps JavaScript TrafficLayer shows present road
congestion. A server-side Google Routes API call (TRAFFIC_AWARE/DRIVE)
compares the road journey's `duration` to `staticDuration` for each
MTC bus leg, routing through the recorded GTFS stops.

The adjusted journey time is:

```
traffic-adjusted door-to-door estimate
  = current static GTFS journey estimate
  + (Google road time with traffic - Google road time without live traffic)
```

Bus walking, assumed waiting/headways, transfer time and dwell assumptions
are NOT converted to driving time. Metro/suburban durations remain
static GTFS estimates; this feature does not detect actual train delays.

A traffic-aware **fastest** badge is displayed only if every offered MTC
leg has a successful traffic check. When any cannot be checked,
the UI says **comparison incomplete** and does not claim a live winner.

`routes.polyline.encodedPolyline` from Google is rendered **only on the
Google map**; never place this geometry or Google traffic results onto the
existing Leaflet/OpenStreetMap map.

## How to activate

1. Create your own Google Cloud project and **enable billing**.
2. Enable **Routes API** and **Maps JavaScript API** in that project.
3. Set a conservative **daily quota** and a billing budget/alert before
   any testing. The traffic-aware Routes API requests use the **Pro**
   billed tier; each request is billable and long GTFS bus journeys may
   require multiple Google calls.
4. Create TWO independent credentials:
   - **Server credential:** restrict its API scope to Routes API, keep it
     in the hosting provider's server-side environment/secrets, and
     restrict it appropriately for your hosted deployment.
   - **Browser credential:** restrict by authorised website referrers and
     to **Maps JavaScript API only**. A browser key is visible by design.
5. Configure server-side environment:
   ```bash
   GOOGLE_MAPS_ROUTES_API_KEY=YOUR_PRIVATE_SERVER_KEY
   TRAFFIC_API_ENABLED=true
   TRAFFIC_API_BILLING_ACKNOWLEDGED=true
   ```
6. Configure the build-time browser environment:
   ```bash
   VITE_GOOGLE_MAPS_BROWSER_KEY=YOUR_REFERRER_RESTRICTED_BROWSER_KEY
   ```
7. Deploy the TanStack Start app to a host that executes server routes.
   Google AI Studio's UI preview may not execute server endpoints.
8. Open **Route Alternatives → Compare current road traffic** for a
   journey with a bus leg, then click **Calculate current traffic**.

Never commit real keys in `.env`, screenshots, issues, chat or GitHub.
Keys must be managed in the hosting provider's secure settings.

## Endpoint safety and production requirements

The feature is disabled by default, with two deliberate server flags and
the private key required before it makes billable calls.

`POST /api/traffic-compare` accepts a maximum of six alternatives and
at most 10 potential Google route calls per comparison. Coordinates are
validated against an extended Chennai-area bounding box. The server
uses a short in-process cache and a small in-process rate limiter.

**For a publicly accessible app, add authenticated access, a trusted
identity/IP-aware edge rate limiter (Google Cloud Armor, API Gateway
or an equivalent), and Cloud billing quotas.** The in-process limiter
does not provide reliable cost protection across multiple serverless
instances. It is an additional demo safeguard, not production security.
Keep TRAFFIC_API_ENABLED=false until that infrastructure is ready.

This service only compares routes *already found by the static GTFS
planner*; it does not generate arbitrary new MTC route alternatives and
cannot confirm that the particular bus is running on the road or schedule.
Road driving polylines approximated through each GTFS bus stop can differ
from official MTC lanes, stops, diversions or bus-only turns.

Live road traffic **is not live bus GPS**, nor a guaranteed arrival time.

## API and pricing references

- Routes API traffic levels:
  https://developers.google.com/maps/documentation/routes/config_trade_offs
- Routes API field masks and responses:
  https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
- Maps JavaScript TrafficLayer:
  https://developers.google.com/maps/documentation/javascript/trafficlayer
- Pricing and quotas:
  https://developers.google.com/maps/documentation/routes/usage-and-billing
- Maps Platform terms (non-Google map restriction):
  https://cloud.google.com/maps-platform/terms/maps-service-terms
