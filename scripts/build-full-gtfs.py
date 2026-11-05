#!/usr/bin/env python3
"""Build a complete *static* Chennai GTFS network index, without invented routes.

Input: ChennaiGTFS unified GTFS ZIP v0.2.0 (MTC + CMRL + SRR).
Output: compact public/data/chennai-full-network.json for browser route search.

We retain every route ID and every unique trip stop pattern from GTFS. This is
NOT a live feed, and not a guarantee of current Chennai One app coverage.
"""
import argparse
import csv
import io
import json
import math
import os
import zipfile
from collections import defaultdict
from pathlib import Path

DEFAULT_SOURCE = "https://github.com/ungalsoththu/ChennaiGTFS"
MAX_TRANSFER_METERS = 160
MAX_TRANSFERS_PER_STOP = 7


def read_csv(zf, basename):
    candidates = [p for p in zf.namelist() if p.rsplit("/", 1)[-1] == basename]
    if len(candidates) != 1:
        raise ValueError(f"Expected one {basename} in ZIP; found {candidates}")
    with zf.open(candidates[0]) as raw:
        return list(csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")))


def minutes_between(a, b, mode):
    def seconds(raw):
        try:
            pieces = str(raw).split(":")
            return int(pieces[0]) * 3600 + int(pieces[1]) * 60 + int(pieces[2])
        except (ValueError, IndexError):
            return None
    aa = seconds(a)
    bb = seconds(b)
    if aa is not None and bb is not None and 0 < bb - aa <= 3600:
        return max(1, round((bb - aa) / 60))
    # Explicit fallback; source timetable is incomplete.
    return {"Bus": 3, "Metro": 2, "Suburban Rail": 3}[mode]


def distance_m(lat_a, lon_a, lat_b, lon_b):
    p1, p2 = math.radians(lat_a), math.radians(lat_b)
    dp = p2 - p1
    dl = math.radians(lon_b - lon_a)
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 12742000 * math.asin(min(1, math.sqrt(x)))


def system_for_id(value):
    return "Bus" if value.startswith("MTC-") else (
        "Metro" if value.startswith("CMRL-") else "Suburban Rail"
    )


def parse_coord(raw):
    try:
        value = round(float(raw), 6)
        return value if math.isfinite(value) else None
    except (TypeError, ValueError):
        return None


def build(input_zip, output_path):
    with zipfile.ZipFile(input_zip) as zf:
        stops_raw = read_csv(zf, "stops.txt")
        fare_attributes_raw = read_csv(zf, "fare_attributes.txt") if any(p.endswith("fare_attributes.txt") for p in zf.namelist()) else []
        fare_rules_raw = read_csv(zf, "fare_rules.txt") if any(p.endswith("fare_rules.txt") for p in zf.namelist()) else []
        routes_raw = read_csv(zf, "routes.txt")
        trips_raw = read_csv(zf, "trips.txt")
        stop_times_raw = read_csv(zf, "stop_times.txt")
        transfers_raw = read_csv(zf, "transfers.txt") if any(
            p.endswith("transfers.txt") for p in zf.namelist()
        ) else []
        pathways_raw = read_csv(zf, "pathways.txt") if any(
            p.endswith("pathways.txt") for p in zf.namelist()
        ) else []

    stops = []
    stop_indices = {}
    for item in stops_raw:
        sid = item.get("stop_id", "")
        if not sid or sid in stop_indices:
            continue
        stop_indices[sid] = len(stops)
        stops.append([
            sid, item.get("stop_name", "").strip(),
            parse_coord(item.get("stop_lat")), parse_coord(item.get("stop_lon")),
            system_for_id(sid),
            item.get("parent_station") or "",
        ])

    routes = []
    route_indices = {}
    for item in routes_raw:
        rid = item.get("route_id", "")
        if not rid or rid in route_indices:
            continue
        route_indices[rid] = len(routes)
        routes.append([
            rid,
            item.get("route_short_name", "").strip(),
            item.get("route_long_name", "").strip(),
            system_for_id(rid),
        ])

    trips = {}
    for item in trips_raw:
        trip_id = item.get("trip_id", "")
        route_idx = route_indices.get(item.get("route_id", ""))
        if trip_id and route_idx is not None:
            trips[trip_id] = (
                route_idx, item.get("direction_id", ""), item.get("service_id", "")
            )

    by_trip = defaultdict(list)
    for item in stop_times_raw:
        trip_id = item.get("trip_id", "")
        stop_idx = stop_indices.get(item.get("stop_id", ""))
        if trip_id not in trips or stop_idx is None:
            continue
        try:
            seq = int(item.get("stop_sequence", ""))
        except ValueError:
            continue
        by_trip[trip_id].append((
            seq, stop_idx,
            item.get("arrival_time", ""),
            item.get("departure_time", ""),
        ))

    # Preserve all distinct route/direction/stop sequences, not only one
    # handpicked trip per route. For repeated trips, select an exemplar.
    unique_patterns = {}
    valid_trip_count = 0
    for trip_id, samples in by_trip.items():
        route_idx, direction, service = trips[trip_id]
        samples.sort(key=lambda row: row[0])
        indices = [s[1] for s in samples]
        if len(indices) < 2:
            continue
        mode = routes[route_idx][3]
        durations = [
            minutes_between(samples[i][3], samples[i + 1][2], mode)
            for i in range(len(samples) - 1)
        ]
        signature = (route_idx, direction, tuple(indices))
        valid_trip_count += 1
        if signature not in unique_patterns:
            unique_patterns[signature] = [route_idx, indices, durations, direction, service]

    patterns = list(unique_patterns.values())

    walking_edges = {}
    def insert_walk(a, b, mins, source):
        if a == b:
            return
        key = (a, b)
        minutes = max(1, mins)
        existing = walking_edges.get(key)
        if existing is None or existing[0] > minutes:
            walking_edges[key] = [minutes, source]

    # Transfer references supplied in the GTFS ZIP; platform entrance
    # pathways are retained as adjacency but should not imply all-way access.
    for entry in transfers_raw:
        a = stop_indices.get(entry.get("from_stop_id", ""))
        b = stop_indices.get(entry.get("to_stop_id", ""))
        if a is not None and b is not None:
            insert_walk(a, b, 4, "GTFS transfer")
    for entry in pathways_raw:
        a = stop_indices.get(entry.get("from_stop_id", ""))
        b = stop_indices.get(entry.get("to_stop_id", ""))
        if a is None or b is None:
            continue
        try:
            travel = int(math.ceil(float(entry.get("traversal_time") or 90) / 60))
        except ValueError:
            travel = 2
        insert_walk(a, b, travel, "GTFS pathway")
        if entry.get("is_bidirectional") == "1":
            insert_walk(b, a, travel, "GTFS pathway")

    # Cross-mode transfers only for nearby coordinates. These are candidate
    # pedestrian connections, NOT verified street paths or station entrances.
    grid = defaultdict(list)
    for i, (_, _, lat, lon, mode, _) in enumerate(stops):
        if lat is None or lon is None:
            continue
        grid[(int(lat * 500), int(lon * 500))].append(i)

    for i, (_, _, lat, lon, mode, _) in enumerate(stops):
        if lat is None or lon is None:
            continue
        gx, gy = int(lat * 500), int(lon * 500)
        nearby = []
        for ax in range(gx - 1, gx + 2):
            for ay in range(gy - 1, gy + 2):
                for j in grid.get((ax, ay), []):
                    if j == i or stops[j][4] == mode:
                        continue
                    d = distance_m(lat, lon, stops[j][2], stops[j][3])
                    if d <= MAX_TRANSFER_METERS:
                        nearby.append((d, j))
        for metres, j in sorted(nearby)[:MAX_TRANSFERS_PER_STOP]:
            # Allow additional access time for entrances/crossings.
            insert_walk(i, j, max(3, math.ceil(metres / 65) + 2), "proximity estimate")

    connections = [[a, b, mins, source] for (a, b), (mins, source) in walking_edges.items()]
    # Preserve CMRL station/zone fares as a *historical* reference only. This
    # feed's tariff dates to 2021 and cannot verify current ticket prices.
    amounts = {}
    for row in fare_attributes_raw:
        try:
            amount = float(row.get("price", ""))
        except (TypeError, ValueError):
            continue
        if row.get("currency_type") == "INR" and 0 <= amount <= 50:
            amounts[row.get("fare_id", "")] = round(amount)
    metro_fares = {}
    for row in fare_rules_raw:
        start = (row.get("origin_id") or "").strip()
        end = (row.get("destination_id") or "").strip()
        price = amounts.get((row.get("fare_id") or "").strip())
        if start.startswith("CMRL-") and end.startswith("CMRL-") and price is not None and start != end:
            metro_fares[start + "|" + end] = price

    metadata = {
        "metroHistoricalFarePairs": len(metro_fares),
        "metroFareSourceYear": 2021,
        "source": DEFAULT_SOURCE,
        "feed": "chennai-unified-gtfs.zip",
        "version": "0.2.0",
        "claim": "Static open-data feed; not complete or live Chennai One coverage",
        "routeCount": len(routes),
        "stopCount": len(stops),
        "tripCount": len(trips),
        "validTrips": valid_trip_count,
        "patternCount": len(patterns),
        "stopTimeCount": len(stop_times_raw),
        "walkConnectionCount": len(connections),
        "status": "Historical/structural schedules only: CMRL service calendar expired in 2021; MTC scraped 2026-04; SRR service patterns not live departures",
    }
    payload = {"metadata": metadata, "stops": stops, "routes": routes, "patterns": patterns, "walks": connections, "metroFareByZone": metro_fares}
    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as out:
        json.dump(payload, out, separators=(",", ":"), ensure_ascii=False)
    print("GENERATED_FULL_CHENNAI_NETWORK", json.dumps(metadata))
    print("OUTPUT_BYTES", target.stat().st_size)
    # Fail loudly when output is only a hand-curated subset.
    if len(routes) < 5000 or len(stops) < 6000 or len(patterns) < 4000:
        raise RuntimeError("GTFS output unexpectedly incomplete")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("zip")
    parser.add_argument("--out", default="public/data/chennai-full-network.json")
    args = parser.parse_args()
    build(args.zip, args.out)
