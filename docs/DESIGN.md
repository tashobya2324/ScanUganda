# ScanUganda: Design Guide

Goal: a sleek, modern product that looks designed by a person for a specific job, not generated. Applies to the PWA, the console and the USSD copy. Tokens are implemented once (task P0-4) and used everywhere; no one-off values in components.

## 1. Principles

1. **The verdict is the product.** On the PWA the result is readable at arm's length in sunlight in under a second. Everything else is secondary.
2. **Calm, confident, plain.** Few elements, generous space, one accent. Information density in the console, sparseness in the PWA.
3. **Say it plainly.** Real words and real data ("1 kg packet, batch KS-2408-17, Jinja"), never filler.
4. **Never colour alone.** Verdicts also differ by shape, word and icon (circle/GENUINE, diamond/CHECK, octagon/STOP), for colour-blind users and bright light.
5. **Built for weak conditions.** Cheap Android phones, slow data, one hand, outdoors.

## 2. What to avoid (the "AI look")

- Purple/blue/pink gradients, glowing orbs, mesh backgrounds, glassmorphism everywhere.
- Emoji as icons or decoration; sparkle icons.
- Grids of identical rounded cards with an icon on top and a three-word title.
- Hero text like "Welcome to…", "Seamless", "Empower", "Unlock", "Revolutionize". No lorem ipsum, no "John Doe".
- Everything rounded with the same large radius; shadows on everything; centered text blocks.
- Default stock fonts used with default weights; random font mixes.
- Decorative animation that delays the user.
If a component looks like it could belong to any app, it is not specific enough.

## 3. Colour

Neutral, warm, restrained. All pairs must meet WCAG AA (4.5:1 text, 3:1 large text and UI).

| Token | Light | Use |
|---|---|---|
| `--bg` | `#F7F5F0` | page background (warm off-white) |
| `--surface` | `#FFFFFF` | panels, sheets |
| `--ink` | `#16181A` | primary text |
| `--ink-2` | `#5B6168` | secondary text |
| `--line` | `#E4E0D6` | borders, dividers |
| `--accent` | `#0F5C47` | primary actions, links, focus (deep green) |
| `--accent-ink` | `#FFFFFF` | text on accent |
| `--genuine` | `#117A4A` | verdict: genuine |
| `--check` | `#9A5B00` | verdict: check (darkened from #B26A00 to reach 4.5:1 on white) |
| `--stop` | `#B3261E` | verdict: stop |

Verdict screens may fill the background with the verdict colour; everywhere else colour is used sparingly. Dark theme: same roles remapped, designed, not auto-inverted; contrast re-checked. Finalise exact values in P0-4 and record them here.

## 4. Typography

- **UI and body:** one humanist or grotesque sans with a real character, self-hosted (works offline): propose **Instrument Sans** or **Geist**. Avoid Inter and system-default-only stacks.
- **Codes, batch numbers, figures:** a monospace with tabular numbers (**JetBrains Mono** or **Geist Mono**). Codes are shown in groups of four.
- Scale (px): 12, 14, 16, 20, 24, 32, 48. Body 16 minimum on the PWA. Line height 1.5 body, 1.15 headings. Weights: 400, 500, 600 only. Sentence case everywhere; no all-caps except the verdict word and small labels with letter-spacing.
- Max line length ~65 characters.

## 5. Layout, shape, depth

- 4 px spacing grid; use 4, 8, 12, 16, 24, 32, 48, 64.
- Radii: 6 px controls, 12 px sheets and panels, full only for pills and avatars. Shadow: one soft elevation for floating sheets; otherwise 1 px `--line` borders.
- PWA: single column, bottom navigation (≤ 4 items), primary action reachable by thumb, touch targets ≥ 48 px.
- Console: left rail navigation, top bar with search and account, content max width 1280 px. Tables are first-class: sortable, sticky header, tabular numbers, row hover, keyboard navigable.

## 6. Icons and imagery

One icon set, one stroke weight (1.75 px, rounded caps), 24 px grid, as inline SVG. No emoji. Product imagery: real packaging shapes or clean placeholders in `--line` tone, not stock photos. The map uses muted OpenStreetMap tiles with our verdict colours for markers.

## 7. Motion

Purposeful and short: 150–220 ms ease-out for state changes; the verdict reveal may take up to 400 ms. Scanning shows one clear progress cue. Respect `prefers-reduced-motion` (replace motion with instant state changes). No looping decoration.

## 8. States and content

Every screen defines **loading** (skeleton, not spinner-only), **empty** (what to do next), **error** (what happened and how to recover, no blame), **offline** (persistent but quiet banner; what works, what is queued) and **permission denied** (camera, location: explain why, offer manual entry).

Copy: short, active, specific ("This batch was recalled on 18 Feb 2025" not "An issue was detected"). Support English and Luganda; keep strings short, avoid text baked into images.

## 9. Accessibility checklist (per UI task)

- Keyboard-only usable; visible focus ring (`--accent`, 2 px, offset 2 px).
- Semantic HTML; labels on every input; `aria-live` for verdict and status changes.
- Contrast AA verified; zoom to 200 % without loss.
- Works with `prefers-reduced-motion` and in dark theme.

## 10. USSD copy

≤ 160 characters per screen, numbered options, no jargon:

```
CON ScanUganda
1. Check a product
2. Report a product
3. Language
```
```
CON Enter the 12-digit code under the scratch layer:
```
```
END GENUINE. Kakira Sugar 1kg, batch KS-2408-17. Safe to buy.
```
```
END STOP. This batch was recalled. Do not buy or use it.
```
Verdict word first, then product, then action.

## 11. Review checklist for UI PRs

- [ ] Uses tokens only; no new colours, fonts or one-off spacing.
- [ ] Screenshots attached: mobile (360 px wide) and desktop, light and dark where relevant.
- [ ] All states in §8 present.
- [ ] §2 "avoid" list checked.
- [ ] §9 accessibility checklist run.
