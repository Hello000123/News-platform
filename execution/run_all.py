import fcntl
import json
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import article_scraper
import config
import feed_parser
import listing_scraper
import upload_to_r2
import utils

BASE_DIR = Path(__file__).resolve().parent.parent
TMP_DIR = BASE_DIR / ".tmp"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "scraper.db"


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS seen (source TEXT, article_id TEXT, scraped_at TEXT, PRIMARY KEY(source, article_id))"
    )
    conn.commit()
    return conn


def is_seen(conn, source, article_id):
    return (
        conn.execute(
            "SELECT 1 FROM seen WHERE source=? AND article_id=?", (source, article_id)
        ).fetchone()
        is not None
    )


def mark_seen(conn, source, article_id):
    conn.execute(
        "INSERT OR IGNORE INTO seen (source, article_id, scraped_at) VALUES (?, ?, ?)",
        (source, article_id, datetime.now(timezone.utc).isoformat()),
    )


def merge_non_empty(target, scraped):
    existing_body = str(target.get("content_text") or "").strip() or utils.html_to_text(
        target.get("content_html", "")
    )
    scraped_body = str(scraped.get("content_text") or "").strip() or utils.html_to_text(
        scraped.get("content_html", "")
    )
    existing_length = len(re.sub(r"\s+", "", existing_body))
    scraped_length = len(re.sub(r"\s+", "", scraped_body))
    if scraped_body and scraped_length > existing_length:
        target["content_text"] = scraped_body
        if str(scraped.get("content_html") or "").strip():
            target["content_html"] = scraped["content_html"]
    elif existing_body:
        target["content_text"] = existing_body

    for key, value in scraped.items():
        if key in ("content_html", "content_text"):
            continue
        if value is not None and (not isinstance(value, str) or value.strip()):
            target[key] = value


def normalize_item(source_key, item):
    article_id = str(item.get("id") or "").strip()
    title = str(item.get("title") or "").strip()
    url = str(item.get("url") or "").strip()
    content_text = str(item.get("content_text") or "").strip()
    missing = [
        name
        for name, value in (
            ("article id", article_id),
            ("title", title),
            ("URL", url),
            ("article text", content_text),
        )
        if not value
    ]
    if missing:
        raise ValueError(f"missing {', '.join(missing)}")
    comparable_title = re.sub(r"[^\w]+", "", title, flags=re.UNICODE).casefold()
    comparable_body = re.sub(r"[^\w]+", "", content_text, flags=re.UNICODE).casefold()
    if comparable_title and comparable_body == comparable_title:
        raise ValueError("article text only repeats the title")
    return {
        "id": f"{source_key}-{article_id}",
        "article_id": article_id,
        "source": source_key,
        "title": title,
        "url": url,
        "author": item.get("author"),
        "published_at": item.get("published_at"),
        "content_html": item.get("content_html", ""),
        "content_text": content_text,
        "image_url": item.get("image_url"),
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }


def merge_article_lists(new_articles, existing_articles):
    merged = []
    seen = set()
    for article in [*new_articles, *existing_articles]:
        key = (article.get("source"), str(article.get("article_id") or article.get("id") or ""))
        if key in seen:
            continue
        seen.add(key)
        merged.append(article)
    return merged


def write_merged_articles(path, new_articles):
    existing = []
    if path.exists():
        try:
            parsed = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(parsed, list):
                existing = parsed
        except (OSError, ValueError):
            existing = []
    merged = merge_article_lists(new_articles, existing)
    path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    return merged


def handle_feed(source_key, source_cfg, conn, max_items, delay):
    items = feed_parser.parse_feed(source_cfg["feed_url"], max_items=max_items)
    selectors = source_cfg.get("article_selectors", {})
    threshold = source_cfg.get("min_content_chars", 0)
    articles = []
    for item in items:
        article_id = item.get("id") or item.get("url")
        if not article_id:
            print("  [warn] feed entry without an id or URL was skipped")
            continue
        item["id"] = article_id
        if is_seen(conn, source_key, article_id):
            continue
        feed_html = item.get("content_html", "")
        needs_scrape = not source_cfg.get("content_in_feed") or len(feed_html) < threshold
        if needs_scrape and selectors.get("content"):
            try:
                scraped = article_scraper.scrape_article(
                    item["url"],
                    selectors,
                    known_published_at=item.get("published_at"),
                    known_author=item.get("author"),
                )
                merge_non_empty(item, scraped)
                time.sleep(delay)
            except Exception as exc:
                print(f"  [warn] scrape failed {item['url']}: {exc}")
        item["content_text"] = item.get("content_text") or utils.html_to_text(
            item.get("content_html", "")
        )
        try:
            articles.append(normalize_item(source_key, item))
        except ValueError as exc:
            print(f"  [warn] invalid article skipped {item.get('url')}: {exc}")
    return articles


def handle_listing(source_key, source_cfg, conn, max_items, delay):
    urls = listing_scraper.scrape_listing(
        source_cfg["listing_url"],
        source_cfg["link_pattern"],
        max_items=max_items,
        link_exclude=source_cfg.get("link_exclude"),
    )
    selectors = source_cfg.get("article_selectors", {})
    id_re = source_cfg.get("id_regex")
    articles = []
    for url in urls:
        if id_re:
            m = re.search(id_re, url)
            if not m:
                continue
            article_id = m.group(1)
        else:
            article_id = url.rstrip("/").rsplit("/", 1)[-1] or url
        if is_seen(conn, source_key, article_id):
            continue
        try:
            scraped = article_scraper.scrape_article(url, selectors)
        except Exception as exc:
            print(f"  [warn] scrape failed {url}: {exc}")
            continue
        scraped["id"] = article_id
        scraped["content_text"] = scraped.get("content_text") or utils.html_to_text(
            scraped.get("content_html", "")
        )
        try:
            articles.append(normalize_item(source_key, scraped))
        except ValueError as exc:
            print(f"  [warn] invalid article skipped {url}: {exc}")
            continue
        time.sleep(delay)
    return articles


