"""Downloads the real logo of every competition `data/competition-logos.csv` lists into `packages/data/pack/competitions/`.

Each row names a competition key (`serie-a`, `gb-eng-1`, `es-cup`, `world-cup-2026`), the logo's source and its licence
as the source states it. A `transfermarkt` row is Transfermarkt's competition logo, `/logo/header/<code>.png` on its
image host (139x181 at most); `--seed` writes one for every league and European cup of pipeline/tm_world.py the file
lacks. A `wikimedia` row is a file page on Wikimedia Commons or a Wikipedia: an SVG as the wiki renders it to PNG
512 px tall, a raster file as uploaded. A competition missing from the file gets a generated logo in the app.

The logos go through build_assets.py into `competitions/assets.json`, keyed by competition, WebP in the 64, 128 and 256
px boxes (a box a logo is too small to fill is left out), in a lossless 128-colour palette where it keeps the look.
Every licence must ask for no credit (public domain, CC0, or a trademark used as the crests are): a row that does stops
the run, as the app credits no competition logo.

Pages and images come through tm_fetch's cache (data/tm_cache) or data/wiki_cache, with a generic User-Agent; every
logo loses its clear margin, so it fills the box a screen gives it.

Usage: .venv/bin/python pipeline/fetch_competition_logos.py [--seed] [--offline]
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import re
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

import requests
from PIL import Image

import tm_world
from build_assets import build, write
from tm_fetch import Fetcher

ROOT = Path(__file__).resolve().parent.parent
PACK = ROOT / "packages" / "data" / "pack"
SOURCES = ROOT / "data" / "competition-logos.csv"
CACHE = ROOT / "data" / "wiki_cache" / "competition-logos"
USER_AGENT = "Boleiro/0.1 (personal project)"
FIELDS = ("key", "name", "source", "page", "licence")
TM_LOGO = "/logo/header/{}.png"
TM_PAGE = "https://www.transfermarkt.com/x/startseite/wettbewerb/{}"
TM_LICENCE = "unknown licence; trademark; via Transfermarkt"
BOXES = (64, 128, 256)
# A competition logo is flat art, like a federation's crest (fetch_national_crests.py).
PALETTE_COLOURS = 128
RENDER_HEIGHT = 512
WIKI_PAUSE_SECONDS = 2.0
ATTEMPTS = 5
# Licences that ask for no credit: public domain, CC0, a trademark used as the crests are (a private game).
CREDIT_FREE = re.compile(r"public domain|^pd|cc0|trademark|non-free|fair use", re.IGNORECASE)


def transfermarkt_rows() -> list[dict[str, str]]:
    """A row for every league of tm_world's countries but Brazil's and every European country's cup, keyed as the game keys them."""
    rows = []
    europe = {country.id for country in tm_world.COUNTRIES if country.cup and country.id not in {"br", "ar", "sa", "us"}}
    for country in tm_world.COUNTRIES:
        if country.id == "br":
            continue
        for league in country.leagues:
            rows.append({"key": f"{country.id}-{league.tier}", "name": f"{country.name} {league.tier}", "source": "transfermarkt",
                         "page": TM_PAGE.format(league.code), "licence": TM_LICENCE})
        if country.id in europe and country.cup:
            rows.append({"key": f"{country.id}-cup", "name": f"{country.name} cup", "source": "transfermarkt",
                         "page": TM_PAGE.format(country.cup), "licence": TM_LICENCE})
    return rows


