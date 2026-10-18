"""Finds every sponsor brand's logo and writes data/brands.csv and assets/logos/.

The brands are the ones data/sponsors.csv puts on a shirt plus the offer pool in data/brand-pool.csv.
Each brand is matched to Wikidata through the Wikipedia article its table cell links to, the pool's
article, or else a Wikipedia article of exactly its name whose description says it is a company or a
brand. Its logo is Wikidata's logo image (P154) on Wikimedia Commons, SVG where Commons has one,
saved as Commons renders it to PNG 512 px wide; the file page and its licence go into brands.csv.
A brand Wikidata has no logo for, if it is in the pool, a betting house or on a Série A or B kit (names
distinctive enough), gets the first Commons file a search for "<name> logo" finds whose title holds every
word of its name and "logo", or is its name; data/brand-logo-checks.csv lists each one found that way,
checked by hand, and `wrong` there drops it (a Wikidata logo too, where it shows another brand).
data/brand-logos.csv picks a Commons file by hand where Wikidata's is an icon or missing. A brand without a Commons logo but with a website (Wikidata P856, or the pool's) gets the site's
icon from Google's favicon service, as SPEC §4.2 allows. The rest show their name in the game.

Trademarks are used as the crests are (README, "Data"): a private game among friends.

Answers are cached in data/sponsors_cache. One request a second, generic User-Agent, no personal data.

Every logo whose licence asks for credit (anything but public domain, CC0, "copyrighted free use" or a favicon's
unknown licence) goes into packages/data/src/logoCredits.ts, which Opções lists next to the sounds' credits.

Usage: .venv/bin/python pipeline/fetch_brand_logos.py [--credits]   # --credits only rewrites logoCredits.ts from brands.csv
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

import requests
from PIL import Image, ImageDraw

from brand_key import slugify
from fetch_sponsors import HEADERS, MAX_WAIT_SECONDS, PAUSE_SECONDS, api, cached_get

ROOT = Path(__file__).resolve().parent.parent
SPONSORS = ROOT / "data" / "sponsors.csv"
POOL = ROOT / "data" / "brand-pool.csv"
OUT = ROOT / "data" / "brands.csv"
CREDITS_OUT = ROOT / "packages" / "data" / "src" / "logoCredits.ts"
CLUBS = ROOT / "data" / "clubs.csv"
CHECKS = ROOT / "data" / "brand-logo-checks.csv"
OVERRIDES = ROOT / "data" / "brand-logos.csv"
LOGOS = Path("assets") / "logos"
LOGO_WIDTH = 512
FAVICON = "https://www.google.com/s2/favicons?domain={}&sz=128"
# A site's icon comes with no licence: it is the brand's trademark, used as the crests are.
FAVICON_LICENCE = "unknown licence; trademark; via Google favicon service"
# The licences that ask nothing of whoever shows the logo; any other one owes its author a credit.
CREDIT_FREE = {"Public domain", "CC0", "Copyrighted free use", FAVICON_LICENCE}
# A favicon smaller than this is Google's stand-in globe or too blurry to show.
MIN_FAVICON_PX = 48
# Commons rations SVG renders; a logo refused is left for the next run instead of waited on.
DOWNLOAD_ATTEMPTS = 1
COMPANY = re.compile(
    r"compan|brand|bank|manufactur|retail|chain|bookmak|betting|gambl|insur|airline|cooperativ|supermarket|beer|brew|"
    r"sportswear|clothing|apparel|operator|conglomerat|restaurant|telecom|firm|platform|marketplace|shop|store|"
    r"empresa|marca|banco|rede de|fabricante|casa de apostas|cervej|operadora|varejista|loja|plano de sa|cooperativa|grupo",
    re.IGNORECASE,
)
# A shirt brand outside the pool counts as a betting house when its name says so ("Viva Sorte Bet", "Bet7K", "ObaBet").
BETTING = re.compile(r"bet|sorte|aposta|blaze|stake|pixbet", re.IGNORECASE)
FIELDS = ("id", "name", "sector", "size", "is_pool", "wikidata", "website", "logo_path", "logo_kind", "logo_shape", "logo_source", "logo_licence")
# A corner this close to white is a logo's background, cleared so the logo can be printed on a shirt.
WHITE_TOLERANCE = 24
# A logo opaque over more than this share of its box is a tile, not a mark.
BADGE_SOLID = 0.77
def chunks(items: list[str], size: int = 50) -> list[list[str]]:
    return [items[start:start + size] for start in range(0, len(items), size)]


def pages_by_title(host: str, titles: list[str], prop: str) -> dict[str, dict]:
    """Each page asked for, by the title asked for (through redirects), fifty a request."""
    found: dict[str, dict] = {}
    valid = sorted({title for title in titles if title and not re.search(r"[\[\]{}|#<>]", title)})
    for batch in chunks(valid):
        query = api(host, action="query", prop=prop, titles="|".join(batch), redirects=1)["query"]
        asked = {item["to"]: item["from"] for item in query.get("redirects", []) + query.get("normalized", [])}
        for page in query["pages"]:
            title = page["title"]
            while title in asked:
                title = asked[title]
            found[title] = page
    return found


def item_of(page: dict | None, needs_company: bool) -> str | None:
    props = (page or {}).get("pageprops", {})
    if "disambiguation" in props or not props.get("wikibase_item"):
        return None
    if needs_company and not COMPANY.search((page or {}).get("description", "")):
        return None
    return props["wikibase_item"]


def wikidata_items(brands: list[dict[str, str]]) -> dict[str, str]:
    """Each brand's Wikidata item: through the article its cell or the pool links, or an article of its exact name that describes a company or brand."""
    def host_title(link: str) -> tuple[str, str]:
        return ("pt.wikipedia.org", link[3:]) if link.startswith("pt:") else ("en.wikipedia.org", link.removeprefix("en:"))

    linked = [host_title(b["link"]) for b in brands if b["link"]]
    pages = {host: pages_by_title(host, [t for h, t in linked if h == host], "pageprops") for host in ("en.wikipedia.org", "pt.wikipedia.org")}
    items: dict[str, str] = {}
    for brand in brands:
        if brand["link"]:
            host, title = host_title(brand["link"])
            item = item_of(pages[host].get(title), needs_company=False)
            if item:
                items[brand["id"]] = item
    for host in ("en.wikipedia.org", "pt.wikipedia.org"):
        rest = [b for b in brands if b["id"] not in items]
        named = pages_by_title(host, [b["name"] for b in rest], "pageprops|description")
        for brand in rest:
            item = item_of(named.get(brand["name"]), needs_company=True)
            if item:
                items[brand["id"]] = item
    return items