def handle_browser(source_key, source_cfg, conn, max_items, delay):
    try:
        import browser_scraper
    except ImportError:
        raise RuntimeError("playwright not installed — cannot scrape browser sources")

    browser = browser_scraper.Browser()
    try:
        selectors = source_cfg.get("article_selectors", {})
        items = []
        if source_cfg.get("feed_url"):
            feed_html = browser.fetch_html(source_cfg["feed_url"])
            items = feed_parser.parse_feed_text(feed_html, source_cfg["feed_url"], max_items=max_items)
        elif source_cfg.get("listing_url"):
            urls = browser_scraper.scrape_listing_browser(
                browser, source_cfg["listing_url"], source_cfg.get("link_pattern", ""), max_items=max_items
            )
            for url in urls:
                article_id = url.rstrip("/").rsplit("/", 1)[-1] or url
                items.append({"id": article_id, "url": url, "title": None, "author": None, "published_at": None, "content_html": ""})
        articles = []
        for item in items:
            article_id = item.get("id") or item.get("url")
            if not article_id:
                print("  [warn] browser entry without an id or URL was skipped")
                continue
            item["id"] = article_id
            if is_seen(conn, source_key, article_id):
                continue
            scraped = browser_scraper.scrape_article_browser(
                browser,
                item["url"],
                selectors,
                known_published_at=item.get("published_at"),
                known_author=item.get("author"),
            )
            merge_non_empty(item, scraped)
            item["content_text"] = item.get("content_text") or utils.html_to_text(
                item.get("content_html", "")
            )
            try:
                articles.append(normalize_item(source_key, item))
            except ValueError as exc:
                print(f"  [warn] invalid article skipped {item.get('url')}: {exc}")
                continue
            time.sleep(delay)
        return articles
    finally:
        browser.close()


def run_once():
    upload = "--no-upload" not in sys.argv
    settings = config.get_settings()
    sources = config.load_sources()
    conn = init_db()

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    run_dir = TMP_DIR / today
    run_dir.mkdir(parents=True, exist_ok=True)

    all_new = []
    touched_source_paths = []
    for source_key, source_cfg in sources.items():
        if source_cfg.get("disabled"):
            print(f"[scrape] {source_key} ({source_cfg['name']}) — DISABLED: {source_cfg.get('disabled_reason', '')}")
            continue
        print(f"[scrape] {source_key} ({source_cfg['name']})")
        try:
            if source_cfg["type"] in ("rss", "atom"):
                articles = handle_feed(
                    source_key, source_cfg, conn, settings["max_items"], settings["request_delay"]
                )
            elif source_cfg["type"] == "browser":
                articles = handle_browser(
                    source_key, source_cfg, conn, settings["max_items"], settings["request_delay"]
                )
            elif source_cfg["type"] == "listing":
                articles = handle_listing(
                    source_key, source_cfg, conn, settings["max_items"], settings["request_delay"]
                )
            else:
                print(f"  [warn] unknown source type: {source_cfg['type']}")
                continue
        except Exception as exc:
            print(f"  [error] {source_key}: {exc}")
            continue

        if articles:
            path = run_dir / f"{source_key}.json"
            write_merged_articles(path, articles)
            touched_source_paths.append(path)
            print(f"  [{len(articles)} new] -> {path.name}")
            all_new.extend(articles)
        else:
            print("  [0 new]")

    combined_path = run_dir / "combined.json"
    write_merged_articles(combined_path, all_new)

    delivered = False
    upload_failed = False
    if upload and all_new:
        r2_cfg = config.get_r2_config()
        if r2_cfg is None:
            print("[warn] R2 credentials not configured in .env — skipping upload and retaining articles for retry")
        else:
            try:
                client = upload_to_r2.get_client(r2_cfg)
                upload_to_r2.merge_and_upload_json(
                    client, r2_cfg, combined_path, f"news/{today}/combined.json"
                )
                for article_file in touched_source_paths:
                    upload_to_r2.merge_and_upload_json(
                        client,
                        r2_cfg,
                        article_file,
                        f"news/{today}/{article_file.name}",
                    )
                delivered = True
                print(f"[upload] uploaded {len(all_new)} articles to R2")
            except Exception as exc:
                upload_failed = True
                print(f"[error] R2 upload failed; articles remain eligible for retry: {exc}")
    elif not upload and all_new:
        print("[no-upload] articles were written locally and remain eligible for a future delivery run")

    if delivered:
        for article in all_new:
            mark_seen(conn, article["source"], article["article_id"])
        conn.commit()

    print(f"[done] {len(all_new)} new articles")
    conn.close()
    return 1 if upload_failed else 0


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    lock_path = DATA_DIR / "scraper.lock"
    with lock_path.open("a+", encoding="utf-8") as lock_file:
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("[skip] another scraper run is still active")
            return 0
        try:
            return run_once()
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


if __name__ == "__main__":
    sys.exit(main())
