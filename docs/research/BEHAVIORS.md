# Reference Behaviors and PressReady Adaptation

## Source and scope

- Reference: `https://unwire.hk/tag/erp-business-ai/`
- Captured 2026-08-07 at 1440 × 1000, 768 × 1024, and 390 × 844.
- The reference is used for information hierarchy, archive structure, and responsive behavior only. PressReady retains its current paper, ink, gold, serif, and sans-serif visual identity.

## Reference interaction sweep

- The desktop header is fixed at `top: -90px` with a `140px` height, leaving a compact 50px navigation strip visible. Its classes and computed appearance do not change between `scrollY: 0`, `420`, and the bottom of the page.
- The page uses native scrolling: `scroll-behavior: auto`, `scroll-snap-type: none`, no animation-timeline elements, and no detected Lenis/Locomotive class.
- Archive rows are static links. Hovering the title or image produced no visible color, transform, opacity, or filter change.
- Desktop and tablet use two-column image/content rows. Mobile stacks the image above the article metadata and title.
- The mobile menu is click-driven. Activating the 49 × 50px menu control opens a full-viewport `390 × 844px` dark overlay; the category list occupies a 340px content rail and a close control remains at the upper right.
- The tag rail is horizontally clipped/scrollable at smaller widths rather than wrapping into multiple header rows.
- Pagination is click-driven and appears after the article list. No infinite loading was detected.

## Reference responsive measurements

- Desktop 1440px: archive header `1440 × 146`; content list `970px` wide; row `970 × 333.8`; image and copy columns `485 × 272.8`; row padding `30px 0`; copy left padding `30px`.
- Tablet 768px: main side gutters `30px`; row `708 × 260.1`; image and copy columns `354 × 199.1`; two-column layout remains.
- Mobile 390px: archive header `390 × 91`; row `390 × 365.4`; image `390 × 219.4`; copy `390 × 145`; copy padding `0 20px 70px`; title width `350px`, size `20px`, line height `30px`.
- Category label: `14px`, weight `600`; article title: `20px`, weight `600`, desktop line height `29px`; timestamp: `14px`, weight `600`.

## PressReady behavior decisions

- Keep the public header in normal document flow so content is never obscured. Use a native disclosure for the mobile menu, not client-side navigation state.
- Add 180–220ms color/underline/image-filter feedback to links while respecting `prefers-reduced-motion`.
- Use full-colour editorial imagery with the existing gold accent. User-uploaded photos remain visible without a grayscale presentation filter.
- Category links deep-link to `/technology` and `/social-enterprise`; browser back behavior remains native.
- All image upload controls have visible labels, local preview, file constraints beside the input, busy feedback, and an error adjacent to the control.
- All interactive targets are at least 44px on mobile and retain the global visible focus ring.
