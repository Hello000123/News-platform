from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from utils import fetch_text, get_meta, html_to_text


def fetch_page(url, timeout=30):
    return BeautifulSoup(fetch_text(url, timeout=timeout), "html.parser")


def _pick(soup, selectors):
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            return el
    return None


def _pick_content(soup, selectors):
    """Choose the fullest configured article container, not the first shell."""
    candidates = []
    seen = set()
    for sel in selectors:
        for el in soup.select(sel):
            marker = id(el)
            if marker in seen:
                continue
            seen.add(marker)
            text_length = len(el.get_text(" ", strip=True))
            candidates.append((text_length, el))
    return max(candidates, key=lambda candidate: candidate[0])[1] if candidates else None


def _public_image_url(page_url, raw_url):
    if not raw_url:
        return None
    absolute = urljoin(page_url, raw_url.strip())
    return absolute if urlparse(absolute).scheme in ("http", "https") else None


def parse_article_soup(soup, url, selectors, known_published_at=None, known_author=None):
    result = {
        "url": url,
        "title": None,
        "content_html": "",
        "content_text": "",
        "image_url": None,
        "author": known_author,
        "published_at": known_published_at,
    }

    title_el = _pick(soup, selectors.get("title", ["h1"]))
    if title_el:
        result["title"] = title_el.get_text(strip=True)

    content_el = _pick_content(soup, selectors.get("content", []))
    if content_el:
        for sel in selectors.get("content_remove", []):
            for el in content_el.select(sel):
                el.decompose()
        result["content_html"] = content_el.decode_contents()
        result["content_text"] = html_to_text(result["content_html"])

    img_el = _pick(soup, selectors.get("image", []))
    if img_el:
        result["image_url"] = _public_image_url(
            url,
            img_el.get("data-src")
            or img_el.get("data-lazy-src")
            or img_el.get("src")
            or img_el.get("href"),
        )
    if not result["image_url"]:
        meta_image = get_meta(
            soup,
            ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"],
        )
        image_link = soup.find("link", rel="image_src")
        result["image_url"] = _public_image_url(
            url,
            meta_image or (image_link.get("href") if image_link else None),
        )

    if not result["author"] and selectors.get("author"):
        author_el = _pick(soup, selectors["author"])
        if author_el:
            result["author"] = author_el.get_text(strip=True)

    if not result["published_at"]:
        result["published_at"] = get_meta(soup, ["article:published_time", "og:published_time"])
    if not result["published_at"] and selectors.get("date"):
        date_el = _pick(soup, selectors["date"])
        if date_el:
            result["published_at"] = date_el.get_text(strip=True)

    return result


def scrape_article(url, selectors, known_published_at=None, known_author=None):
    return parse_article_soup(fetch_page(url), url, selectors, known_published_at, known_author)
