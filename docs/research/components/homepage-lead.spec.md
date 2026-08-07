# HomepageLead Specification

## Overview
- **Target file:** `components/news/homepage-content.tsx`
- **Screenshot:** `docs/design-references/unwire.hk/erp-business-ai-desktop.png`
- **Interaction model:** static content with link hover/focus states

## DOM Structure
- Lead section → copy column (category, headline, deck, metadata) + image column → two compact supporting stories.

## Reference Measurements
- Reference archive masthead: `146px` tall with `55px` desktop side padding; title span `34px/136px`, weight `600`.
- Reference desktop row uses equal `485px` image/copy columns inside a `970px` rail.

## PressReady Target Styles
- Reuse paper `#f5f2ea`, ink `#1a1a1a`, muted `#817d74`, gold `#b49a5a`, and existing serif/sans variables.
- Homepage shell remains capped by the current `--page-width`; lead image uses `16 / 10` and `object-fit: cover`.
- Headline is an `h1` with the current serif display treatment; no new card radius or shadow.

## States and Behaviors
- Headline and image are one navigational destination with independent, visible focus treatment.
- Images reserve their aspect ratio to avoid layout shift and lazy-load except for the lead.
- Hover applies only a subtle gold underline and grayscale contrast change over `200ms`.

## Responsive Behavior
- Desktop: two columns followed by a full-width supporting-story rail.
- Tablet: equal two columns with reduced gap; hide nonessential key-point density.
- Mobile: copy first, then image, then supporting stories as full-width rows; no horizontal overflow.