def claims_of(items: list[str]) -> dict[str, tuple[str | None, str | None]]:
    """Each item's logo file on Commons and its official website, when Wikidata has them."""
    found: dict[str, tuple[str | None, str | None]] = {}
    for batch in chunks(sorted(set(items))):
        entities = cached_get("https://www.wikidata.org/w/api.php", {"action": "wbgetentities", "ids": "|".join(batch), "props": "claims", "format": "json"})["entities"]
        for item, entity in entities.items():
            claims = entity.get("claims", {})

            def first(prop: str) -> str | None:
                for claim in claims.get(prop, []):
                    value = claim["mainsnak"].get("datavalue", {}).get("value")
                    if claim.get("rank") != "deprecated" and isinstance(value, str):
                        return value
                return None

            found[item] = (first("P154"), first("P856"))
    return found


def commons_logos(files: list[str]) -> dict[str, tuple[str, str, str]]:
    """Each file's image (an SVG as Commons renders it to PNG 512 px wide, a raster file as uploaded), its file page and its licence."""
    found: dict[str, tuple[str, str, str]] = {}
    for batch in chunks(sorted(set(files))):
        query = api("commons.wikimedia.org", action="query", prop="imageinfo", titles="|".join(f"File:{name}" for name in batch),
                    iiprop="url|extmetadata", iiurlwidth=LOGO_WIDTH)["query"]
        asked = {item["to"]: item["from"] for item in query.get("normalized", [])}
        for page in query["pages"]:
            info = (page.get("imageinfo") or [{}])[0]
            # A raster file comes as uploaded; only an SVG needs Commons to render it, which it rations.
            is_svg = page["title"].lower().endswith(".svg")
            url = (info.get("thumburl") or info.get("url")) if is_svg else (info.get("url") or info.get("thumburl"))
            if not url:
                continue
            title = asked.get(page["title"], page["title"]).removeprefix("File:")
            licence = info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", "")
            found[title] = (url, info.get("descriptionurl", ""), re.sub(r"<[^>]+>", "", licence))
    return found


