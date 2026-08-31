# Design — Wink

A locked design system for this app. Every screen reads this file before it
changes. Extend or amend it; do not re-pick per screen.

## Genre

modern-minimal — a workspace, not a landing page. Function carries the screen.

## Direction

Solid surfaces, hairline rules, one accent used as a highlighter. No gradient
washes, no glassmorphism, no gradient text, no decorative blur. The identity
comes from typographic rhythm, tight radii, and a graphite chrome that gets out
of the way of the conversation.

## Macrostructure family

- App shell (sidebar · canvas · inspector): **Workbench**. Flush panels divided
  by hairline rules, no floating cards. Chrome is quiet; content is the figure.
- Empty state / landing: **Stat-Led** — one declarative line, a short lede, four
  entry actions, real counts from local storage. No hero art.
- Settings: **Long Document** — a left rail of sections, one column of rows.

## Theme

Light is the default. Dark keeps the same anchor hue; only lightness and chroma
move.

| token | light | dark |
| --- | --- | --- |
| `--color-paper` | `oklch(97.6% 0.004 75)` | `oklch(15.5% 0.006 75)` |
| `--color-paper-2` | `oklch(99.2% 0.003 75)` | `oklch(19% 0.006 75)` |
| `--color-paper-3` | `oklch(95% 0.005 75)` | `oklch(23% 0.007 75)` |
| `--color-ink` | `oklch(20% 0.008 60)` | `oklch(95.5% 0.004 80)` |
| `--color-ink-2` | `oklch(46% 0.008 65)` | `oklch(70% 0.006 75)` |
| `--color-rule` | `oklch(89% 0.006 75)` | `oklch(28% 0.007 75)` |
| `--color-accent` | `oklch(55% 0.17 30)` | `oklch(66% 0.15 32)` |
| `--color-focus` | same as accent | same as accent |

Accent budget: **≤ 3 % of any viewport**. It marks the active row, the focus
ring, the send affordance, a live stream, and link hover. It never fills a
section, never fades into a second colour.

Primary buttons are **ink-filled**, not accent-filled. The accent is a signal,
the ink is the action.

## Typography

Apple's system stack, single family, at deliberate extremes.

- Display: `-apple-system, "SF Pro Display", system-ui` · 600 · tracking `-0.024em`
- Body: same stack · 400/500 · tracking `-0.006em`
- Mono (outlier, two roles only — model ids and numeric readouts): `ui-monospace, "SF Mono"`
- Scale: 1.25 ratio anchored at 15 px body. Display `clamp(2.1rem, 4.2vw, 3.2rem)`.
- Measure: 68ch on prose.

## Shape

| element | radius |
| --- | --- |
| controls, chips, rows | 10 px |
| cards, panels, popovers | 14 px |
| send button, primary pill | 999 px |

Borders are `1px solid var(--color-rule)`. Shadows only on layers that actually
float (popovers, dialogs, toasts): `0 1px 2px` + `0 8px 24px -12px` at ≤ 12 %.

## Spacing

4-point named scale, tokens in `tokens.css`. Screens use `var(--space-*)`.

## Motion

- Easings: `--ease-out cubic-bezier(0.22, 1, 0.36, 1)`, `--ease-in-out cubic-bezier(0.4, 0, 0.2, 1)`.
- Durations: 120 ms (state), 200 ms (layer), 320 ms (panel width).
- Reveal pattern: none. Messages appear; they do not fly in.
- Reduced motion: opacity only, ≤ 120 ms.

## Microinteractions stance

- Silent success. Toasts only for outcomes the user cannot see.
- Hover tooltips delay 500 ms; focus tooltips 0 ms.
- Streaming shows a live caret, not a spinner.

## CTA voice

- Primary: ink fill, white label, pill, verb-first ("Connect a provider").
- Secondary: bordered, paper fill, 10 px radius.

## Per-screen allowances

- App screens: no enrichment, no illustration.
- Empty state: typography and real local counts only.

## What screens MUST share

The wordmark (ink text + one accent square), the accent placement rules, the
system font stack, hairline rules over shadows, and the 10/14 px radius pair.
