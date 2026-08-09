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
| on.cc 東方日報 | Oriental Daily | **None** | N/A | **DISABLED** (see below) |
| Qooah | WordPress | `https://qooah.com/feed/` | No | Feed + scrape page (`.td-post-content`) |
| TechRitual | WordPress | `https://techritual.com/feed/` | No | **DISABLED** (see below) |
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
- **TechRitual** — DISABLED as of 2026-08-09. Its feed again returns an HTTP 403 Cloudflare challenge to the plain-HTTP scraper. Keep it disabled until the feed is directly retrievable.
- **HKEPC** — DISABLED since 2026-07-31. The site moved behind a Cloudflare JS challenge; the entire site (homepage AND feed) returns 403 to non-browser clients. Marked `"disabled": true` in `sources.json`; the feed+scrape code path is ready to re-enable when a headless browser/proxy is available. Revisit only if explicitly requested.
- **on.cc** — DISABLED as of 2026-08-09. Article bodies are now rendered client-side; the static response contains a title/teaser but none of the configured body selectors returns usable article text. Re-enable only after adding a verified browser-based extraction path.

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

**Deterministic regression tests:**
```bash
python -m unittest discover -s execution/tests -v
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
news/YYYY-MM-DD/<source>.json     # cumulative per-source articles for that UTC day
news/YYYY-MM-DD/combined.json     # cumulative deduplicated articles for that UTC day
```

Per-source keys are cumulative for the UTC day as well. Each upload merges the
local batch with the existing R2 array, so a later 30-minute run cannot erase
articles uploaded by an earlier run.

## Config (`.env`)

| Variable | Purpose |
|----------|---------|
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 API token (Dashboard → R2 → Manage R2 API Tokens) |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | Bucket name |
| `MAX_ITEMS_PER_SOURCE` | Article cap per source per run (default 20) |
| `REQUEST_DELAY` | Seconds between article page scrapes, politeness (default 1.5) |

If R2 credentials are missing, the run still scrapes and writes locally to `.tmp/` but skips upload (prints a warning). Those articles are not marked as seen, so they remain eligible for delivery after credentials are added. Add `.env` values, then `docker compose restart`.

## Edge Cases & Learnings

