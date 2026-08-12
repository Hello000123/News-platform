# Homepage Page Rules

> These rules extend `../MASTER.md` for the public homepage.

## Structure

- Wide editorial shell with a three-part desktop lead: copy, image, related rail.
- Tablet and mobile collapse the lead into a single reading order: copy, image, related stories.
- Follow with dedicated 科技 and 社企專欄 shelves, then an all-real-post latest stream.
- Real approved posts always take priority; presentation prototypes only fill sparse shelves.

## Visual treatment

- Preserve paper `#f5f2ea`, ink `#1a1a1a`, muted `#817d74`, gold `#b49a5a`, existing serif/sans stacks, square geometry, and fine rules.
- Keep lead headlines prominent without constraining Traditional Chinese to an unnaturally narrow measure.
- Use full-colour editorial placeholders and preserve editor-uploaded photo colour.
- The unwire.hk reference informs hierarchy, archive rhythm, and responsive stacking only.

## Interaction and accessibility

- Header remains in document flow; do not obscure content with a fixed masthead.
- Mobile navigation uses native `details`/`summary` and exposes the same four destinations as desktop.
- Link feedback uses restrained underline/color/filter transitions and honors `prefers-reduced-motion`.
- Keep the skip link, semantic regions, visible focus styles, and 44px mobile targets.

## Responsive checkpoints

- 1440px: copy, media, and related rail align without auto-placement reordering.
- 768px: one-column lead, full headline measure, no horizontal clipping.
- 390px: stacked story modules, compact navigation, no horizontal overflow.
