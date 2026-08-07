# PressReady Newsroom Design System

> Page-specific rules in `pages/` override this file. This system documents the
> product's existing editorial identity; reference sites inform structure and
> responsive behavior only.

## Direction

- Style: print-inspired editorial grid, quiet and information-dense.
- Personality: trustworthy, deliberate, Hong Kong newsroom—not a rounded SaaS dashboard.
- Geometry: square corners, fine rules, restrained shadows, generous reading measure.
- Motion: subtle 180–220ms feedback only; no parallax or scroll-hijacking.

## Core tokens

| Role | Value | Use |
| --- | --- | --- |
| Paper | `#f5f2ea` | Public page background |
| Ink | `#1a1a1a` | Headlines, body, primary actions |
| Muted ink | `#817d74` | Secondary metadata |
| Gold | `#b49a5a` | Kicker labels, focus/accent details |
| Rule | `rgba(26, 26, 26, 0.22)` | Dividers and editorial grid lines |
| Error | `#8f2f24` | Destructive and validation states |

Keep contrast at or above WCAG AA. Gold is decorative or paired with an
accessible text color; it is not used alone for small body copy.

## Typography

- Editorial display: Baskerville, Iowan Old Style, Songti TC, or the existing serif fallback stack.
- Interface and metadata: Arial, PingFang TC, Microsoft JhengHei, or the existing sans-serif stack.
- Do not add remote font dependencies.
- Traditional Chinese headlines use compact line lengths and relaxed line height; metadata remains uppercase/letterspaced where already established.

## Spacing and layout

- Use an 8px spacing rhythm with 16, 24, 32, 48, and 64px section steps.
- Public content uses the existing wide page shell and fine ruled grid.
- Desktop may use asymmetric editorial columns; tablet collapses to one primary column; mobile stacks media above copy.
- Keep article reading text within a comfortable measure and prevent horizontal overflow at 390px.

## Components

### Header and navigation

- Keep the PressReady wordmark and paper/ink palette.
- Desktop shows the primary category links; mobile uses a native disclosure menu.
- All links and controls have a visible focus ring and at least a 44px mobile target.

### Story cards and archive rows

- Use image-led, ruled editorial rows instead of elevated rounded cards.
- Images use consistent aspect ratios and `object-fit: cover`.
- Hover feedback is limited to underline, color, or a restrained image treatment; do not shift layout.
- Real approved posts take priority. Prototype content may fill homepage presentation modules but never appears in permanent category archives.

### Forms and buttons

- Inputs are square, full-width where space is constrained, and keep visible labels.
- Primary buttons use ink with paper text; secondary buttons use transparent paper with an ink rule.
- Disabled and busy states must be explicit and preserve layout.
- Image upload shows constraints, preview, replace/remove actions, and an adjacent error message.

### Empty, error, and loading states

- Preserve the editorial frame and explain the next useful action.
- Loading indicators use text or restrained native progress; avoid large decorative spinners.
- Empty category archives link back to the homepage.

## Accessibility and responsive rules

- Keep the skip link and semantic heading hierarchy.
- Use native links, buttons, selects, details/summary, and file inputs where possible.
- Never communicate category, publication, validation, or error state by color alone.
- Respect `prefers-reduced-motion` and avoid autoplay movement.
- Verify 1440px, 768px, and 390px layouts with no horizontal overflow.

## Anti-patterns

- No copied reference-site branding, logos, colors, imagery, or typefaces.
- No rounded card grids, glassmorphism, gradient-heavy surfaces, or decorative dashboard chrome.
- No hidden labels, emoji icons, layout-shifting hover transforms, or low-contrast metadata.
- No infinite scroll or custom scroll behavior for public archives.

## Delivery checklist

- Current PressReady paper/ink/gold identity is intact.
- Public homepage, article, 科技, and 社企專欄 pages share one visual system.
- Admin post editing supports headline, body, category, and featured photo.
- Uploaded photos can be previewed, replaced, removed, and rendered publicly.
- Focus, keyboard, reduced-motion, empty, error, and responsive states are verified.
