"""Polite, cached Transfermarkt fetching for the world scraper.

Every page lands in a disk cache (git-ignored `data/tm_cache`, the same file names scrape_tm.py
uses, so Brazil's pages are reused) and a re-run only asks Transfermarkt for pages missing from it
or older than the caller's limit. The cache is the resume point: a run stopped halfway restarts
from the first page it doesn't have. Live page requests wait `delay` seconds (at least 1) after
each answer, images from the CDN `image_delay`, and retry 429s, 5xxs and network errors with a
growing back-off; a page that keeps failing, or a 404, raises `FetchError`.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import requests

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
BASE = "https://www.transfermarkt.com"
IMAGE_BASE = "https://img.a.transfermarkt.technology"
ATTEMPTS = 5
# Never ask the site for pages faster than this, whatever the caller passes; its robots.txt asks for 2 s.
MIN_PAGE_DELAY = 1.0
# 404 is an answer, not a hiccup: the page doesn't exist and asking again won't change it.
FINAL_STATUSES = {404, 410}


class FetchError(RuntimeError):
    pass


@dataclass(frozen=True)
class Page:
    html: str
    url: str
    fetched_at: str  # UTC ISO time the page was downloaded, from the cache file's time


def cache_name(path: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", path) + ".html"


def iso_time(seconds: float) -> str:
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat(timespec="seconds")


class Fetcher:
    def __init__(self, cache: Path, delay: float = 3.0, image_delay: float = 0.5, log: Callable[[str], None] = print,
                 get: Callable[[str], requests.Response] | None = None, sleep: Callable[[float], None] = time.sleep) -> None:
        self.cache = cache
        self.delay = max(delay, MIN_PAGE_DELAY)
        self.image_delay = image_delay
        self.log = log
        self.sleep = sleep
        self.requests = 0
        self.session = requests.Session()
        self.session.headers["User-Agent"] = UA
        self.get = get or (lambda url: self.session.get(url, timeout=45))

    def _download(self, url: str, delay: float) -> bytes:
        problem = ""
        for attempt in range(ATTEMPTS):
            self.requests += 1
            try:
                response = self.get(url)
            except requests.RequestException as error:
                problem = str(error)
            else:
                if response.status_code == 200:
                    self.sleep(delay)
                    return response.content
                problem = f"HTTP {response.status_code}"
                if response.status_code in FINAL_STATUSES:
                    self.sleep(delay)
                    break
            if attempt < ATTEMPTS - 1:
                self.log(f"  retry {attempt + 1}/{ATTEMPTS - 1} after {problem} on {url}")
                self.sleep(20 * (attempt + 1))
        raise FetchError(f"{problem} on {url}")

    def page(self, path: str, max_age_days: float) -> Page:
        """The page at `path` (no host), from the cache when it is younger than `max_age_days`."""
        cached = self.cache / cache_name(path)
        if not (cached.exists() and time.time() - cached.stat().st_mtime < max_age_days * 86_400):
            body = self._download(BASE + path, self.delay)
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(body)
        return Page(cached.read_text(encoding="utf-8"), BASE + path, iso_time(cached.stat().st_mtime))

    def image(self, path: str, max_age_days: float) -> tuple[Path, str]:
        """An image under Transfermarkt's image host (`/wappen/head/631.png`), cached; its file and source URL."""
        cached = self.cache / "images" / path.strip("/").replace("/", "-")
        url = IMAGE_BASE + path
        if not (cached.exists() and time.time() - cached.stat().st_mtime < max_age_days * 86_400):
            body = self._download(url, self.image_delay)
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(body)
        return cached, url
