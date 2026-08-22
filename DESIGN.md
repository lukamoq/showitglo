# ShowItGlo Design System — "The Trading Floor for Conviction"

Rev 2 · 2026-08-22 · Applies to every UI surface in `src/`.

> **What changed in Rev 2 (modernisation pass).** The ground lost its dot lattice, its
> crimson counter-light and its drifting glow orbs; it is now one deep solid slab with a single
> top-edge stage light. Surfaces stopped being translucent glass and became opaque machined
> panels — hairline, layered shadow, 1px specular — with backdrop blur reserved for the two
> places content actually passes behind something (the sticky rail, modal scrims). Radii
> tightened, the gold CTA lost its halo, chips lost their gradient, and factions stopped being
> colour-coded. Figtree is now self-hosted via `next/font` (no runtime call to Google).

## 1 · Brand identity

**Concept (one sentence):** ShowItGlo is a stock exchange for opinions, so the interface is a
precision market instrument — a dark arena under one stage light where the board reads as one
ruled ledger, every number is tabular, and **gold is the only color money makes**.

Personality: confident, dense, financial, theatrical — a Bloomberg terminal staged like a prize
fight. Never playful-pastel, never neon-cyberpunk, never five colors fighting.

- Typeface: **Figtree** (the MomentumQ house face) for *everything*, self-hosted at build time
  through `next/font/google` in `src/app/layout.tsx` and exposed as `--font-figtree`.
  `font-mono` is a register (tabular numerals + tracking), not a different family.
  **Never add a runtime `<link>` to fonts.googleapis.com** — it leaks every visitor's IP to
  Google and costs two render-blocking round trips.
- The memorable thing: the board itself — one ruled slab, gold tabular scores, one gold spine on
  rank #1, a terminal tape of live fights running above it.

## 2 · The ground

One deep solid base (`--bg` `#090A0E`) and **exactly one atmospheric device**: a fixed radial
gold wash on the top edge, painted by `body::before` at `z-index:-1` (620px tall, peak
`gold/0.085`, gone by 72%). Nothing else is painted on the ground.

Explicitly retired and not to return: the `--dot` radial-gradient lattice, the bottom-right
crimson counter-light, and the `.orb` / `.orb-glow-*` blurred drifting circles.

Because `body::before` sits at `z-index:-1`, page wrappers need no stacking context. **Never
hard-code a background or text colour on `<body>`** in `layout.tsx` — a Tailwind utility there
silently outranks the token layer.

## 3 · Color palette

Dark-only by design (an arena at night). Tokens are RGB triples in `globals.css`; Tailwind
exposes them with alpha support. **Never use raw Tailwind palette colors** (`amber-400`,
`cyan-500`, `slate-300`…) in components — only the tokens below.

| Token / class | Value | Role |
|---|---|---|
| `bg` | `#090A0E` | page ground (solid + the single top-edge gold wash) |
| `bg-sunken` | `#050609` | recessed wells: inputs, meters, segmented tracks |
| `panel` | `#12141B` opaque | shell surfaces: the board slab, modals, section panels |
| `card` | `#161921` opaque | nested readouts, stat slabs |
| `elevated` | `#20242F` | menus, hover fills |
| `line` | `white/0.08` (`line-strong` 0.16) | ALL borders/dividers |
| `ink` | `#F4F6FA` | primary text |
| `ink-2` | `#BEC4D0` | secondary text |
| `ink-3` | `#828996` | muted text, labels (AA on `bg` at body sizes) |
| `gold` | `#F0A824` | **THE accent. Primary CTA, rank #1, the leading side.** |
| `gold-bright` | `#FFC53D` | hover / gradient top |
| `gold-text` | `#F7B733` | gold as *text/icon* on dark (AA) |
| `up` | `#3DD68C` | semantic only: credits in the ledger, confirmations |
| `down` | `#EF4E66` | semantic only: rank down, counters/fights, destructive |
| `info` | `#5EA0FF` | semantic only: rare informational chips |
| `steel` | `#9AA3B5` | neutral chip/metadata tone |

**Single-accent discipline.** At most one gold-filled element per view, plus the rail's global
`Post Stance` CTA. Everything else is `btn-ghost`, `btn-bare` or a text link. If two things read
"click me," demote one.