def searched_logo(name: str) -> str | None:
    """A Commons file named after the brand's logo, by a search of the File namespace."""
    words = set(slugify(name).split("-"))
    found = api("commons.wikimedia.org", action="query", list="search", srnamespace=6, srsearch=f"{name} logo", srlimit=10)["query"]["search"]
    for hit in found:
        title = hit["title"].removeprefix("File:")
        stem, _, extension = title.rpartition(".")
        stem_words = set(slugify(stem).split("-"))
        if extension.lower() in {"svg", "png"} and words <= stem_words and ("logo" in slugify(stem) or stem_words == words):
            return title
    return None


def download(url: str) -> bytes | None:
    """The file's bytes, or None when the server has none; a busy server is asked again, more slowly each time."""
    for attempt in range(DOWNLOAD_ATTEMPTS):
        response = requests.get(url, headers=HEADERS, timeout=60)
        time.sleep(PAUSE_SECONDS)
        if response.status_code != 429:
            return response.content if response.status_code == 200 else None
        time.sleep(min(MAX_WAIT_SECONDS, float(response.headers.get("Retry-After") or 0) or 5 * 2 ** attempt))
    return None


def save_png(body: bytes, path: Path, min_px: int = 1) -> bool:
    try:
        image = Image.open(io.BytesIO(body)).convert("RGBA")
    except OSError:
        return False
    if max(image.size) < min_px:
        return False
    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)
    return True


def logo_shape(path: Path) -> str:
    """`mark` for a logo on a clear ground, after clearing a white one; `badge` for an opaque tile, printed as a patch."""
    image = Image.open(path).convert("RGBA")
    corners = [(0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)]
    cleared = False
    for corner in corners:
        r, g, b, a = image.getpixel(corner)
        if a > 200 and min(r, g, b) >= 255 - WHITE_TOLERANCE:
            ImageDraw.floodfill(image, corner, (255, 255, 255, 0), thresh=WHITE_TOLERANCE)
            cleared = True
    if cleared:
        bbox = image.getbbox()
        (image.crop(bbox) if bbox else image).save(path, "PNG", optimize=True)
        image = Image.open(path).convert("RGBA")
        corners = [(0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)]
    # A tile with rounded corners has clear corners but is opaque nearly all over: a badge too.
    alpha = image.getchannel("A")
    solid = sum(alpha.histogram()[201:]) / (image.width * image.height)
    opaque = sum(1 for corner in corners if image.getpixel(corner)[3] > 200)
    return "badge" if opaque >= 3 or solid > BADGE_SOLID else "mark"


def domain_of(website: str) -> str:
    host = urllib.parse.urlparse(website if "//" in website else f"https://{website}").netloc
    return host.removeprefix("www.")


