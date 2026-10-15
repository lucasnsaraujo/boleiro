"""A tiny world served from the saved pages: the Premier League with Arsenal and Liverpool, and the
South American qualifiers' national teams, of which only Brazil's squad page is saved."""
from __future__ import annotations

import sqlite3
import struct
import zlib
from pathlib import Path

from tests.fixtures import fixture

import tm_fetch
import tm_world
from scrape_world import Run, scrape_world

ENGLAND = tm_world.Country("gb-eng", "England", (tm_world.League(1, "GB1"),))
QUALIFIERS = "/x/teilnehmer/pokalwettbewerb/WMQ4/saison_id/2023"
PAGES = {
    "/x/startseite/wettbewerb/GB1": "league-premier-league-two-clubs",
    "/fc-arsenal/kader/verein/11/plus/1": "squad-arsenal",
    "/fc-liverpool/kader/verein/31/plus/1": "squad-liverpool",
    "/x/datenfakten/verein/31": "facts-liverpool",
    QUALIFIERS: "participants-wc-qualifiers-south-america",
    "/brasilien/kader/verein/3439/plus/1": "squad-brazil-national-team",
}


class Missing:
    status_code = 404
    content = b""


class Offline:
    """The network for a run on saved pages: every page not in the cache is missing."""

    def __init__(self) -> None:
        self.urls: list[str] = []

    def get(self, url: str) -> Missing:
        self.urls.append(url)
        return Missing()


def tiny_png(width: int, height: int) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    rows = b"".join(b"\x00" + b"\x00\x00\x00" * width for _ in range(height))
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def saved_cache(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    for path, name in PAGES.items():
        (cache / tm_fetch.cache_name(path)).write_text(fixture(name), encoding="utf-8")
    (cache / "images").mkdir(exist_ok=True)
    (cache / "images" / "wappen-head-31.png").write_bytes(tiny_png(3, 4))


def scrape_tiny_world(db: sqlite3.Connection, cache: Path, network: Offline, known_club_ids: dict[str, str] | None = None,
                      is_partial: bool = False) -> Run:
    fetcher = tm_fetch.Fetcher(cache, log=lambda _: None, get=network.get, sleep=lambda _: None)
    return scrape_world(db, fetcher, [ENGLAND], national_team_lists=[QUALIFIERS], known_club_ids=known_club_ids, log=lambda _: None,
                        is_partial=is_partial)
