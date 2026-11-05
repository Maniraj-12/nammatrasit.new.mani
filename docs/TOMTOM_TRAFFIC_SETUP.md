# Chennai traffic estimates using TomTom Routing API v1

**No Google Cloud Maps account or billing is needed.** This integration is
disabled by default. It requires an authorised MyTomTom Routing API key.
This is a **road congestion estimate, not live MTC vehicle arrival data**.

## 1. Register and verify free access

Visit https://my.tomtom.com/ and sign in. The current Evaluation key may
show Routing API among its products; this does not prove access to every
premium Orbis version. For this project use **TomTom Maps Routing API v1**.

Official documentation:
https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route

API Explorer:
https://docs.tomtom.com/routing-api/api-explorer

Your first actual test is the definitive check of whether your evaluation
key can use the v1 endpoint for Chennai. Do not purchase Premium solely
because Orbis v3 is locked.

## 2. Test the Chennai API in TomTom's API Explorer

Choose **TomTom Maps - v1**, then **GET Calculate Route**.

- versionNumber: `1`
- locations: `13.075,80.195:13.006,80.220`
- contentType: `json`
- traffic: `true`
- departAt: `now`
- routeType: `fastest`
- travelMode: `car`
- computeTravelTimeFor: `all`
- routeRepresentation: `summaryOnly`
- key: enter your MyTomTom API key privately into the Explorer

Direct request structure (do not share real keys):

```http
GET https://api.tomtom.com/routing/1/calculateRoute/13.075,80.195:13.006,80.220/json?traffic=true&departAt=now&travelMode=car&routeType=fastest&computeTravelTimeFor=all&routeRepresentation=summaryOnly&key=YOUR_KEY
```

Unlike Orbis v3 GeoJSON inputs, the v1 request URL uses **latitude,
longitude** coordinate order. These are approximate demo points near
Koyambedu and Guindy, not verified MTC stops.

A valid response contains (illustrative field names; not live values):

```json
{
  "routes": [{
    "summary": {
      "travelTimeInSeconds": 1200,
      "historicTrafficTravelTimeInSeconds": 900,
      "liveTrafficIncidentsTravelTimeInSeconds": 1200,
      "lengthInMeters": 5000
    }
  }]
}
```

Values here are an example only. If historical traffic is missing, this
implementation does not invent a current-traffic penalty. For actual
success, the Explorer must display a **real response HTTP 200 + JSON**
after Execute; a list of possible response status codes in documentation
does not confirm a request succeeded.

The adapter deliberately makes **one request per bus leg**, with
`traffic=true&computeTravelTimeFor=all`, to obtain both current
`travelTimeInSeconds` and `historicTrafficTravelTimeInSeconds` on
the same route. This is more economical and robust than two distinct
Orbis v3 routing requests.

## 3. Apply to NammaTransit AI

The changes are in GitHub Pull Request #12. Review, merge, and deploy
to a host supporting TanStack Start API endpoints. Google AI Studio's
preview may not execute full server routes.

Set these only in private hosting environment variables:

```env
TOMTOM_API_KEY=YOUR_PRIVATE_ROUTING_API_KEY
TOMTOM_TRAFFIC_ENABLED=true
```

**Do not** put this key in GitHub, client React code, VITE_* variables,
public screenshots, or exposed URLs in browser source code.

If a key is accidentally shared, rotate it in MyTomTom.

Existing Google Maps variables can remain unset or disabled:
`TRAFFIC_API_ENABLED=false`.

## 4. Traffic-aware fastest estimates

Open a journey such as "Koyambedu to Guindy", choose **Compare current
road traffic**, then click **Check current road traffic**.

For each MTC leg with known GTFS stops, the adapter requests the
traffic-aware road duration and typical historic road duration on one
route, then adjusts the existing journey duration:

```
adjusted ETA estimate =
  static GTFS journey estimate
  + (TomTom v1 current road duration - TomTom v1 historic road duration)
```

For a mixed journey, this adjustment applies to **MTC legs only**;
Metro/suburban times are static estimates. Walking, assumed bus waiting,
transfer time and stop dwell estimates remain unchanged.

Only call an itinerary "Fastest traffic-aware estimate" when all relevant
bus road requests succeed. A missing API result must show **unavailable**,
not a fictitious live ETA.

The existing Leaflet/OpenStreetMap map continues showing **static
geometry**, without overlaying TomTom live traffic content. A live
traffic-flow overlay requires a separate permitted product and review
of the relevant tile/map-service terms.

## 5. Usage and security

- The endpoint is disabled by default; it makes no TomTom calls without
  explicit server configuration.
- Maximum 6 alternatives and 10 TomTom v1 calls per comparison,
  validated against GTFS coordinates within the Chennai area.
- One-minute server cache, request limits and timeouts help with trial
  usage but are **not sufficient protection** against abuse when the
  application is publicly deployed.
- Monitor MyTomTom Analytics and confirm actual free-tier limits for the
  current Evaluation product. Do not assume Premium v3 access.
- Before allowing public traffic queries, add authenticated access,
  distributed rate limiting and request quotas.

## 6. Accuracy

TomTom supplies a road-driving route estimate, **not a tracked MTC bus**.
A vehicle's position, actual boarding time, route diversion, bus-only
access, stop dwell and service delays cannot be derived from a Google or
TomTom road ETA alone. The result remains an *estimate*, not a guarantee.

The provider v1 service documentation may recommend Orbis v3 for new
integrations; the project deliberately uses v1 because the user's
Evaluation key reports v3 as Premium and v1 still documents the features
needed for congestion-adjusted travel-time estimates.
