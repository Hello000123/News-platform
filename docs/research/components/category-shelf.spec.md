# CategoryShelf Specification

## Overview
- **Target file:** `components/news/homepage-content.tsx`
- **Screenshot:** `docs/design-references/unwire.hk/erp-business-ai-tablet-viewport.png`
- **Interaction model:** static list and navigation links

## DOM Structure
- Section masthead with category marker/title/count/link → featured image-led report → supporting report list.

## Reference Measurements
- Desktop archive row: `970 × 333.8px`, two equal `485px` columns, `30px` vertical padding, 1px bottom rule.
- Tablet archive row: `708 × 260.1px`, equal `354px` columns.
- Category label `14px/600`; article title `20px/29px/600`; age `14px/600`.

## PressReady Target Styles
- Gold marker replaces the reference green dot; current paper, ink, muted, serif, and rule tokens remain unchanged.
- Shelf heading uses the existing numbered editorial heading pattern and a text link to the archive.
- Images retain their full colour on the homepage; uploaded colour is not altered in storage or presentation.

## States and Behaviors
- Every story title and image is a deep link; category action links to its archive.
- Link hover/focus is visible without moving layout.

## Responsive Behavior
- Desktop: two category shelves may share a two-column grid, each internally image-led.
- Tablet: each shelf spans the page and uses reference-style 50/50 rows.
- Mobile: image stacks above copy; `20px` side padding, 16:9 image, rule between stories.
