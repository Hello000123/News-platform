import calendar
from datetime import datetime, timezone

import feedparser

from utils import fetch_text


def _iso(entry):
    for key in ("published_parsed", "updated_parsed"):
        st = entry.get(key)
        if st:
            return datetime.fromtimestamp(calendar.timegm(st), tz=timezone.utc).isoformat()
    return entry.get("published") or entry.get("updated")


def parse_feed_text(text, feed_url, max_items=20):
    feed = feedparser.parse(text)
    if feed.bozo and not feed.entries:
        raise RuntimeError(f"Could not parse feed for {feed_url}: {feed.bozo_exception}")
    items = []
    for entry in feed.entries[:max_items]:
        content = entry.get("content")
        content_html = content[0].get("value", "") if content else entry.get("summary", "")
        items.append(
            {
                "id": entry.get("id") or entry.get("guid") or entry.get("link"),
                "title": entry.get("title"),
                "url": entry.get("link"),
                "author": entry.get("author"),
                "published_at": _iso(entry),
                "content_html": content_html or "",
            }
        )
    return items


def parse_feed(feed_url, max_items=20):
    return parse_feed_text(fetch_text(feed_url), feed_url, max_items=max_items)
