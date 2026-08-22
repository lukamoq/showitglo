# ShowItGlo Design System — "The Trading Floor for Conviction"

Rev 1 · 2026-08-22 · Applies to every UI surface in `src/`.

## 1 · Brand identity

**Concept (one sentence):** ShowItGlo is a stock exchange for opinions, so the interface is a
precision market instrument — a dark arena under stage light where the board reads as one ruled
ledger, every number is tabular, and **gold is the only color money makes**.

Personality: confident, dense, financial, theatrical — a Bloomberg terminal staged like a prize
fight. Never playful-pastel, never neon-cyberpunk, never five colors fighting.

- Typeface: **Figtree** (the MomentumQ house face) for *everything*. `font-mono` is a register
  (tabular numerals + tracking), not a different family.
- The memorable thing: the board itself — one glass slab, ruled rows, gold tabular scores,
  a terminal tape of live fights running above it.

## 2 · Color palette

Dark-only by design (an arena at night). Tokens are RGB triples in `globals.css`; Tailwind
exposes them with alpha support. **Never use raw Tailwind palette colors** (`amber-400`,
`cyan-500`, `slate-300`…) in components — only the tokens below.

| Token / class | Value | Role |
|---|---|---|
| `bg` | `#0A0B10` | page ground (aurora + 24px dot lattice painted on body) |
| `panel` | `#131722` @ 0.72 glass | shell surfaces: nav, modals, the board slab |
| `card` | `#181D2A` @ 0.62 glass | nested cards, stat slabs |
| `elevated` | `#232939` | menus, hover fills, solid fallback |
| `line` | `white/0.10` (`line-strong` 0.18) | ALL borders/dividers (`hairline` class) |
| `ink` | `#F6F7FA` | primary text |
| `ink-2` | `#C7CDD8` | secondary text |
| `ink-3` | `#8A92A3` | muted text, labels |
| `gold` | `#F0A824` | **THE accent. Primary CTAs, active states, the #1 rank, brand.** |
| `gold-bright` | `#FFC53D` | hover / gradient end |
| `gold-text` | `#F7B733` | gold as *text/icon* on dark (AA) |
| `up` | `#3DD68C` | semantic only: rank up, settled, balance |
| `down` | `#EF4E66` | semantic only: rank down, fights/counters, destructive |
| `info` | `#5EA0FF` | semantic only: rare informational chips |
| `steel` | `#9AA3B5` | neutral chip/metadata tone |

**Single-accent discipline:** exactly one element per view may be gold-filled (the primary CTA).
`up`/`down`/`info`/`steel` are decoration/semantics and never sit on a button that competes with
the primary. If two things read "click me," demote one to `btn-ghost`.

**Semantic mapping from the old UI:** amber→gold · cyan→steel or info (chips) / ghost (buttons) ·
emerald→up · rose→down · purple→info or steel. Kill gradient text, kill `orb-glow-*`.

## 3 · Typography

Figtree via `next/font` (`--font-figtree`), weights 400–800. Body is 15px/1.55.
`font-variant-numeric: tabular-nums` is set globally — numbers never shimmy.

| Role | Recipe |
|---|---|
| Hero display | `display-hero` class: `clamp(2.4rem, 5.4vw, 4rem)`, weight 750, lh 1.04, ls −0.022em |
| H1 (page title) | `text-3xl font-bold tracking-tight text-ink` (~30px) |
| H2 (section) | `text-xl font-bold tracking-tight text-ink` |
| Card heading | `text-sm font-semibold text-ink` |
| Body | `text-[15px] text-ink-2 leading-relaxed` (measure ≤ `max-w-[62ch]`) |
| Dense/table | `text-dense` (13.5px) |
| Meta | `text-meta` (12.5px) `text-ink-3` |
| Kicker/eyebrow | `.kicker` — 11px, 0.12em tracking, uppercase, 600, `text-ink-3` (gold variant: `.kicker-gold`) |
| Micro label | `.micro-label` — 10px, 0.1em, uppercase, 600 |
| Metric value | `.metric` — weight 800, `tracking-tight`, tabular; sizes `text-2xl`/`text-3xl` |

Hierarchy comes from color (`ink` → `ink-2` → `ink-3`) + weight, not size alone. Weight 800 is
reserved for metric values and the wordmark. Never `font-black` walls of text.

## 4 · Spacing & layout

8pt scale. Page container: `max-w-6xl mx-auto px-4 sm:px-6 lg:px-8`. Section rhythm `py-10`–`py-16`.
Space within a group < space around it. Left-align content; centered layouts only for empty states
and the share card.

