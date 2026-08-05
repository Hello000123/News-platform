import sys
from pathlib import Path
from urllib.parse import urljoin

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bs4 import BeautifulSoup

from article_scraper import parse_article_soup
from utils import HEADERS

CHALLENGE_MARKERS = (
    "cf-browser-verification",
    "Just a moment",
    "challenge-platform",
    "請稍候",
    "Please wait",
)


class Browser:
    def __init__(self, headless=True):
        from playwright.sync_api import sync_playwright

        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(
            headless=headless,
            channel="chromium",
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        self._context = self._browser.new_context(
            user_agent=HEADERS["User-Agent"],
            locale="zh-HK",
            viewport={"width": 1280, "height": 900},
        )

    def fetch_html(self, url, timeout=45000):
        page = self._context.new_page()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=timeout)
            for _ in range(6):
                page.wait_for_timeout(3000)
                html = page.content()
                if not any(m in html for m in CHALLENGE_MARKERS):
                    return html
            return page.content()
        finally:
            page.close()

    def close(self):
        try:
            self._browser.close()
        finally:
            self._pw.stop()


def scrape_article_browser(browser, url, selectors, known_published_at=None, known_author=None):
    soup = BeautifulSoup(browser.fetch_html(url), "html.parser")
    return parse_article_soup(soup, url, selectors, known_published_at, known_author)


def scrape_listing_browser(browser, listing_url, link_pattern, max_items=30):
    soup = BeautifulSoup(browser.fetch_html(listing_url), "html.parser")
    urls = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if link_pattern not in href:
            continue
        absolute = urljoin(listing_url, href)
        if absolute in seen:
            continue
        seen.add(absolute)
        urls.append(absolute)
        if len(urls) >= max_items:
            break
    return urls
