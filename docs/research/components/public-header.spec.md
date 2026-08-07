# PublicHeader Specification

## Overview
- **Target file:** `components/news/editorial-public-chrome.tsx`
- **Screenshots:** `docs/design-references/unwire.hk/erp-business-ai-desktop.png`, `erp-business-ai-mobile-menu.png`
- **Interaction model:** static desktop navigation; click-driven native mobile disclosure

## DOM Structure
- Skip link → utility strip → masthead containing brand, primary navigation, edition → category/topic rail → mobile disclosure menu.

## Computed Reference Measurements
- Reference header: fixed, `1440 × 140px`, `top: -90px`, white background, no shadow.
- Mobile menu/search targets: `49 × 50px`; menu overlay: `390 × 844px`, `rgb(32,32,32)`.
- Reference category rail is one line and does not wrap.

## PressReady Target Styles
- Preserve `.news-v1-page-shell`, paper background, ink text, gold accents, serif brand, and fine ink rules.
- Desktop masthead minimum height remains `82px`; primary category links are 首頁, 科技, 社企專欄, 最新短訊.
- Admin shortcuts stay secondary and never displace the public categories.
- Mobile summary/control is at least `44 × 44px`; the opened menu is paper colored with rule-separated links, not the reference dark theme.

## States and Behaviors
- Desktop link hover: gold underline with `180ms ease`; focus uses the global 3px ring.
- Mobile disclosure closed/open states use native `<details>` semantics and a visible label; no JavaScript state.
- `prefers-reduced-motion` removes transitions.

## Responsive Behavior
- 1440/1024: centered three-part masthead and inline navigation.
- 768: brand and edition on first row, public links on second.
- 390: compact brand/edition plus one menu control; menu links stack full width without horizontal scrolling.
