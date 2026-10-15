"""Polite, cached fetching for the scrapers: Transfermarkt's pages, and FotMob's JSON through `base`.

Every page lands in a disk cache (git-ignored `data/tm_cache`, the same file names scrape_tm.py
uses, so Brazil's pages are reused) and a re-run only asks Transfermarkt for pages missing from it
or older than the caller's limit. The cache is the resume point: a run stopped halfway restarts
from the first page it doesn't have. Live page requests name the scraper and its repository in the
User-Agent and wait `delay` seconds (at least the 2 s robots.txt asks for) after each answer, images
from the CDN `image_delay`. 429s, 5xxs and network errors are retried with a growing back-off, or
after the Retry-After the site sends. A page that keeps failing, or a 404, raises `FetchError`,
unless an older copy is in the cache: then that copy is used. After `BLOCKED_IN_A_ROW` refusals
(403 or 429) in a row from the site (not its image host) the fetcher raises `Blocked`, which stops the run instead of asking for every
remaining page. An image that doesn't decode, or a page the caller's check rejects, is never cached. Offline, only the cache is read,
whatever its age, and a page missing from it raises `FetchError`.
"""
from __future__ import annotations

import io
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import requests
from PIL import Image, UnidentifiedImageError

UA = "Mozilla/5.0 (compatible; BoleiroBot/1.0; +https://github.com/lucasnsaraujo/boleiro)"
BASE = "https://www.transfermarkt.com"
IMAGE_BASE = "https://img.a.transfermarkt.technology"
ATTEMPTS = 5
# Never ask the site for pages faster than this, whatever the caller passes: its robots.txt crawl-delay.
MIN_PAGE_DELAY = 2.0
REFUSALS = {403, 429}
BLOCKED_IN_A_ROW = 10
# 404 is an answer, not a hiccup: the page doesn't exist and asking again won't change it.
FINAL_STATUSES = {404, 410}


class FetchError(RuntimeError):
    pass


class Blocked(Exception):
    """The site refused too many requests in a row; asking for more pages would only make it worse."""


@dataclass(frozen=True)
class Page:
    html: str
    url: str
    fetched_at: str  # UTC ISO time the page was downloaded, from the cache file's time


def cache_name(path: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", path) + ".html"


def is_image(body: bytes) -> bool:
    try:
        with Image.open(io.BytesIO(body)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError):
        return False
    return True


def retry_after(response: requests.Response) -> float | None:
    value = getattr(response, "headers", {}).get("Retry-After", "")
    return float(value) if value.strip().isdigit() else None


def iso_time(seconds: float) -> str:
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat(timespec="seconds")


class Fetcher:
    def __init__(self, cache: Path, delay: float = 3.0, image_delay: float = 0.5, log: Callable[[str], None] = print,
                 get: Callable[[str], requests.Response] | None = None, sleep: Callable[[float], None] = time.sleep,
                 is_offline: bool = False, base: str = BASE) -> None:
        self.cache = cache
        self.base = base
        self.delay = max(delay, MIN_PAGE_DELAY)
        self.image_delay = image_delay
        self.log = log
        self.sleep = sleep
        self.is_offline = is_offline
        self.requests = 0
        self.refusals_in_a_row = 0
        self.session = requests.Session()
        self.session.headers["User-Agent"] = UA
        self.get = get or (lambda url: self.session.get(url, timeout=45))

    def _download(self, url: str, delay: float) -> bytes:
        if self.is_offline:
            raise FetchError(f"not in the cache, and offline: {url}")
        problem = ""
        for attempt in range(ATTEMPTS):
            self.requests += 1
            wait = 20.0 * (attempt + 1)
            try:
                response = self.get(url)
            except requests.RequestException as error:
                problem = str(error)
            else:
                if url.startswith(self.base):
                    self.refusals_in_a_row = self.refusals_in_a_row + 1 if response.status_code in REFUSALS else 0
                if self.refusals_in_a_row >= BLOCKED_IN_A_ROW:
                    raise Blocked(f"{self.refusals_in_a_row} refusals in a row, the last HTTP {response.status_code} on {url}")
                if response.status_code == 200:
                    self.sleep(delay)
                    return response.content
                problem = f"HTTP {response.status_code}"
                if response.status_code in FINAL_STATUSES:
                    break
                wait = max(wait, retry_after(response) or 0)
            if attempt < ATTEMPTS - 1:
                self.log(f"  retry {attempt + 1}/{ATTEMPTS - 1} after {problem} on {url}")
                self.sleep(wait)
        self.sleep(delay)
        raise FetchError(f"{problem} on {url}")

    def _cached(self, cached: Path, url: str, delay: float, max_age_days: float, is_valid: Callable[[bytes], bool] | None = None) -> None:
        """Makes sure `cached` holds `url`: kept when fresh, kept stale when the site keeps failing."""
        if cached.exists() and (self.is_offline or time.time() - cached.stat().st_mtime < max_age_days * 86_400):
            return
        try:
            body = self._download(url, delay)
            if is_valid and not is_valid(body):
                raise FetchError(f"not a valid answer: {url}")
        except FetchError as error:
            if not cached.exists():
                raise
            self.log(f"  kept the cached copy of {url}: {error}")
            return
        cached.parent.mkdir(parents=True, exist_ok=True)
        # Written aside and renamed, so a run stopped mid-write never leaves half a page that looks fresh.
        partial = cached.with_name(cached.name + ".part")
        partial.write_bytes(body)
        partial.replace(cached)

    def page(self, path: str, max_age_days: float, is_valid: Callable[[str], bool] | None = None) -> Page:
        """The page at `path` (no host), from the cache when it is younger than `max_age_days`; a download that
        `is_valid` rejects is never cached, and an older cached copy is used instead."""
        cached = self.cache / cache_name(path)
        check = (lambda body: is_valid(body.decode("utf-8", errors="replace"))) if is_valid else None
        self._cached(cached, self.base + path, self.delay, max_age_days, check)
        return Page(cached.read_text(encoding="utf-8", errors="replace"), self.base + path, iso_time(cached.stat().st_mtime))

    def image(self, path: str, max_age_days: float) -> tuple[Path, str]:
        """An image under Transfermarkt's image host (`/wappen/head/631.png`), cached; its file and source URL."""
        cached = self.cache / "images" / path.strip("/").replace("/", "-")
        url = IMAGE_BASE + path
        if cached.exists() and not is_image(cached.read_bytes()):
            cached.unlink()
        self._cached(cached, url, self.image_delay, max_age_days, is_image)
        return cached, url