**The ledger pattern (the board):** rows live INSIDE one `panel` slab, separated by
`divide-y divide-line` — never as floating individual glass cards. Row hover is a background tint
(`hover:bg-white/[0.04]`), grounded, no levitation. Rank is a fixed-width tabular column; score is
right-aligned gold tabular. Top-3 rows carry a 3px left spine (`gold` for #1, `white/25` for #2,
`gold-deep/60` for #3) — no full golden gradients.

## 5 · Corner radius

Deliberately tighter than before — instruments, not pebbles.
`rounded-control` 10px (buttons, inputs, chips-lg) · `rounded-card` 14px (cards, slabs) ·
`rounded-modal` 20px (modals, drawers) · `rounded-md` 6px (badges). Nested = outer − gap.
No more `rounded-3xl`/`rounded-full` pills except LED dots and avatar-likes.

## 6 · Shadows & surfaces

Three glass recipes only — `.panel`, `.card`, `.sunken` (recessed wells/inputs) — each with
backdrop blur, a 1px `line` border, layered shadow, and an inset top specular. `.hairline-top`
adds the 1px light edge to any element. Do not stack border+shadow+glow ad hoc; pick a recipe.
Colored glows exist ONLY on gold CTAs (`btn-gold`'s ambient shadow) and the #1 rank chip.

## 7 · Core components (classes in `globals.css`)

- `btn` + `btn-gold` (gold gradient, ambient gold shadow, hover −1px, press scale .97)
- `btn-ghost` (glass fill, hairline; the ONLY secondary button)
- `btn-danger` (crimson gradient — counter/fight confirm & destructive only)
- sizes: default / `btn-sm` / `btn-xs`
- `chip` (currentColor-driven tint chip: `chip text-gold-text`, `chip text-up`, `chip text-down`,
  `chip text-info`, `chip text-steel`) — 10.5px uppercase mono register, 6px radius
- `field` (sunken input; focus = gold border + 3px soft gold ring). Labels use `.kicker`.
- `seg` / `seg-item` / `seg-item-active` (segmented filter tabs; active = gold-tinted glass)
- `kicker`, `kicker-gold`, `micro-label`, `metric`, `display-hero`, `tnum`
- `led` (+ `led-gold`/`led-up`/`led-down`): 8px glowing status dot with `pulse-dot`
- `tape` (terminal ticker bar register: `text-dense`, pipe dividers `text-ink-3/60`)
- `reveal-line` masked hero reveal (span-in-span, `line-up` keyframe, stagger via
  `style={{ animationDelay }}`)
- Modals: scrim `bg-[rgba(4,6,12,0.65)] backdrop-blur-md`, shell `panel rounded-modal`,
  enter with `animate-rise`.

## 8 · Motion

One easing: `cubic-bezier(0.23, 1, 0.32, 1)` (`--ease-out`). UI transitions 150–250ms.
Animate only transform/opacity. Hover = `translateY(-1px)` (buttons) or bg tint (rows);
press = `scale(0.97)`. Entrances: `animate-rise` (6px, 220ms). Hero: `reveal-line` stagger
40/130/220ms. Ticker: `marquee` 40s linear. LEDs: `pulse-dot` 2.4s. `prefers-reduced-motion`
kills all of it (fades stay). No spinning sparkles, no `animate-ping`, no bouncy springs.
Confetti (boosts) is retinted gold/white and stays — it's the product's payoff moment.

## 9 · Design rationale

The old UI signaled "AI glassmorphism template": five neon accents, floating glass pebbles,
gradient text, glow orbs. The redesign keeps the drama (dark glass, stage light, live tape,
confetti) but earns credibility the way real market software does: one instrument-panel slab,
ruled hairlines, tabular numerals, a single money-gold accent, and one easing. Inspired by the
rapit-prod console (tone discipline, terminal tape, glass recipes) and vorenq (type scale,
hairline editorial language, aurora + dot lattice, masked reveals, currentColor chips).

### Hard rules for implementers
1. No raw Tailwind palette colors. Tokens only.
2. One gold-filled element per view. Everything else `btn-ghost` or text links.
3. All numbers `tnum` (global anyway); money/scores use `.metric`.
4. Rows in slabs with dividers, not floating cards.
5. Icons: lucide only, `w-4 h-4` default, `strokeWidth` default; icon color follows text color
   (no per-icon rainbow tinting).
6. Keep ALL logic, props, handlers, API calls, and copy meaning unchanged — this is a reskin.
   (Copy may be lightly tightened where it's obviously placeholder-loud, but never renamed
   features.)
7. Every interactive element keeps a visible `:focus-visible` (global ring is provided).
8. Do not add dependencies.
