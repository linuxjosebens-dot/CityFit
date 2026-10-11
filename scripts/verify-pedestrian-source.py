"""Reproduce CityFit's four site averages from the linked Caltrans 2025 CSV.

Usage: python3 scripts/verify-pedestrian-source.py /path/to/downloaded.csv
The download URL is in Data & Sources. This script does not download anything.
"""
import collections
import csv
import hashlib
import json
import sys

hourly = {site: collections.defaultdict(int) for site in
          ("12015", "12016", "12017", "12036")}
coordinates = {}
with open(sys.argv[1], encoding="utf-8-sig", newline="") as source:
    for row in csv.DictReader(source):
        site = row["loc_id"]
        if site not in hourly:
            continue
        assert row["mode"] == "Pedestrian"
        value = int(row["count"])
        assert value >= 0
        point = (float(row["latitude"]), float(row["longitude"]))
        assert site not in coordinates or coordinates[site] == point
        coordinates[site] = point
        hourly[site][row["date"]] += value

with open(sys.argv[1], "rb") as source:
    digest = hashlib.file_digest(source, "sha256").hexdigest()
print(json.dumps({"sourceSHA256": digest, "sites": [
    {"id": site, "lat": coordinates[site][0], "lon": coordinates[site][1],
     "start": min(hours)[:10], "end": max(hours)[:10],
     "observedHours": len(hours), "totalObservations": sum(hours.values()),
     "count": sum(hours.values()) / len(hours)}
    for site, hours in hourly.items()
]}, indent=2))
