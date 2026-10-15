from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import tm_fetch
from tests.world_fixture import tiny_png


class Answer:
    def __init__(self, status_code: int, body: bytes = b"<html></html>", headers: dict[str, str] | None = None) -> None:
        self.status_code = status_code
        self.content = body
        self.headers = headers or {}


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


def fetcher(cache: Path, network: Recorder, delay: float = 3.0, is_offline: bool = False) -> tm_fetch.Fetcher:
    return tm_fetch.Fetcher(cache, delay=delay, log=lambda _: None, get=network.get, sleep=network.sleep, is_offline=is_offline)


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

    def test_still_waits_after_a_page_that_kept_failing_before_the_next_request(self) -> None:
        network = Recorder(*[Answer(503)] * tm_fetch.ATTEMPTS)
        with self.assertRaises(tm_fetch.FetchError):
            fetcher(self.cache, network, delay=2).page("/a", max_age_days=7)
        self.assertEqual(len(network.waits), tm_fetch.ATTEMPTS)
        self.assertGreaterEqual(network.waits[-1], 2)

    def test_falls_back_to_an_old_cached_copy_when_the_site_keeps_failing(self) -> None:
        (self.cache / tm_fetch.cache_name("/a")).write_text("<p>old</p>")
        network = Recorder(*[Answer(429)] * tm_fetch.ATTEMPTS)
        self.assertEqual(fetcher(self.cache, network).page("/a", max_age_days=0).html, "<p>old</p>")

    def test_reads_a_page_with_bytes_that_are_not_utf8(self) -> None:
        network = Recorder(Answer(200, "<p>S\u00e3o</p>".encode("latin-1")))
        self.assertIn("S", fetcher(self.cache, network).page("/a", max_age_days=7).html)

    def test_introduces_itself_with_a_browser_user_agent(self) -> None:
        pages = tm_fetch.Fetcher(self.cache)
        self.assertIn("Mozilla/5.0", pages.session.headers["User-Agent"])

    def test_names_itself_and_its_repository_in_the_user_agent(self) -> None:
        agent = tm_fetch.Fetcher(self.cache).session.headers["User-Agent"]
        self.assertIn("Boleiro", agent)
        self.assertIn("github.com/lucasnsaraujo/boleiro", agent)

    def test_waits_the_two_seconds_robots_txt_asks_for_after_every_page(self) -> None:
        network = Recorder(Answer(200))
        fetcher(self.cache, network, delay=0.5).page("/a", max_age_days=7)
        self.assertEqual(network.waits, [2.0])

    def test_waits_as_long_as_retry_after_asks_before_trying_again(self) -> None:
        network = Recorder(Answer(429, headers={"Retry-After": "300"}), Answer(200))
        fetcher(self.cache, network).page("/a", max_age_days=7)
        self.assertEqual(network.waits[0], 300)

    def test_stops_the_run_after_the_site_keeps_refusing_in_a_row(self) -> None:
        network = Recorder(*[Answer(403)] * tm_fetch.BLOCKED_IN_A_ROW, Answer(200))
        pages = fetcher(self.cache, network)
        with self.assertRaises(tm_fetch.Blocked):
            for path in ("/a", "/b", "/c", "/d"):
                try:
                    pages.page(path, max_age_days=7)
                except tm_fetch.FetchError:
                    pass
        self.assertEqual(len(network.urls), tm_fetch.BLOCKED_IN_A_ROW)

    def test_asks_another_site_given_as_its_base_and_stops_when_that_site_keeps_refusing(self) -> None:
        network = Recorder(Answer(200, b"{}"), *[Answer(429)] * tm_fetch.BLOCKED_IN_A_ROW)
        pages = tm_fetch.Fetcher(self.cache, delay=2, log=lambda _: None, get=network.get, sleep=network.sleep, base="https://www.fotmob.com")
        self.assertEqual(pages.page("/api/data/teams?id=9770", max_age_days=7).html, "{}")
        self.assertEqual(network.urls, ["https://www.fotmob.com/api/data/teams?id=9770"])
        with self.assertRaises(tm_fetch.Blocked):
            for path in ("/a", "/b"):
                try:
                    pages.page(path, max_age_days=7)
                except tm_fetch.FetchError:
                    pass

    def test_a_good_answer_resets_the_count_of_refusals(self) -> None:
        refusals = [Answer(429)] * (tm_fetch.BLOCKED_IN_A_ROW - 1)
        network = Recorder(*refusals, Answer(200), *refusals, Answer(200))
        pages = fetcher(self.cache, network)
        for path in ("/a", "/b", "/c", "/d"):
            try:
                pages.page(path, max_age_days=7)
            except tm_fetch.FetchError:
                pass
        self.assertEqual(network.answers, [])

    def test_refusals_from_the_image_host_do_not_stop_the_run(self) -> None:
        network = Recorder(*[Answer(403)] * (2 * tm_fetch.ATTEMPTS))
        images = fetcher(self.cache, network)
        for crest in ("/wappen/head/1.png", "/wappen/head/2.png"):
            with self.assertRaises(tm_fetch.FetchError):
                images.image(crest, max_age_days=7)
        self.assertEqual(len(network.urls), 2 * tm_fetch.ATTEMPTS)

    def test_a_page_that_comes_back_wrong_keeps_the_older_cached_copy(self) -> None:
        cached = self.cache / tm_fetch.cache_name("/a")
        cached.write_text("<p>squad</p>")
        network = Recorder(Answer(200, b"<p>robot check</p>"))
        page = fetcher(self.cache, network).page("/a", max_age_days=0, is_valid=lambda html: "squad" in html)
        self.assertEqual(page.html, "<p>squad</p>")

    def test_offline_reads_old_cached_pages_and_never_asks_the_site(self) -> None:
        (self.cache / tm_fetch.cache_name("/a")).write_text("<p>old</p>")
        network = Recorder()
        pages = fetcher(self.cache, network, is_offline=True)
        self.assertEqual(pages.page("/a", max_age_days=0).html, "<p>old</p>")
        with self.assertRaises(tm_fetch.FetchError):
            pages.page("/missing", max_age_days=7)
        self.assertEqual(network.urls, [])

    def test_does_not_cache_an_image_that_does_not_decode(self) -> None:
        network = Recorder(Answer(200, b"<html>blocked</html>"))
        with self.assertRaises(tm_fetch.FetchError):
            fetcher(self.cache, network).image("/wappen/head/31.png", max_age_days=7)
        self.assertFalse((self.cache / "images" / "wappen-head-31.png").exists())

    def test_downloads_again_a_cached_image_that_does_not_decode(self) -> None:
        cached = self.cache / "images" / "wappen-head-31.png"
        cached.parent.mkdir()
        cached.write_bytes(b"<html>blocked</html>")
        network = Recorder(Answer(200, tiny_png(3, 4)))
        file, _ = fetcher(self.cache, network).image("/wappen/head/31.png", max_age_days=7)
        self.assertEqual(file.read_bytes(), tiny_png(3, 4))


if __name__ == "__main__":
    unittest.main()