**Ranking beats hue.** Where several items compete (debate factions, the two sides of a fight),
the one *in front* carries gold and the rest step down a neutral ladder
(`bg-ink/45 → /28 → /18 → /12`). Green-for-side-A / red-for-side-B is banned: it is five
saturated hues fighting for attention, and it implies a right and a wrong side — the judgement
this product refuses to make.

## 4 · Typography

Figtree via `next/font` (`--font-figtree`), weights 300–900. Body is 15px/1.6, `-0.011em`.
`font-variant-numeric: tabular-nums` is set globally — numbers never shimmy.

| Role | Recipe |
|---|---|
| Hero display | `.display-hero` — `clamp(2.75rem, 6.2vw, 4.75rem)`, weight 700, lh 1.0, ls −0.032em |
| Page title | `.display-2` — `clamp(1.875rem, 3.4vw, 2.625rem)`, weight 700, lh 1.08, ls −0.026em |
| Section heading | `.display-3` — 20px, weight 700, ls −0.018em |
| Lead paragraph | `.lead` — 16px/1.65, `ink-2`, measure 56ch |
| Card heading | `text-[15px] font-semibold text-ink` |
| Body | `text-[15px] text-ink-2 leading-relaxed` (measure ≤ `max-w-[62ch]`) |
| Dense/table | `text-dense` (13.5px) |
| Meta | `text-meta` (12.5px) `text-ink-3` |
| Kicker/eyebrow | `.kicker` — 11px, 0.1em tracking, uppercase, 600, `ink-3` (gold: `.kicker-gold`) |
| Micro label | `.micro-label` — 10px, 0.09em, uppercase, 600 |
| Metric value | `.metric` — weight 700, ls −0.025em, tabular |

Hierarchy comes from color (`ink` → `ink-2` → `ink-3`) + weight + space, not size alone.
Headlines are **one weight (700) and tightly tracked**, never `font-black`.
Long titles get a `max-w-[22ch]`–`[24ch]` measure so a hero never runs the full slab width.

## 5 · Spacing & layout

8pt scale. Page container: `max-w-6xl mx-auto px-4 sm:px-6 lg:px-8`. Page top rhythm
`pt-14 sm:pt-20`; section rhythm `mt-10`–`mt-14`. Space within a group < space around it.
Left-align content; centered layouts only for empty states, error panels and the share card.

**The ledger pattern (the board, the fights list, the dashboard tables, the debate roster):**
rows live INSIDE one `.panel` slab, under a `micro-label` column rule that names the grammar
once, separated by `divide-y divide-line` — never as floating individual cards, and never
repeating a "Score:" label on every row. Row hover is a background tint
(`hover:bg-white/[0.03]`), grounded, no levitation. Rank is a fixed-width tabular column; score
is right-aligned tabular. **Only rank #1 carries a spine** — a 2px gold rule; a spine on the top
three turned the ledger back into a stack of accented cards.

Grids of readouts (market terminal, dashboard stats, post metrics) are **one slab divided by
hairlines** (`.cell` + `border-r`/`border-b`), not N floating cards.

## 6 · Corner radius

`rounded-control` **8px** (buttons, inputs, chips-lg) · `rounded-card` **12px** (cards, slabs) ·
`rounded-modal` **16px** (modals, drawers) · `rounded-md` 6px, `chip` 5px (badges).
Nested = outer − gap. No `rounded-2xl`/`rounded-3xl`; `rounded-full` only for LED dots and
avatar-likes.

## 7 · Surfaces & elevation

Four recipes, no ad-hoc stacking of border + shadow + glow:

- `.panel` — opaque `panel`, hairline, `--shadow-3` + specular. The instrument slab.
- `.card` — opaque `card`, hairline, `--shadow-2` + specular. Nested readouts.
- `.sunken` — `bg-sunken/85`, faint hairline, **inset** shadow. Wells, inputs, meter tracks.
- `.glass` — the *only* backdrop-blurred recipe, for the sticky rail and modal chrome, where
  content genuinely passes behind. Static panels are opaque; that is what reads crisp.

Elevation tokens `--shadow-1…4` are layered (3 stops, one light source, real vertical offset,
opacity falling with height). `--specular` is the 1px top highlight; `.hairline-top` applies it
alone. **Colored glows are gone** — including the gold halo the primary CTA used to throw.

## 8 · Core components (classes in `globals.css`)

