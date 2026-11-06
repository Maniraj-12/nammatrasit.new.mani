# Service alerts and published operator notices

NammaTransit AI has two **separate** categories of information:

1. **Public operator notices, checked automatically**: the backend requests
   [CMRL press releases](https://chennaimetrorail.org/press-release/) and
   [MTC news](https://mtcbus.tn.gov.in/Home/news). It attempts to parse dated,
   recent passenger-service advisories, caching checks for two minutes.
   This is **not** a realtime service status feed; a published article about
   a closure is not proof that it remains active. No notice is not a live
   all-clear. The public websites may block automated access or change HTML.
2. **Optional structured service alerts**: an operator-authorised endpoint may
   be configured on a deployed **server** (not in public browser JavaScript).
   Without approved credentials/feed details, this stays disconnected.
3. **Simulated scenarios**: the hackathon's disruption-aware rerouting demo is
   explicitly triggered with a button and is never presented as a real incident.

## Local / server setup

Set both server-only environment variables when an operator or authorised
partner gives permission and provides a structured JSON feed:

```dotenv
TRANSIT_ALERTS_FEED_URL=https://YOUR-APPROVED-HOST.example/alerts
TRANSIT_ALERTS_ALLOWED_HOST=YOUR-APPROVED-HOST.example
```

No default URL is provided, and the app cannot turn the public press pages
into a true realtime alerts API. Do not use third-party private endpoints or
copy keys from mobile applications. Host validation requires an HTTPS URL with
an exactly matching allowed host.

The optional feed's JSON format (contract to agree with provider):

```json
{
  "alerts": [
    {
      "id": "source-incident-id",
      "title": "Disruption headline from approved source",
      "mode": "metro",
      "severity": "major",
      "sourceKind": "official",
      "sourceLabel": "Your source organisation",
      "publishedAt": "2026-11-06T09:00:00+05:30",
      "startsAt": "2026-11-06T08:55:00+05:30",
      "endsAt": "2026-11-06T11:00:00+05:30",
      "affectedRouteIds": ["ACTUAL-GTFS-ROUTE-ID"]
    }
  ]
}
```

Supported mode values: `bus`, `metro`, `suburban`; supported severities:
`info`, `minor`, `major`, `suspended`. An alert must identify affected
route IDs, stops or a mode-wide impact. It is shown only if the alert is
valid, currently active and its publication timestamp is no more than
15 minutes old. Results are not proof that the rest of the system is normal.
Client UI checks `/api/live-disruptions` every two minutes while open.

**Security**: do not expose secrets in the client, use only a permitted
source, and keep `TRANSIT_ALERTS_FEED_URL` under server configuration.
The current adapter assumes JSON and does NOT decode GTFS-RT Protobuf.
A binary GTFS-RT feed requires a separately approved and tested decoder.
If running in a static-only AI Studio preview, the endpoint may be unavailable
and the UI must show that rather than misrepresenting data.

## What remains before real-time route avoidance

- Receive official/authorised live alerts and confirm their update cadence.
- Establish reliable matching of provider route/stop IDs to ChennaiGTFS IDs.
- Route only *confirmed currently active*, appropriately scoped disruptions
  into the rerouting logic. The optional feed currently **displays** scoped
  alerts but does not automatically change itineraries or buy tickets.
- Test the source and proxy in the actual deployed environment, including
  outages, stale data, feed permissions and service restorations.
