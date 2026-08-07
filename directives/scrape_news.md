# Directive: Scrape Hong Kong Tech News

## Goal
Collect the latest articles from 26 tech news sites (HK + international) and push them to a Cloudflare R2 bucket as JSON, on a recurring 30-minute schedule.

## Sources & Strategies

| Site | Type | Feed | Full content in feed? | Method |
|------|------|------|-----------------------|--------|
| unwire.hk | WordPress | `https://unwire.hk/feed/` | Yes | RSS discovery + scrape page (feed is partial) |
| PCM 電腦廣場 | WordPress | `https://www.pcmarket.com.hk/feed/` | Yes | RSS discovery + scrape page (feed is excerpt only) |
| HKEPC | Custom PHP | `https://www.hkepc.com/feed` (Atom) | No — text summary only | **DISABLED** (see below) |
| ePrice HK | Custom PHP | `https://www.eprice.com.hk/rss/rss.xml` | No — excerpt only | Feed for discovery + scrape article pages |
| DCFever | Custom PHP | **None** | N/A | Scrape news listing + article pages |
| ezone.hk | U Lifestyle | **None** | N/A | Scrape homepage listing (`/article/` links) + pages |
| HK01 科技玩意 | HK01 | **None** | N/A | Scrape tech zone listing + pages (links are percent-encoded) |
| am730 科技 | am730 | **None** | N/A | Scrape tech section listing + pages |
| WinandMac | WordPress | **None** | N/A | Scrape homepage listing (`/YYYY/MM/` posts) + pages |
| on.cc 東方日報 | Oriental Daily | **None** | N/A | Scrape news index listing + pages |
| Qooah | WordPress | `https://qooah.com/feed/` | No | Feed + scrape page (`.td-post-content`) |
| TechRitual | WordPress | `https://techritual.com/feed/` | No | Feed + scrape page (`.td-post-content`) |
| IT之家 | Custom | `https://www.ithome.com/rss/` | Yes | Feed only |
| TechCrunch | WordPress | `https://techcrunch.com/feed/` | No | Feed + scrape page (`.entry-content`) |
| The Verge | Vox | `https://www.theverge.com/rss/index.xml` | No | Feed + scrape page (`article`) |
| Engadget | Vox | `https://www.engadget.com/rss.xml` | No | Feed + scrape page (`article`) |
| 9to5Mac | WordPress | `https://9to5mac.com/feed/` | No | Feed + scrape page (`.entry-content`) |
| 9to5Google | WordPress | `https://9to5google.com/feed/` | No | Feed + scrape page (`.post-content`) |
| Android Police | WordPress | `https://www.androidpolice.com/feed/` | No | Feed + scrape page (`article`) |
| Android Authority | WordPress | `https://www.androidauthority.com/feed/` | No | Feed + scrape page (`main`) |
| Wccftech | WordPress | `https://wccftech.com/feed/` | No | Feed + scrape page (`main`) |
| Tom's Hardware | Future | `https://www.tomshardware.com/feeds/all` | No | Feed + scrape full page body (`#article-body`, with `article` fallback) |
| TechRadar | Future | `https://www.techradar.com/rss` | No | Feed + scrape page (`article`) |
| WIRED | Condé Nast | `https://www.wired.com/feed/rss` | No | Feed + scrape page (`.article__body`) |
| XDA Developers | Valnet | `https://www.xda-developers.com/feed/` | No | Feed + scrape page (`article`) |
| Ars Technica | Condé Nast | `https://feeds.arstechnica.com/arstechnica/index` | Partial | **Feed only** (article pages return HTTP 202 bot challenge) |

**Disabled / excluded sources:**
- **TechRitual** — previously EXCLUDED (403 WAF), but since 2026-07-31 its feed and pages are reachable again via plain HTTP, so it is now ACTIVE. If it goes back behind a WAF, mark `"disabled": true` again.
- **HKEPC** — DISABLED since 2026-07-31. The site moved behind a Cloudflare JS challenge; the entire site (homepage AND feed) returns 403 to non-browser clients. Marked `"disabled": true` in `sources.json`; the feed+scrape code path is ready to re-enable when a headless browser/proxy is available. Revisit only if explicitly requested.

## Tools (scripts in `execution/`)

- `run_all.py` — entry point. Runs all sources, dedupes against SQLite, writes JSON, uploads to R2.
- `feed_parser.py` — generic RSS/Atom parser (fetches via `requests`, parses with `feedparser`).
- `article_scraper.py` — generic article page scraper driven by per-site CSS selectors.
- `listing_scraper.py` — extracts article URLs from a listing page (used by DCFever).
- `upload_to_r2.py` — boto3/S3-compatible client for Cloudflare R2.
- `browser_scraper.py` — **optional** Playwright/headless-Chromium scraper for sources that need JS or pass basic Cloudflare challenges. Used only by `"type": "browser"` sources. Requires `playwright` + `playwright install chromium` (NOT installed in the base container image; import is lazy so plain-HTTP sources run fine without it). Passes simple JS challenges, NOT Cloudflare Turnstile.
- `config.py` — loads `sources.json` and `.env`.
- `utils.py` — shared HTTP headers, HTML→text, meta extraction.

Source definitions and selectors live in **`execution/sources.json`** (data-driven — update selectors there, not in code).

## Run

**Docker (recommended):**
```bash
docker compose up -d --build
```
- Runs once on container start, then every 30 minutes via cron inside the container.
- Scripts/sources are mounted read-only from `./execution` → edits are hot (no rebuild).
- Dedup state persists in `./data` (bind-mounted volume).

