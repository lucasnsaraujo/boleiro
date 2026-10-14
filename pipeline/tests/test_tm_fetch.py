from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import tests.fixtures  # noqa: F401  (puts pipeline/ on the import path)

import tm_fetch


class Answer:
    def __init__(self, status_code: int, body: bytes = b"<html></html>") -> None:
        self.status_code = status_code
        self.content = body


class Recorder:
    """Stands in for the network: hands out the queued answers and records every wait."""

    def __init__(self, *answers: Answer) -> None:
        self.answers = list(answers)
        self.urls: list[str] = []
        self.waits: list[float] = []

    def get(self, url: str) -> Answer:
        self.urls.append(url)
        return self.answers.pop(0)

    def sleep(self, seconds: float) -> None:
        self.waits.append(seconds)


def fetcher(cache: Path, network: Recorder, delay: float = 3.0) -> tm_fetch.Fetcher:
    return tm_fetch.Fetcher(cache, delay=delay, log=lambda _: None, get=network.get, sleep=network.sleep)


class FetcherTest(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        self.cache = Path(self.folder.name)

    def tearDown(self) -> None:
        self.folder.cleanup()

    def test_reads_a_cached_page_without_asking_the_site(self) -> None:
        (self.cache / tm_fetch.cache_name("/x/kader/verein/31/plus/1")).write_text("<p>cached</p>")
        network = Recorder()
        page = fetcher(self.cache, network).page("/x/kader/verein/31/plus/1", max_age_days=7)
        self.assertEqual(page.html, "<p>cached</p>")
        self.assertEqual(network.urls, [])

    def test_a_second_run_reads_the_page_the_first_run_downloaded(self) -> None:
        network = Recorder(Answer(200, b"<p>live</p>"))
        fetcher(self.cache, network).page("/a", max_age_days=7)
        again = Recorder()
        self.assertEqual(fetcher(self.cache, again).page("/a", max_age_days=7).html, "<p>live</p>")
        self.assertEqual(again.urls, [])

    def test_retries_rate_limits_and_server_errors_with_a_growing_back_off(self) -> None:
        network = Recorder(Answer(429), Answer(503), Answer(200, b"<p>ok</p>"))
        page = fetcher(self.cache, network).page("/a", max_age_days=7)
        self.assertEqual(page.html, "<p>ok</p>")
        self.assertEqual(len(network.urls), 3)
        back_offs = network.waits[:2]
        self.assertLess(back_offs[0], back_offs[1])
        self.assertGreaterEqual(back_offs[0], 10)

    def test_gives_up_at_once_on_a_missing_page(self) -> None:
        network = Recorder(Answer(404))
        with self.assertRaises(tm_fetch.FetchError):
            fetcher(self.cache, network).page("/gone", max_age_days=7)
        self.assertEqual(len(network.urls), 1)
        self.assertFalse((self.cache / tm_fetch.cache_name("/gone")).exists())

    def test_waits_at_least_a_second_after_every_live_request_even_when_asked_for_less(self) -> None:
        network = Recorder(Answer(200), Answer(200))
        pages = fetcher(self.cache, network, delay=0.2)
        pages.page("/a", max_age_days=7)
        pages.page("/b", max_age_days=7)
        self.assertEqual(len(network.waits), 2)
        self.assertTrue(all(wait >= 1 for wait in network.waits))

    def test_asks_again_for_a_page_older_than_the_callers_limit(self) -> None:
        cached = self.cache / tm_fetch.cache_name("/a")
        cached.write_text("<p>old</p>")
        network = Recorder(Answer(200, b"<p>new</p>"))
        self.assertEqual(fetcher(self.cache, network).page("/a", max_age_days=0).html, "<p>new</p>")

    def test_introduces_itself_with_a_browser_user_agent(self) -> None:
        pages = tm_fetch.Fetcher(self.cache)
        self.assertIn("Mozilla/5.0", pages.session.headers["User-Agent"])


if __name__ == "__main__":
    unittest.main()