def main() -> None:
    brands: dict[str, dict[str, str]] = {}
    for row in csv.DictReader(POOL.open()):
        brands[row["id"]] = {"id": row["id"], "name": row["name"], "sector": row["sector"], "size": row["size"], "is_pool": "1", "link": row["wiki"], "website": row["website"]}
    for row in csv.DictReader(SPONSORS.open()):
        key = row["brand_id"]
        known = brands.setdefault(key, {"id": key, "name": row["brand"], "sector": "", "size": "", "is_pool": "0", "link": "", "website": ""})
        if not known["link"] and row["brand_link"]:
            known["link"] = row["brand_link"]

    ordered = sorted(brands.values(), key=lambda b: b["id"])
    items = wikidata_items(ordered)
    claims = claims_of(list(items.values()))
    clubs = {row["id"]: row["division"] for row in csv.DictReader(CLUBS.open())}
    distinctive = {row["brand_id"] for row in csv.DictReader(SPONSORS.open()) if clubs.get(row["club_id"]) in {"A", "B"}}
    wrong = {row["file"] for row in csv.DictReader(CHECKS.open()) if row["verdict"] == "wrong"} if CHECKS.exists() else set()
    overrides = {row["brand_id"]: row["file"] for row in csv.DictReader(OVERRIDES.open())} if OVERRIDES.exists() else {}
    kept = {row["id"]: row["logo_source"] for row in csv.DictReader(OUT.open())} if OUT.exists() else {}
    searched: dict[str, str] = {}
    for brand in ordered:
        has_logo = bool(claims.get(items.get(brand["id"], ""), (None, None))[0]) or brand["id"] in overrides
        if not has_logo and (brand["is_pool"] == "1" or brand["id"] in distinctive or BETTING.search(brand["name"])):
            title = searched_logo(brand["name"])
            if title and title not in wrong:
                searched[brand["id"]] = title
    logos = commons_logos([logo for logo, _ in claims.values() if logo] + list(searched.values()) + list(overrides.values()))
    rows = []
    for brand in ordered:
        item = items.get(brand["id"])
        logo_file, website = claims.get(item, (None, None)) if item else (None, None)
        logo_file = overrides.get(brand["id"]) or (None if logo_file and logo_file.replace("_", " ") in wrong else logo_file) or searched.get(brand["id"])
        website = brand["website"] or website or ""
        path = LOGOS / f"{brand['id']}.png"
        kind = source = licence = ""
        found = logos.get(logo_file.replace("_", " ")) if logo_file else None
        # A logo on disk stays, but for a brand whose file was picked by hand since.
        is_kept = (ROOT / path).exists() and (brand["id"] not in overrides or kept.get(brand["id"]) == (found[1] if found else None))
        if found and (is_kept or save_png(download(found[0]) or b"", ROOT / path)):
            kind = "svg" if logo_file.lower().endswith(".svg") else "commons"
            source, licence = found[1], found[2]
        elif website:
            favicon = FAVICON.format(domain_of(website))
            if ((ROOT / path).exists() and kept.get(brand["id"]) in {favicon, None}) or save_png(download(favicon) or b"", ROOT / path, MIN_FAVICON_PX):
                kind, source, licence = "favicon", favicon, FAVICON_LICENCE
        shape = logo_shape(ROOT / path) if kind else ""
        sector = brand["sector"] or ("betting" if BETTING.search(brand["name"]) else "")
        rows.append({
            "id": brand["id"], "name": brand["name"], "sector": sector, "size": brand["size"], "is_pool": brand["is_pool"],
            "wikidata": item or "", "website": website, "logo_path": str(path) if kind else "", "logo_kind": kind, "logo_shape": shape,
            "logo_source": source, "logo_licence": licence,
        })
        print(f"{brand['id']}: {kind or 'no logo'}{' (searched: ' + searched[brand['id']] + ')' if brand['id'] in searched and kind else ''}")
    with OUT.open("w", newline="") as out:
        writer = csv.DictWriter(out, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    write_credits(rows)
    kinds = [row["logo_kind"] or "none" for row in rows]
    print({kind: kinds.count(kind) for kind in sorted(set(kinds))}, f"-> {OUT.relative_to(ROOT)}")


def owed_credits(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """The brands whose shipped logo's licence asks for credit, in brands.csv's order."""
    return [row for row in rows if row["logo_path"] and row["logo_licence"] not in CREDIT_FREE]


def write_credits(rows: list[dict[str, str]]) -> None:
    lines = [
        "// Generated by pipeline/fetch_brand_logos.py from data/brands.csv; edit the script, not this file.",
        "",
        "/** A sponsor's logo whose licence asks for credit: its brand, the licence, and the file's page, which names the author. */",
        "export type LogoCredit = { brandId: string; brand: string; licence: string; source: string };",
        "",
        "/** Every shipped logo the game owes a credit. */",
        "export const LOGO_CREDITS: readonly LogoCredit[] = [",
    ]
    for row in owed_credits(rows):
        fields = {"brandId": row["id"], "brand": row["name"], "licence": row["logo_licence"], "source": row["logo_source"]}
        lines.append("  { " + ", ".join(f"{key}: {json.dumps(value, ensure_ascii=False)}" for key, value in fields.items()) + " },")
    lines += ["];", ""]
    CREDITS_OUT.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    if "--credits" in sys.argv[1:]:
        write_credits(list(csv.DictReader(OUT.open())))
    else:
        main()
