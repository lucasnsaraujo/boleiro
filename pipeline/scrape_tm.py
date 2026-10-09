from __future__ import annotations

import csv
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
BASE = "https://www.transfermarkt.com"
COMPETITIONS = {
    "A": "/x/startseite/wettbewerb/BRA1",
    "B": "/x/startseite/wettbewerb/BRA2",
    "C": "/x/teilnehmer/pokalwettbewerb/BRA3/saison_id/2025",
    "D": "/x/teilnehmer/pokalwettbewerb/BRA4/saison_id/2025",
}
CLUB_LINK = re.compile(r"/([a-z0-9-]+)/startseite/verein/(\d+)")

session = requests.Session()
session.headers["User-Agent"] = UA


CACHE = Path("data/tm_cache")


def fetch(path: str) -> BeautifulSoup:
    cached = CACHE / (re.sub(r"[^A-Za-z0-9]+", "_", path) + ".html")
    if cached.exists():
        return BeautifulSoup(cached.read_text(), "lxml")
    problem = ""
    for attempt in range(5):
        try:
            response = session.get(BASE + path, timeout=45)
        except requests.RequestException as error:
            problem = str(error)
        else:
            if response.status_code == 200:
                CACHE.mkdir(parents=True, exist_ok=True)
                cached.write_text(response.text)
                time.sleep(3)
                return BeautifulSoup(response.text, "lxml")
            problem = str(response.status_code)
        time.sleep(20 * (attempt + 1))
    raise RuntimeError(f"{problem} on {path}")


def parse_value(text: str) -> float | None:
    match = re.match(r"€([\d.]+)(k|m)", text)
    if not match:
        return None
    return float(match.group(1)) * (1_000 if match.group(2) == "k" else 1_000_000)


def club_ids(path: str) -> dict[str, str]:
    html = str(fetch(path))
    return {club_id: slug for slug, club_id in CLUB_LINK.findall(html)}


def squad(slug: str, club_id: str) -> tuple[str, list[dict[str, object]]]:
    soup = fetch(f"/{slug}/kader/verein/{club_id}/plus/1")
    club_name = soup.select_one("h1").get_text(strip=True)
    players = []
    for row in soup.select("table.items > tbody > tr"):
        cells = row.find_all("td", recursive=False)
        if len(cells) < 10:
            continue
        name_link = cells[1].select_one("td.hauptlink a")
        position_rows = cells[1].select("table tr")
        age = re.search(r"\((\d+)\)", cells[2].get_text())
        players.append({
            "club": club_name,
            "name": name_link.get_text(strip=True) if name_link else "",
            "tm_id": re.search(r"/spieler/(\d+)", name_link["href"]).group(1) if name_link else "",
            "position": position_rows[-1].get_text(strip=True) if len(position_rows) > 1 else "",
            "age": age.group(1) if age else "",
            "nationality": "/".join(img["title"] for img in cells[3].select("img[title]")),
            "foot": cells[5].get_text(strip=True),
            "contract_until": cells[8].get_text(strip=True),
            "market_value_eur": parse_value(cells[9].get_text(strip=True)) or "",
        })
    return club_name, players


def main() -> None:
    out = Path(sys.argv[1])
    seen: set[str] = set()
    with out.open("w", newline="") as handle:
        writer = None
        for division, path in COMPETITIONS.items():
            clubs = club_ids(path)
            print(f"Série {division}: {len(clubs)} clubs", flush=True)
            for club_id, slug in clubs.items():
                if club_id in seen:
                    continue
                seen.add(club_id)
                try:
                    name, players = squad(slug, club_id)
                except Exception as error:
                    print(f"  skip {slug}: {error}", flush=True)
                    continue
                for player in players:
                    player["division"] = division
                    if writer is None:
                        writer = csv.DictWriter(handle, fieldnames=list(player))
                        writer.writeheader()
                    writer.writerow(player)
                print(f"  {name}: {len(players)}", flush=True)


if __name__ == "__main__":
    main()
