# ChennaiGTFS full-network integration (static data)

This feature imports all route and stop records from the public **UngalSoththu
ChennaiGTFS v0.2.0 unified GTFS feed** into NammaTransit AI.

- Source: https://github.com/ungalsoththu/ChennaiGTFS
- Input archive: data/chennai-unified-gtfs.zip (in source repository)
- Output: public/data/chennai-full-network.json (generated, approximately 1.8 MB)
- Import script: scripts/build-full-gtfs.py
- Application modules: src/lib/transit/full-gtfs.ts and full-gtfs-chat.ts

## Generated feed counts (source version 0.2.0)

| Item | Count |
| --- | ---: |
| All route records | 5,402 |
| MTC Bus routes | 4,611 (source-reported) |
| CMRL Metro routes | 28 (source-reported) |
| Suburban services/routes | 763 (source-reported) |
| Stop/station records | 6,542 |
| GTFS trip records | 48,435 |
| Unique route + direction + stop patterns usable for structural routing | 4,722 |
| GTFS stop-time records | 1,389,081 |
| Candidate walking links, including GTFS transfer/pathway references | 5,158 |

**These are source records, not a count of verified operating services.**
The importer can include route records for which no valid stop pattern is
available, meaning they appear in lookup but cannot be routed until the
underlying trip/stop-time records exist.

## How the app uses this data

1. The chatbot downloads the preprocessed 1.8 MB index on demand; it never
   fetches the large source ZIP during a commuter's request.
2. Route-number lookup searches the complete route catalogue.
3. Origin/destination searches traverse recorded directed stop sequences
   and candidate walking connections, then provide selectable itineraries.
4. Specific Bus, Metro and Suburban Rail requests are mode-restricted.
5. The static timetable is **not** used to claim live arrivals. Travel durations
   and initial/transfer waiting times are approximations.
6. An unavailable operator fare is explicitly shown as "Fare unavailable",
   not "₹0" or "verified".
7. If the downloaded network fails, the existing curated planner remains
   available rather than breaking the chatbot.

## Caution: this is NOT an exact Chennai One replica

The *Chennai One* application's complete, current internal routes and realtime
operational API are not mirrored here. The external GTFS source has known
age/quality limits:

- The CMRL service calendar ends in 2021, so the Metro data is historical
  structure, not valid next-departure data.
- MTC timetable data was collected around April 2026; it is not live.
- Suburban services and calendar patterns may not represent currently
  operating individual train departures.
- Some walking transfer links are generated from straight-line proximity
  within 160 metres. They are explicitly marked as **unverified pedestrian
  access**. Road crossings, entrances, accessibility and safety require checks.
- Route graph ranking uses conservative, *estimated* vehicle and wait times,
  not departure-time-dependent RAPTOR/OTP routing.

Don't demonstrate travel times as operator-verified ETA or promise route
coverage identical to the currently published Chennai One app.

## Regeneration and checks

Download the latest suitable unified archive from the credited source and run:

```bash
python3 scripts/build-full-gtfs.py chennai-unified-gtfs.zip
npm test
npm run build
```

Before publishing, manually check actual MTC numbers/directions, suburban
boarding/alighting sequences, bus + Metro transfers, estimated vs unavailable
fares, and the app's fallback when the static JSON cannot load.
