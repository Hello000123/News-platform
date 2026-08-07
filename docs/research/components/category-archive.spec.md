# CategoryArchive Specification

## Overview
- **Target files:** `components/news/category-page-content.tsx`, `app/technology/page.tsx`, `app/social-enterprise/page.tsx`
- **Screenshots:** `docs/design-references/unwire.hk/erp-business-ai-desktop.png`, `erp-business-ai-mobile-viewport.png`
- **Interaction model:** static archive navigation

## DOM Structure
- Shared header → category masthead → ordered report list → shared footer.

## Computed Reference Styles
- Masthead desktop: `height: 146px`, `padding: 0 55px`, `border-bottom: 1px solid rgb(226,226,226)`.
- Row desktop: `display:flex`, `width:970px`, `padding:30px 0`, equal image/content columns.
- Row mobile: `display:list-item`, `width:390px`, image `390 × 219.4`, content `390 × 145`, content padding `0 20px 70px`.

## PressReady Target Styles
- Archive masthead uses a gold rule/marker and current serif title rather than reference branding.
- Content rail follows the current `--page-width`; readable list width is capped near `1080px`.
- Each row includes category, public headline, summary, published date, and optional author.

## States and Behaviors
- Native link navigation only; no pagination is required for the initial 100-post repository limit.
- Empty category displays a clear status panel and link back to the homepage.

## Responsive Behavior
- ≥781px: image/copy split, 45/55 ratio, minimum row image aspect 16:9.
- ≤780px: stack image then copy.
- ≤520px: 18px page gutters, 20px headline, 44px archive/back actions.