**Local test run (no upload):**
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python execution/run_all.py --no-upload
```

## Output Format

Article JSON schema:
```json
{
  "id": "unwire-https://unwire.hk/...",
  "article_id": "<source-specific id>",
  "source": "unwire",
  "title": "...",
  "url": "...",
  "author": "...",
  "published_at": "2026-07-31T00:00:00+00:00",
  "content_html": "...",
  "content_text": "...",
  "image_url": "...",
  "scraped_at": "..."
}
```

R2 key layout:
```
news/YYYY-MM-DD/<source>.json     # per-source articles scraped that run
news/YYYY-MM-DD/combined.json     # all new articles merged
```

## Config (`.env`)

| Variable | Purpose |
|----------|---------|
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 API token (Dashboard → R2 → Manage R2 API Tokens) |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | Bucket name |
| `MAX_ITEMS_PER_SOURCE` | Article cap per source per run (default 20) |
| `REQUEST_DELAY` | Seconds between article page scrapes, politeness (default 1.5) |

If R2 credentials are missing, the run still scrapes and writes locally to `.tmp/` but skips upload (prints a warning). Add `.env` values, then `docker compose restart`.

## Edge Cases & Learnings

- **DCFever has no RSS feed** — must scrape `https://www.dcfever.com/news/index.php` for `readnews.php?id=N` links, then each article page. Article ID is the `id=` param (used for dedup).
- **Listing-page scraping for no-RSS HK sites** — ezone.hk, HK01 科技玩意 and am730 科技 have no feeds but expose static-HTML listing pages (homepage / tech zone / tech section). The `listing` source type scrapes article links from the listing then each article. Use `link_exclude` to skip `/tag/` pages and `id_regex` (extracts the numeric article id AND acts as a filter — non-matching URLs are skipped). Beware percent-encoded Chinese paths: e.g. HK01's `數碼生活` appears as `%E6%95%B8%E7%A2%BC%E7%94%9F%E6%B4%BB` in `href`s — `link_pattern` must match the encoded form.
- **HKEPC Atom feed is text-only** — full content must come from article pages. Feed gives title/date/author.
- **ePrice RSS has excerpts only** — full content from article pages.
- **unwire & PCM feeds only carry excerpts** (PCM ~400 chars, unwire ~3KB) — the full article is scraped from the page. Config uses `min_content_chars` (default 0): if feed content is shorter than the threshold, the article page is scraped. Set it high (5000) to always get full page content.
- **Ads inside article bodies** — WordPress themes inject ad blocks into the content node (PCM `.td-a-ad`, unwire `.google-ad` / `.google-ad-label`). Strip them via the per-source `content_remove` selectors in `sources.json`, which are decomposed before HTML/text extraction.
- **Lazy-loaded images** — DCFever uses `data-src` (lazysizes). Image extraction checks `data-src` before `src`.
- **Cloudflare JS challenges** — sources behind them (TechRitual, HKEPC since 2026-07-31) return 403 to plain HTTP. Don't fight it with header hacks; mark `"disabled": true` in `sources.json` and skip. The scraper logs it as DISABLED and continues.
- **Cloudflare Turnstile cannot be bypassed** — tested HKEPC with Playwright (full Chromium, new headless mode): it serves a Turnstile managed challenge that automation cannot solve. HKEPC therefore stays disabled even with the browser scraper. Do not re-enable unless Turnstile is removed.
- **Browser scraper verified against blocked HK sites (2026-07-31):** Ming Pao (no feed), HK01 (JS-only, links not in initial HTML), am730 (no feed), RingHK (broken SSL cert) — none unlockable. Keep `browser_scraper.py` for future simple-challenge sources; nothing currently uses it.
- **HTTP 202 bot challenges** — Ars Technica returns 202 with an empty body to non-browser clients, so its article pages cannot be scraped. Its feed carries a solid excerpt → configured as feed-only (`content_in_feed: true`, no selectors).
- **Wrong charset declarations** — some sites (on.cc) declare `ISO-8859-1` but serve UTF-8 Chinese, causing mojibake. `utils.fetch_text` overrides to `apparent_encoding` when the declared encoding is one of iso-8859-1/ascii/windows-1252 (guarded to pages < 2MB to avoid slow detection).
- **Broad `article`/`main` selectors** — some sites (Tom's Hardware, TechRadar, Android Police, The Verge, Engadget) yield large content via `article`/`main`; acceptable but may include boilerplate. Tighten with `content_remove` if output looks noisy.
- **Tom's Hardware article body** — its RSS item is only a preview. Scrape `#article-body` before the broad `article` fallback, then remove the utility bar, adverts, video carousel, recirculation links, and newsletter form. This retains the complete report while excluding comments and large unrelated-news sections that otherwise dilute rewrite input.
- **WAF/403** — if a source starts returning 403/429, check its structure changed. If `requests` fails, the source is skipped and logged with `[error]`; the run continues for other sources.
- **Dedup** — SQLite table `seen(source, article_id)` in `data/scraper.db`. Never rescrapes the same article. Delete the `data/` dir to reset and re-scrape.
- **Rate limiting** — `REQUEST_DELAY` sleep between article scrapes. Feeds are fetched once per run, never hammered.

## Self-Anneal Notes
If a site changes layout and returns empty titles/content:
1. Inspect the live page, update selectors in `execution/sources.json`.
2. Re-run locally with `--no-upload`, verify output JSON looks correct.
3. Restart the container (`docker compose restart scraper`).
4. Update this directive with the new selector.
