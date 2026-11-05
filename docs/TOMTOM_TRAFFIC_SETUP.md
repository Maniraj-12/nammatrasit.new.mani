# NammaTransit AI: current road traffic via TomTom (without Google Cloud billing)

This is an **optional** congestion-adjustment feature, not MTC bus GPS
or a guaranteed arrival prediction.

## 1. Free TomTom account

Visit https://my.tomtom.com/ and register. This is the CURRENT account
management portal as of November 2026 (the old Developer Portal was
discontinued on 15 September 2026).

Navigate to **API & SDK Keys** and locate **My first API key**. Enable the
**Routing API** permission if the account requires product access selection.

TomTom pricing lists 20,000 free Routing API calls/month and says no
credit card is required. Limits and terms can change:
https://docs.tomtom.com/pricing

TomTom documents India as a supported real-time-traffic routing market:
https://docs.tomtom.com/routing-api/documentation/tomtom-orbis-maps/v3/product-information/market-coverage

Countrywide coverage does not prove that every Chennai road has current
data. Test Koyambedu / Guindy route cases with your own account.

## 2. Test BEFORE linking website

Use TomTom Routing API Orbis v3:
https://docs.tomtom.com/routing-api/documentation/tomtom-orbis-maps/v3/calculate-route

Endpoint: POST https://api.tomtom.com/maps/orbis/routing/routes/calculate?apiVersion=3

Required headers:
- Content-Type: application/json
- TomTom-Api-Key: your PRIVATE API key
- Attributes: routes.summary

Example payload (approximate Chennai points; not official MTC stop IDs):

```json
{
  "routePlanningLocations": {
    "origin": { "type": "Point", "coordinates": [80.195, 13.075] },
    "destination": { "type": "Point", "coordinates": [80.220, 13.006] }
  },
  "routeType": "fast",
  "travelMode": "car",
  "traffic": "live"
}
```

A successful response should contain
`routes[0].summary.travelDurationInSeconds`.
If no route or 401/403/429 error occurs, check your key, account status,
product permission, usage quota and coordinates. No test values are
supplied or claimed by this project.

## 3. Deploy a server that can securely call TomTom

Pull Request #12 builds this into the existing TanStack Start app.

Keep keys in **hosting environment secrets** (do not commit keys to GitHub
and do not use VITE_ for the routing API key):

```env
TOMTOM_API_KEY=<PRIVATE_KEY_FROM_MY_TOMTOM>
TOMTOM_TRAFFIC_ENABLED=true
```

Default is disabled. You can merge the code without giving it a key.
The old Google Cloud Routes feature is not used by the TomTom UI; keep
TRAFFIC_API_ENABLED=false and leave Google credentials empty.

The application server must be able to execute TanStack Start API routes.
The Google AI Studio app preview may not execute them. If so, deploy the
GitHub app to a capable host and set environment secrets there.

The endpoint for your own frontend is:
POST /api/tomtom-traffic

Only your backend calls TomTom; never access the remote API from client
React code with the private key.

## 4. How it updates NammaTransit AI

Open a journey such as "Koyambedu to Guindy", then:

1. Select any route alternative and open "Compare current road traffic".
2. Click "Check current road traffic".
3. The server sends two TomTom Orbis Routing v3 queries per MTC bus leg
   using its recorded GTFS stop coordinates in route order:
   - traffic: "historical" (typical roads)
   - traffic: "live" (current roads)
4. It computes:
   adjusted door-to-door estimate =
     original static GTFS estimate
     + (TomTom live road duration - TomTom historical road duration)
5. Metro and suburban rail travel times are NOT adjusted for road traffic.
6. "Fastest traffic-aware estimate" appears only if all compared bus legs
   have valid responses. Missing data => "Traffic unavailable".
7. The existing Leaflet map is unchanged and **does not show live TomTom
   congestion flow or TomTom road geometry**. Future map overlay requires
   product permission, licensing review, and separately accounted map/traffic
   tile API usage.

### Accuracy caveats

TomTom Orbis routing v3 offers car or taxi routing modes; it does not
produce verified MTC-specific bus road restrictions, boarding waits,
service headways or bus position. The route might differ from MTC's
actual service road. This is a *traffic-adjusted estimate*, not a live
bus arrival prediction or an MTC-guaranteed journey time.

Current static GTFS timetable/stop pattern limitations still apply.
The two TomTom calls can use slightly different road alignments; the
adapter rejects estimates with wildly mismatched distance.

## 5. Free-tier safeguards

- Maximum 6 GTFS alternatives in a comparison.
- Maximum 5 MTC legs across alternatives => up to 10 TomTom API requests.
- Conservative Chennai coordinate and stop-count validation.
- 60-second server-side response cache for repeated route checks.
- Per-process demo rate limits; not suitable as your only public-abuse
  protection on multi-instance deployments.
- Default off unless explicitly enabled.

Use MyTomTom Analytics to monitor free monthly request usage.
For a publicly accessible prototype, add authenticated API access
and a distributed limiter before making traffic lookup publicly available.

## 6. Troubleshooting

- "TomTom key not configured": set TOMTOM_API_KEY, enable
  TOMTOM_TRAFFIC_ENABLED=true and restart/redeploy server.
- "Backend unavailable": use a host that executes server route handlers;
  AI Studio preview may not support full backend execution.
- "Route insufficient coordinates": use a GTFS itinerary with actual
  source stops, not a curated fallback route without geographical data.
- "Traffic comparison incomplete": not all MTC legs returned usable data.
- "Road durations differ greatly": may be because the road paths are
  unsuitable; don't make a fastest claim.

Reference: TomTom latest Routing API v3 documentation, not the older
/v1/calculateRoute endpoint.
