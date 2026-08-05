from urllib.parse import urljoin

from article_scraper import fetch_page


def scrape_listing(listing_url, link_pattern, max_items=30, link_exclude=None):
    soup = fetch_page(listing_url)
    urls = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if link_pattern not in href:
            continue
        if link_exclude and link_exclude in href:
            continue
        absolute = urljoin(listing_url, href)
        if absolute in seen:
            continue
        seen.add(absolute)
        urls.append(absolute)
        if len(urls) >= max_items:
            break
    return urls
