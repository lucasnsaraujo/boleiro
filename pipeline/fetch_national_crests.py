"""Downloads each national team's crest from Transfermarkt into `packages/data/pack/national/`.

The national-teams pack (`world/national-teams.pack.json.gz`) names its teams as their Transfermarkt squad pages do,
and the participants pages the world scrape found them on (tm_world.NATIONAL_TEAM_LISTS) give each one's
Transfermarkt id: its crest is `/wappen/head/<id>.png`, the federation's badge (the CBF's for Brazil). The crests go
through build_assets.py's world settings, WebP in the 64 and 128 px boxes, into `national/assets.json` keyed by the
pack's team ids, with their files under `national/assets/`. A pack team missing from the lists stops the build.

Pages and images come through tm_fetch's cache (data/tm_cache) with a generic User-Agent and `--delay` seconds
between page requests (never under 2). `--offline` reads only the cache.

Usage: .venv/bin/python pipeline/fetch_national_crests.py [--delay 3] [--offline]
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path

import requests
from PIL import Image

import tm_pages
import tm_world
from build_assets import WORLD_BOXES, WORLD_FORMATS, build, write
from import_csv import slugify
from tm_fetch import Fetcher

ROOT = Path(__file__).resolve().parent.parent
PACK = ROOT / "packages" / "data" / "pack"
USER_AGENT = "Boleiro/0.1 (personal project)"
CREST = "/wappen/head/{}.png"


def crest_ids(refs: list[tm_pages.ClubRef], teams: dict[str, str]) -> dict[str, str]:
    """Each pack team's Transfermarkt id, by its name on the participants pages; `teams` maps the pack's ids to names."""
    by_name = {slugify(ref.name): ref.tm_id for ref in refs}
    found = {team: by_name[slugify(name)] for team, name in teams.items() if slugify(name) in by_name}
    missing = sorted(set(teams) - set(found))
    if missing:
        raise SystemExit(f"no Transfermarkt id for {', '.join(missing)}")
    return found


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--delay", type=float, default=3)
    parser.add_argument("--offline", action="store_true", help="read only the cache, whatever its age; never ask the site")
    args = parser.parse_args()
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    fetcher = Fetcher(ROOT / "data" / "tm_cache", delay=args.delay, is_offline=args.offline, get=lambda url: session.get(url, timeout=45))
    national = json.loads(gzip.decompress((PACK / "world" / "national-teams.pack.json.gz").read_bytes()))
    teams = dict(zip(national["teams"]["id"], national["teams"]["name"]))
    refs = [ref for path in tm_world.NATIONAL_TEAM_LISTS for ref in tm_pages.participants(fetcher.page(path, max_age_days=30).html)]
    rows = []
    for team, tm_id in sorted(crest_ids(refs, teams).items()):
        file, _ = fetcher.image(CREST.format(tm_id), max_age_days=180)
        width, height = Image.open(file).size
        rows.append({"kind": "crest", "sha256": hashlib.sha256(file.read_bytes()).hexdigest(), "entity": "club", "entity_id": team,
                     "path": str(file.resolve()), "width": width, "height": height})
    out = PACK / "national"
    write(build(rows, out, WORLD_FORMATS, WORLD_BOXES), out)


if __name__ == "__main__":
    main()