def seeded(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """`rows` with a Transfermarkt row for each league and cup they lack."""
    known = {row["key"] for row in rows}
    return rows + [row for row in transfermarkt_rows() if row["key"] not in known]


def transfermarkt_code(page: str) -> str:
    return page.rstrip("/").rsplit("/", 1)[-1].lower()


def wiki_file(page: str) -> tuple[str, str]:
    """The API host and file title of a wiki file page: `commons.wikimedia.org`, `File:Foo.svg`."""
    url = urlparse(page)
    return url.netloc, unquote(url.path.removeprefix("/wiki/"))


def polite_get(url: str, params: dict[str, object] | None = None) -> requests.Response:
    """A wiki answer, asked again more slowly while the wiki says it is busy (429 or 5xx)."""
    for attempt in range(ATTEMPTS):
        response = requests.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=60)
        time.sleep(WIKI_PAUSE_SECONDS)
        if response.status_code != 429 and response.status_code < 500:
            response.raise_for_status()
            return response
        time.sleep(float(response.headers.get("Retry-After") or 0) or 5 * 2 ** attempt)
    response.raise_for_status()
    return response


def wiki_image(page: str, is_offline: bool) -> Path:
    """The file of a wiki page as an image, rendered to PNG when it is an SVG; cached under data/wiki_cache."""
    host, title = wiki_file(page)
    cached = CACHE / (re.sub(r"[^A-Za-z0-9.]+", "_", f"{host}_{title}") + ".png")
    if cached.exists() or is_offline:
        return cached
    info = polite_get(f"https://{host}/w/api.php", {"action": "query", "prop": "imageinfo", "titles": title, "iiprop": "url",
                                                     "iiurlheight": RENDER_HEIGHT, "format": "json", "formatversion": 2}).json()["query"]["pages"][0]["imageinfo"][0]
    url = info["thumburl"] if title.lower().endswith(".svg") else info["url"]
    body = polite_get(url)
    cached.parent.mkdir(parents=True, exist_ok=True)
    Image.open(io.BytesIO(body.content)).save(cached, "PNG")
    return cached


def cropped(file: Path) -> Path:
    """The image without its clear margin, so a logo fills the box a screen gives it; cached next to the wikis' files."""
    image = Image.open(file).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if not bbox or bbox == (0, 0, *image.size):
        return file
    out = CACHE / f"{hashlib.sha256(file.read_bytes()).hexdigest()[:16]}-cropped.png"
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        image.crop(bbox).save(out, "PNG", optimize=True)
    return out


def owed_credits(rows: list[dict[str, str]]) -> list[str]:
    """The keys of the rows whose licence asks for credit, which the app has nowhere to give for a competition's logo."""
    return [row["key"] for row in rows if not CREDIT_FREE.search(row["licence"])]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", action="store_true", help="add a Transfermarkt row for each league and cup the file lacks")
    parser.add_argument("--offline", action="store_true", help="read only the caches")
    args = parser.parse_args()
    rows = list(csv.DictReader(SOURCES.open(encoding="utf-8"))) if SOURCES.exists() else []
    owed = owed_credits(rows)
    if owed:
        raise SystemExit(f"logos whose licence asks for credit: {', '.join(owed)}")
    if args.seed:
        rows = sorted(seeded(rows), key=lambda row: row["key"])
        with SOURCES.open("w", encoding="utf-8", newline="") as out:
            writer = csv.DictWriter(out, FIELDS, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    fetcher = Fetcher(ROOT / "data" / "tm_cache", is_offline=args.offline, get=lambda url: session.get(url, timeout=45), image_delay=1.0)
    images = []
    for row in rows:
        if row["source"] == "transfermarkt":
            file, _ = fetcher.image(TM_LOGO.format(transfermarkt_code(row["page"])), max_age_days=365)
        else:
            file = wiki_image(row["page"], args.offline)
        file = cropped(file)
        width, height = Image.open(file).size
        images.append({"kind": "logo", "sha256": hashlib.sha256(file.read_bytes()).hexdigest(), "entity": "competition",
                       "entity_id": row["key"], "path": str(file.resolve()), "width": width, "height": height})
    out = PACK / "competitions"
    write(build(images, out, ("webp",), BOXES, are_logos=True, palette_colours=PALETTE_COLOURS), out)


if __name__ == "__main__":
    main()