- **DCFever has no RSS feed** — must scrape `https://www.dcfever.com/news/index.php` for `readnews.php?id=N` links, then each article page. Article ID is the `id=` param (used for dedup).
- **Listing-page scraping for no-RSS HK sites** — ezone.hk, HK01 科技玩意 and am730 科技 have no feeds but expose static-HTML listing pages (homepage / tech zone / tech section). The `listing` source type scrapes article links from the listing then each article. Use `link_exclude` to skip `/tag/` pages and `id_regex` (extracts the numeric article id AND acts as a filter — non-matching URLs are skipped). Beware percent-encoded Chinese paths: e.g. HK01's `數碼生活` appears as `%E6%95%B8%E7%A2%BC%E7%94%9F%E6%B4%BB` in `href`s — `link_pattern` must match the encoded form.
- **HKEPC Atom feed is text-only** — full content must come from article pages. Feed gives title/date/author.
- **ePrice RSS has excerpts only** — full content from article pages.
- **unwire & PCM feeds only carry excerpts** (PCM ~400 chars, unwire ~3KB) — the full article is scraped from the page. Config uses `min_content_chars` (default 0): if feed content is shorter than the threshold, the article page is scraped. Set it high (5000) to always get full page content.
- **Ads inside article bodies** — WordPress themes inject ad blocks into the content node (PCM `.td-a-ad`, unwire `.google-ad` / `.google-ad-label`). Strip them via the per-source `content_remove` selectors in `sources.json`, which are decomposed before HTML/text extraction.
- **Lazy-loaded images** — DCFever uses `data-src` (lazysizes). Image extraction checks `data-src` before `src`.
- **Featured images** — page scraping falls back to `og:image`, `twitter:image`, and `link[rel=image_src]` when no site-specific image selector is configured. Feed parsing also preserves Media RSS thumbnails/content and image enclosures. Relative page image URLs are resolved against the article URL.
- **Empty, stale, or partial page selectors** — evaluate every matching configured content selector and keep the container with the most readable text; the first match can be a mobile shell or teaser. Never replace a longer usable feed body with a shorter page scrape. Records without an ID, title, URL, or article text beyond a repeated headline are logged and skipped before export, preventing one broken source row from invalidating the whole UI import.
- **Full feed bodies** — the web feed parser keeps `<description>`/Atom `<summary>` as the preview and stores RSS `<content:encoded>` or Atom `<content>` separately as `source_text` (up to 50,000 characters). A later feed fetch or scraper import backfills an existing URL only when the recovered body is longer, so partial historical rows self-heal without creating duplicates.
- **Web article extraction completeness** — publisher theme state classes such as `desktop-fixed-header`, `tdc-header-template`, and `tdc-footer-template` may appear on `<body>`; never reject the structural root because those class names mention page chrome. Prefer a credible `article-body`, `article-content`, `entry-content`, or `post-content` container over its outer page shell, but require enough text/coverage that a tiny teaser cannot win. Preserve list/preformatted blocks, compare structured paragraphs with the fuller rendered candidate, and use Schema.org JSON-LD `articleBody` when it contains a more complete report.
- **Large publisher pages and read-through caching** — bounded article retrieval permits up to 5 MB and 15 seconds because modern pages such as TechRadar exceed the former 1.5 MB limit before non-article application state is removed. After the content API successfully retrieves a live body, save only that body to `source_text` without changing the editorial `updated_at`; never cache an RSS preview as full content. A title-only live shell is an extraction failure and falls back to the clearly identified preview path rather than being accepted as a full report.
- **Cloudflare JS challenges** — sources behind them (TechRitual, HKEPC since 2026-07-31) return 403 to plain HTTP. Don't fight it with header hacks; mark `"disabled": true` in `sources.json` and skip. The scraper logs it as DISABLED and continues.
- **Cloudflare Turnstile cannot be bypassed** — tested HKEPC with Playwright (full Chromium, new headless mode): it serves a Turnstile managed challenge that automation cannot solve. HKEPC therefore stays disabled even with the browser scraper. Do not re-enable unless Turnstile is removed.
- **Browser scraper verified against blocked HK sites (2026-07-31):** Ming Pao (no feed), HK01 (JS-only, links not in initial HTML), am730 (no feed), RingHK (broken SSL cert) — none unlockable. Keep `browser_scraper.py` for future simple-challenge sources; nothing currently uses it.
- **HTTP 202 bot challenges** — Ars Technica returns 202 with an empty body to non-browser clients, so its article pages cannot be scraped. Its feed carries a solid excerpt → configured as feed-only (`content_in_feed: true`, no selectors).
- **Feed-preview rewrite fallback** — when the website cannot retrieve a feed-only article page, it may use the saved RSS preview so the Top 5 batch can continue. A headline-sized preview is not treated as a full report: the rewrite route automatically switches a requested detailed article to a brief and forbids invented padding. Full scraper text or sufficiently detailed related reports keep the detailed mode.
- **Recurring guide headlines are not duplicates by template alone** — daily puzzle stories such as Connections, Quordle, and Strands can share the same “hints and answers” wording, date, and game-number format while covering different games. The Top 5 title matcher must compare the guide subject before clustering these reports; publisher aliases such as `NYT` and `New York Times` may still describe the same guide.
- **Persistent rewrite diagnostics** — every pipeline rewrite records a sanitized success or failure entry in D1 for 30 days. Use the pipeline’s “Open rewrite debug log” link or `GET /api/pipeline/rewrite-debug?limit=50` to inspect the debug ID, batch, article, model/provider, source origin and character counts, correction attempts, validation code/details, HTTP status, and duration. Never persist source text, generated candidate text, stack traces, or credentials in this log; only candidate length and quotation issue kinds/counts are retained.
- **Top 5 bounded recovery, atomicity, and idempotency** — each story may make one fresh request after an explicitly retryable API/model/validation failure. Reuse the same `debugBatchId`. Commit the canonical rewrite, every selected duplicate merge, and the authoritative user/batch/article idempotency record in one D1 transaction; if any selected article changed while the model was running, commit none of them. If the first request committed but its HTTP response was lost, return the already-saved rewrite from that idempotency record without charging another model request or overwriting the draft. Debug logging remains best-effort diagnostics and must never be required for correctness. After both focused model corrections, a headline-bounded pipeline draft may deterministically omit an optional body sentence only when unsupported numbers are the sole remaining failure, the headline is already safe, and at least two complete safe body sentences remain; rerun every language, term, numeric, format, and quotation check afterward. Never remove or alter an unsafe headline automatically.
- **Localized numeric-fact normalization** — source feeds may use Simplified classifiers such as `个`, `项`, `种`, `间`, and `辆`, while the Traditional Chinese rewrite correctly converts them to `個`, `項`, `種`, `間`, and `輛`. Numeric fidelity checks must normalize both scripts to the same semantic unit; otherwise supported facts such as `250个` → `250個`, `9个` → `9個`, or `一项` → `一項` are falsely rejected as invented numbers. A modifier may sit between the number and classifier: normalize `一整套` to the same fact as `一套`, and `2500 多个` to the same count as `超過2500個`. English technical counts such as `256 P-Cores`, `nine Chromium processes`, and `two VCCGT phases` must map to localized item classifiers or technical nouns. Product/version identifiers (`Windows 11`, `WinUI 3`, `Xe3P`, `RDNA 3.5`) must remain untyped identifiers so a following word such as `天氣` is not mistaken for a unit. Keep the classifier allowlist conservative and regression-test new entries, because broad entries such as `張` or `輪` can incorrectly make incidental singular wording mandatory (`一張相片`) or treat prose such as `新一輪` as an invented count. Focused correction prompts must include the backend diagnostic's exact failing values and units; if a model inferred a count from an unnumbered list (for example `三套配置`), instruct it to remove the count and retain the listed items rather than retrying from a generic error code.
- **Wrong charset declarations** — some sites (on.cc) declare `ISO-8859-1` but serve UTF-8 Chinese, causing mojibake. `utils.fetch_text` overrides to `apparent_encoding` when the declared encoding is one of iso-8859-1/ascii/windows-1252 (guarded to pages < 2MB to avoid slow detection).
- **Broad `article`/`main` selectors** — some sites (Tom's Hardware, TechRadar, Android Police, The Verge, Engadget) yield large content via `article`/`main`; prefer a nested explicit body when it retains a credible share of the outer text. This keeps the complete article while excluding comments, account prompts, and latest-story recirculation. Tighten `content_remove` if the publisher-specific Python output still looks noisy.
- **Tom's Hardware article body** — its RSS item is only a preview. Scrape `#article-body` before the broad `article` fallback, then remove the utility bar, adverts, video carousel, recirculation links, and newsletter form. This retains the complete report while excluding comments and large unrelated-news sections that otherwise dilute rewrite input.
- **WAF/403** — if a source starts returning 403/429, check its structure changed. If `requests` fails, the source is skipped and logged with `[error]`; the run continues for other sources.
- **Dedup and delivery durability** — SQLite table `seen(source, article_id)` in `data/scraper.db`. An article is marked seen only after the combined and all touched per-source R2 objects upload successfully. Failed, skipped, or `--no-upload` deliveries remain eligible for retry. Local and R2 daily arrays are merged by `(source, article_id)` so retries are idempotent. Delete the `data/` dir to reset and re-scrape.
- **Overlapping cron runs** — `run_all.py` holds a non-blocking file lock at `data/scraper.lock`. If a previous 30-minute run is still active, the next invocation logs `[skip]` and exits successfully instead of racing SQLite or overwriting an R2 merge.
- **Rate limiting** — `REQUEST_DELAY` sleep between article scrapes. Feeds are fetched once per run, never hammered.

## Self-Anneal Notes
If a site changes layout and returns empty titles/content:
1. Inspect the live page, update selectors in `execution/sources.json`.
2. Re-run locally with `--no-upload`, verify output JSON looks correct.
3. Restart the container (`docker compose restart scraper`).
4. Update this directive with the new selector.
