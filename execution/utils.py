import re

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "zh-HK,zh;q=0.9,en;q=0.8",
}


def fetch_text(url, timeout=30):
    resp = requests.get(url, headers=HEADERS, timeout=timeout)
    resp.raise_for_status()
    if resp.encoding and resp.encoding.lower() in ("iso-8859-1", "ascii", "windows-1252"):
        if len(resp.content) < 2_000_000:
            resp.encoding = resp.apparent_encoding
    return resp.text


def html_to_text(html):
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "iframe", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator="\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def get_meta(soup, names):
    for name in names:
        tag = soup.find("meta", attrs={"property": name}) or soup.find("meta", attrs={"name": name})
        if tag and tag.get("content"):
            return tag["content"].strip()
    return None
