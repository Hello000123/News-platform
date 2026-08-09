import io
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from bs4 import BeautifulSoup

EXECUTION_DIR = Path(__file__).resolve().parents[1]
if str(EXECUTION_DIR) not in sys.path:
    sys.path.insert(0, str(EXECUTION_DIR))

import article_scraper
import run_all
import upload_to_r2


class FakeR2Client:
    def __init__(self, remote_articles):
        self.remote_articles = remote_articles
        self.puts = []

    def get_object(self, Bucket, Key):
        del Bucket, Key
        return {
            "Body": io.BytesIO(
                json.dumps(self.remote_articles, ensure_ascii=False).encode("utf-8")
            )
        }

    def put_object(self, **kwargs):
        self.puts.append(kwargs)


class ScraperPipelineTests(unittest.TestCase):
    def test_article_page_uses_generic_meta_image_and_resolves_relative_url(self):
        soup = BeautifulSoup(
            """
            <html><head><meta property="og:image" content="/images/hero.webp"></head>
            <body><h1>Article headline</h1><article><p>Complete article body.</p></article></body></html>
            """,
            "html.parser",
        )

        result = article_scraper.parse_article_soup(
            soup,
            "https://publisher.example/news/story",
            {"title": ["h1"], "content": ["article"]},
        )

        self.assertEqual(result["image_url"], "https://publisher.example/images/hero.webp")
        self.assertEqual(result["content_text"], "Complete article body.")

    def test_failed_empty_page_scrape_does_not_erase_usable_feed_content(self):
        connection = sqlite3.connect(":memory:")
        connection.execute(
            "CREATE TABLE seen (source TEXT, article_id TEXT, scraped_at TEXT, PRIMARY KEY(source, article_id))"
        )
        feed_item = {
            "id": "story-1",
            "title": "Feed headline",
            "url": "https://publisher.example/story-1",
            "author": "Feed author",
            "published_at": "2026-08-09T00:00:00Z",
            "content_html": "<p>Usable feed article text.</p>",
            "image_url": "https://publisher.example/feed-image.webp",
        }
        empty_scrape = {
            "url": feed_item["url"],
            "title": None,
            "content_html": "",
            "content_text": "",
            "image_url": None,
            "author": None,
            "published_at": None,
        }
        source = {
            "feed_url": "https://publisher.example/feed.xml",
            "content_in_feed": False,
            "article_selectors": {"content": ["article"]},
        }

        with (
            patch.object(run_all.feed_parser, "parse_feed", return_value=[feed_item]),
            patch.object(run_all.article_scraper, "scrape_article", return_value=empty_scrape),
            patch.object(run_all.time, "sleep"),
        ):
            articles = run_all.handle_feed("publisher", source, connection, 20, 0)

        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0]["title"], "Feed headline")
        self.assertEqual(articles[0]["content_text"], "Usable feed article text.")
        self.assertEqual(
            articles[0]["image_url"], "https://publisher.example/feed-image.webp"
        )
        connection.close()

    def test_invalid_empty_article_is_rejected_before_export(self):
        with self.assertRaisesRegex(ValueError, "article text"):
            run_all.normalize_item(
                "publisher",
                {
                    "id": "story-1",
                    "title": "Headline",
                    "url": "https://publisher.example/story-1",
                    "content_text": "",
                },
            )

    def test_local_daily_output_accumulates_and_deduplicates_articles(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "combined.json"
            older = {"source": "one", "article_id": "1", "title": "Older"}
            newer = {"source": "two", "article_id": "2", "title": "Newer"}

            run_all.write_merged_articles(path, [older])
            merged = run_all.write_merged_articles(path, [newer, older])

            self.assertEqual(merged, [newer, older])
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), [newer, older])

    def test_r2_daily_output_merges_remote_articles_instead_of_overwriting_them(self):
        remote = [{"source": "one", "article_id": "1", "title": "Remote article"}]
        local = [
            {"source": "two", "article_id": "2", "title": "Local article"},
            {"source": "one", "article_id": "1", "title": "Updated local copy"},
        ]
        client = FakeR2Client(remote)
        cfg = {"bucket": "news-bucket"}

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "combined.json"
            path.write_text(json.dumps(local), encoding="utf-8")
            count = upload_to_r2.merge_and_upload_json(
                client, cfg, path, "news/2026-08-09/combined.json"
            )
            uploaded = json.loads(client.puts[0]["Body"].decode("utf-8"))

        self.assertEqual(count, 2)
        self.assertEqual(uploaded, local)

    def test_failed_r2_upload_does_not_mark_articles_seen(self):
        article = {
            "id": "publisher-story-1",
            "article_id": "story-1",
            "source": "publisher",
            "title": "Headline",
            "url": "https://publisher.example/story-1",
            "author": None,
            "published_at": None,
            "content_html": "<p>Body.</p>",
            "content_text": "Body.",
            "image_url": None,
            "scraped_at": "2026-08-09T00:00:00+00:00",
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            temporary_root = Path(temp_dir)
            with (
                patch.object(run_all, "TMP_DIR", temporary_root / ".tmp"),
                patch.object(run_all, "DATA_DIR", temporary_root / "data"),
                patch.object(run_all, "DB_PATH", temporary_root / "data" / "scraper.db"),
                patch.object(run_all.sys, "argv", ["run_all.py"]),
                patch.object(
                    run_all.config,
                    "get_settings",
                    return_value={"max_items": 20, "request_delay": 0},
                ),
                patch.object(
                    run_all.config,
                    "load_sources",
                    return_value={
                        "publisher": {
                            "name": "Publisher",
                            "type": "rss",
                            "feed_url": "https://publisher.example/feed.xml",
                        }
                    },
                ),
                patch.object(run_all.config, "get_r2_config", return_value={"bucket": "x"}),
                patch.object(run_all, "handle_feed", return_value=[article]),
                patch.object(run_all.upload_to_r2, "get_client", return_value=object()),
                patch.object(
                    run_all.upload_to_r2,
                    "merge_and_upload_json",
                    side_effect=RuntimeError("upload unavailable"),
                ),
                patch.object(run_all, "mark_seen") as mark_seen,
            ):
                result = run_all.main()

        self.assertEqual(result, 1)
        mark_seen.assert_not_called()

    def test_overlapping_scheduled_run_is_skipped(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with (
                patch.object(run_all, "DATA_DIR", Path(temp_dir)),
                patch.object(run_all.fcntl, "flock", side_effect=BlockingIOError),
                patch.object(run_all, "run_once") as run_once,
            ):
                result = run_all.main()

        self.assertEqual(result, 0)
        run_once.assert_not_called()


if __name__ == "__main__":
    unittest.main()
