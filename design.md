# Design: Wink

A locked design system for this app. Every screen reads this file before it
changes. Extend or amend it; do not re-pick per screen.

## Genre

system-native: a workspace that behaves like part of the operating system.
Function carries the screen; material carries the hierarchy.

## Direction

**Two grounds, never one.** A cool grey *field* carries the window chrome; a
near-white *sheet* carries everything you read. Chrome is translucent and blurs
what passes behind it. Content is opaque; text never sits on a blur.

The identity comes from that separation, from a 1 px specular edge on every
pane, and from hairlines instead of boxes. No gradients anywhere, no coloured
glows, no gradient text. Colour is rationed: a rare warm accent against neutral
chrome, plus five semantic hues that each mean something.

## Macrostructure family

- App shell: **Floating Workbench**. Sidebar and inspector are translucent
  panes flush to the window edge; the conversation is an inset white sheet with
  an 18 px radius, a hairline, and a soft shadow, separated from the chrome by
  a 10 px gap of visible field.
- The header is a **glass bar** pinned inside the sheet. The transcript
  scrolls behind it and is visibly frosted by it. This is the system's
  signature moment; nothing else may imitate it.
- The composer is pinned to the same sheet and shares its ground
  (`sheet-foot`): no tint, no rule, and a 24 px fade above it so the
  transcript dissolves into it.
- Empty state / landing: **Stat-Led**. One declarative line, a short lede,
  entry actions, real counts from local storage. No hero art.
- Settings: **Long Document**. A left rail of sections, one column of rows,
  on an overlay pane.

## Theme

Light is the default. Dark keeps the same anchor hue; only lightness and chroma
move.

| token | light | dark |
| --- | --- | --- |
| `--canvas` (field) | `oklch(93.6% 0.004 262)` | `oklch(13.2% 0.006 262)` |
| `--paper` (sheet) | `oklch(99.4% 0.0012 262)` | `oklch(20.2% 0.006 262)` |
| `--paper-2` (control) | `oklch(100% 0 0)` | `oklch(24% 0.007 262)` |
| `--paper-3` (well) | `oklch(96.4% 0.004 262)` | `oklch(28% 0.008 262)` |
| `--ink` | `oklch(19% 0.009 262)` | `oklch(96% 0.003 262)` |
| `--ink-2` | `oklch(48.5% 0.008 262)` | `oklch(71.5% 0.007 262)` |
| `--hairline` | ink @ 10 % | white @ 11 % |
| `--accent-solid` | `oklch(55% 0.17 30)` | `oklch(68% 0.15 32)` |

In dark the field sits **below** the sheet; in light it sits **above** it in
value. Either way the two must stay at least four lightness points apart, or
the whole depth model collapses.

Accent budget: **≤ 2 % of any viewport**. It marks the send affordance, the
streaming caret, the focus ring, link hover, and the wordmark square. It never
fills a section, never tints a row, never fades into a second colour. An active
row is a raised white pill on the chrome, not a coloured one.

Primary buttons are **ink-filled**, not accent-filled.

## Materials

Three glass materials. Each is a tint plus a blur plus a specular top edge.

| utility | where | tint | blur |
| --- | --- | --- | --- |
| `glass` | sidebar, inspector (over the field) | white 62 % / dark white 4.5 % | 40 px |
| `glass-bar` | header (over the sheet) | field 24 % / dark field 28 % | 40 px |
| `glass-overlay` | dialogs, menus, palette, toasts | white 82 % / dark grey 72 % | 48 px |

All three add `saturate(180%)`; without it a frosted surface goes grey and
dead. All three fall back to opaque `--shell` where `backdrop-filter` is
unsupported. Never nest one glass surface inside another.

Opaque surfaces are `panel` (paper-2 + hairline + shadow-1) and `panel-2`
(paper-3 + hairline). Anything holding running text uses these.

## Typography

Apple's system stack, single family, at deliberate extremes.

- Stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display"`,
  falling back to bundled Figtree Variable off Apple platforms.
- `font-optical-sizing: auto`, so SF picks Text below 20 px and Display above.
- Tracking is paired to size, not set once: display `-0.026em`, title
  `-0.018em`, body `-0.008em`. Tight display tracking on caption text is what
  turns small UI into mush; nothing below 14 px goes tighter than the body.
- **Every size is a whole pixel.** The scale is 10 / 11 / 12 / 13 / 14 / 15 /
  16 / 17 / 19, anchored at 16 px body, with display
  `clamp(2.25rem, 4.4vw, 3.25rem)`. Half-pixel sizes rasterise inconsistently
  on a 1x display and read as jitter; never reintroduce one.
- Grayscale antialiasing (`-webkit-font-smoothing: antialiased`) is opted into
  only above 2dppx. Forcing it on a 1x panel discards subpixel rendering and
  SF's thin stems go fuzzy. `text-rendering` stays at the default.
- Mono (outlier, three roles only: model ids, code, numeric readouts):
  `ui-monospace, "SF Mono"`, always `tabular-nums`, tracking 0.
- Measure: 68ch on prose.

## Shape

| element | radius |
| --- | --- |
| icon buttons, menu rows, list rows | 9–10 px |
| inputs, chips, cards | 10–16 px |
| content sheet, message bubbles, reasoning blocks | 18 px |
| dialogs and sheets | 22 px |
| composer island | 20 px |
| send button, primary pill | 999 px |

Borders are `1px solid var(--hairline)`. Shadows carry an offset and a soft
blur, in three steps (`--shadow-1/2/3`); a zero-offset halo is never a shadow.

## Spacing

4-point named scale, tokens in `tokens.css`. Screens use `var(--space-*)`.

## Motion

- Easings: `--ease-out cubic-bezier(0.32, 0.72, 0, 1)` (the system curve),
  `--ease-in-out`, and `--ease-arrive cubic-bezier(0.16, 1, 0.3, 1)`, a sharper
  deceleration for things that arrive rather than change. No overshoot: the
  system never bounces.
- Durations: 140 ms (state), 240 ms (layer), 380 ms (panel width).
- Layers arrive **out of focus and resolve**: `layer-in` animates blur,
  opacity and scale together. This is the one authored moment; nothing else
  animates on entry.
- Every control uses `press` (colour + shadow + transform) and, where it is a
  discrete target, `press-active` (scale 0.96).
- Messages appear; they do not fly in.
- Reduced motion, and the in-app effects budget, cut animation to ≤ 0.01 ms.

## Microinteractions stance

- Silent success. Toasts only for outcomes the user cannot see.
- Hover tooltips delay 500 ms; focus tooltips 0 ms.
- Streaming shows a live caret, not a spinner.

## CTA voice

- Primary: ink fill, white label, pill, verb-first ("Connect a provider").
- Secondary: hairline border, paper-2 fill, 10 px radius.

## Browser surfaces

Selection, caret, scrollbars, focus rings, `kbd`, underline offset and tabular
numerals are all themed from the palette. They are part of the design, not
defaults to inherit.

## Per-screen allowances

- App screens: no enrichment, no illustration.
- Empty state: typography and real local counts only.

## What screens MUST share

The two grounds, the three glass materials and their blur values, the specular
edge, the wordmark (ink text + one accent square), the accent placement rules,
the system font stack with size-paired tracking, hairlines over boxes, and the
9/18/22 px radius family.