- `btn` + `btn-gold` (flat machined gold, oklab two-stop, 1px specular, no halo; press scale .97)
- `btn-ghost` (hairline glass fill — the standard secondary)
- `btn-bare` (no chrome until hover — the tertiary/quiet register)
- `btn-danger` (crimson — counter/fight confirm & destructive only)
- sizes: default / `btn-sm` / `btn-xs`; on `pointer: coarse` every button gets a 40–44px
  min target
- `chip` (currentColor tint, flat fill + one hairline ring: `chip text-gold-text`, `text-up`,
  `text-down`, `text-info`, `text-steel`) and `chip-quiet` (no fill — counts, neutral metadata)
- `field` (sunken input; focus = gold border + 3px soft gold ring). Labels use `.kicker`.
- `seg` / `seg-item` / `seg-item-active` (filter tabs; active is a **neutral** raised fill, not
  a gold one — gold stays on the CTA)
- `cell` (a ruled cell in a slab-grid readout)
- `kicker`, `kicker-gold`, `micro-label`, `metric`, `display-hero`, `display-2`, `display-3`,
  `lead`, `tnum`, `tape`, `no-scrollbar`
- `led` (+ `led-gold`/`led-up`/`led-down`): 7px status dot, opacity pulse only — no ping halo
- `reveal-line` masked hero reveal (span-in-span, `line-up` keyframe 0.8s `cubic-bezier(0.16,1,0.3,1)`,
  stagger via `style={{ animationDelay }}`)
- Modals: scrim `bg-[rgba(3,4,8,0.72)] backdrop-blur-md`, shell `panel rounded-modal`,
  enter with `animate-rise`.

## 9 · Motion

One easing: `cubic-bezier(0.23, 1, 0.32, 1)` (`--ease-out`); the hero reveal uses
`cubic-bezier(0.16, 1, 0.3, 1)`. UI transitions 150–250ms. Animate only transform/opacity
(meters animate `width` deliberately and are the sole exception). Hover = background tint;
press = `scale(0.97)`. Entrances: `animate-rise` (6px, 220ms). Hero: `reveal-line` stagger
50/150/250ms. Ticker: `marquee` 40s linear. LEDs: `pulse-dot` 2.8s.
`prefers-reduced-motion` kills all of it. No `animate-ping`, no spinning sparkles, no springs.
Confetti (boosts) is retinted gold/white and stays — it is the product's payoff moment.

## 10 · Honest data

The live-presence badge (`LiveVisitorsBadge`) renders the **real** count from
`GET /api/v1/live/stats` (heartbeats in the last 90s, so the viewer counts themselves once
their own heartbeat lands) as an LED + tabular number. When the endpoint is unavailable it
**unmounts** rather than showing a placeholder — a fabricated "12 online" is the fastest way to
lose a visitor's trust. The same rule holds anywhere else a number could be faked.

Counts that can be 1 are pluralised inline (`backer{n === 1 ? '' : 's'}`); "1 backers" is a bug.

## 11 · Design rationale

The pre-Rev-1 UI signaled "AI glassmorphism template": five neon accents, floating glass pebbles,
gradient text, glow orbs. Rev 1 imposed the token layer. Rev 2 removed what was left of the
costume: the dotted wallpaper, the aurora, the orbs, the CTA halo, the gradient chips, and the
habit of blurring every surface whether or not anything was behind it. What remains earns
credibility the way real market software does — one instrument slab, ruled hairlines, tabular
numerals, a single money-gold accent, one easing, and a lot more negative space.

### Hard rules for implementers
1. No raw Tailwind palette colors. Tokens only.
2. One gold-filled element per view (plus the rail CTA). Everything else ghost/bare/text.
3. All numbers `tnum` (global anyway); money/scores use `.metric`.
4. Rows in slabs with dividers and one column rule — not floating cards, not repeated labels.
5. Ranked sets: leader gets gold, the rest get the neutral ladder. Never hue-per-item.
6. Icons: lucide only, `w-3.5 h-3.5`–`w-4 h-4`, default `strokeWidth`, `aria-hidden` when the
   label is adjacent; icon color follows text color (no per-icon rainbow tinting).
7. Keep ALL logic, props, handlers, API calls, and copy meaning unchanged when reskinning.
   (Copy may be lightly tightened; never rename features.)
8. Every interactive element keeps a visible `:focus-visible` (global ring is provided) and an
   accessible name — icon-only controls need `aria-label`, not just `title`.
9. Do not add dependencies.
10. No page may reintroduce a background pattern, a blurred orb, or a second atmospheric layer.
