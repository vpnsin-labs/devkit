---
name: design-craft
description: >-
  Elevate the user experience and visual design of the site. Use when polishing
  UI, redesigning a page or section, adding motion/micro-interactions, tightening
  typography/spacing/color, or auditing design quality. Runs three activity sets —
  Define (taste & design language), Design (layout/type/color/space), Polish
  (motion & micro-interactions) — then a Review gate. Works on Next.js + Tailwind
  sites. Synthesises three skills: emilkowalski/skill, pbakaus/impeccable, and
  Leonxlnx/taste-skill.
---

# Design Craft

A three-phase protocol for making interfaces that feel **considered, premium, and
alive** — not generic AI "slop". It unifies three sources:

- **emilkowalski/skill** (`emil-design-eng`) — motion, micro-interaction, and the
  invisible details that compound. _"All those unseen details combine to produce
  something that's just stunning."_
- **pbakaus/impeccable** — design quality, consistency, and a concrete anti-pattern
  catalogue. Plan (shape) before you build.
- **Leonxlnx/taste-skill** — anti-slop framework: infer the brief, tune taste dials,
  map a coherent design system before coding.

**Taste is trained, not innate.** Study great work, reverse-engineer why it feels
right, and apply the concrete rules below rather than defaulting to the obvious.

## How to use this skill

- **Full redesign of a page/section** → run Activity Sets 1 → 2 → 3, then Review.
- **Visual tweak** (spacing/type/color) → Activity Set 2 + Review.
- **Add/refine motion** → Activity Set 3 + Review.
- **"Make this feel better" / audit** → Review gate first to find issues, then the
  relevant set to fix them.

Always **read the component and match the surrounding conventions** before editing,
and always finish with the Review gate. On these sites: Tailwind utilities + theme
tokens, `next/image`, mobile-first; verify at the dev server and keep
`type-check` / `lint` / `build` green.

---

## Activity Set 1 — Define (taste & design language)

_Establish intent before touching code (impeccable: context-first; taste: infer the brief)._

1. **State the context** in one or two lines: audience, brand-vs-product, voice,
   the single feeling the page should evoke. If the repo has a `DESIGN.md` /
   `CLAUDE.md`, read it; otherwise infer from the existing site and say what you
   inferred.
2. **Tune three dials (1–10) and write them down** so choices are deliberate:
   - **DESIGN_VARIANCE** — layout experimentation (low = centred/clean; high = asymmetric/editorial).
   - **MOTION_INTENSITY** — animation depth (low = hover/press only; high = scroll-driven/magnetic).
   - **VISUAL_DENSITY** — information per viewport (low = spacious; high = dense dashboard).
   - _Premium eco / marketing brand (e.g. Flora Dine) default:_ variance **4**, motion **4**, density **3** — calm, trustworthy, spacious.
3. **Map the design system** so everything is reused, not reinvented: type scale,
   spacing rhythm (8px grid), colour tokens (already in the Tailwind theme),
   radius, shadow, and the existing component inventory. New work must pull from
   these tokens — no hard-coded hex or one-off spacing.

**Deliverable:** a 3–5 line direction (context + dials + the tokens you'll use).

---

## Activity Set 2 — Design (layout, type, colour, space)

_Shape the composition, then build it (impeccable + taste). Avoid generic patterns._

**Shape first.** Describe the layout and visual hierarchy in words before writing
JSX — what leads, what supports, where the eye goes.

**Typography**

- Clear scale with real hierarchy (don't size everything the same).
- Body line-height ≥ 1.5; tighten display headings.
- Avoid the obvious defaults for display type (Arial, system stack, and plain
  **Inter** as the "AI default"). The brand font should do the talking.

**Colour**

- **Never pure black or pure gray** — always tint toward the brand (e.g. text is a
  very dark brand-tinted neutral, not `#000`).
- **No gray text on coloured backgrounds** — it reads muddy; use a tint of the
  background or an on-colour token.
- Maintain **4.5:1** contrast for text. Drive everything from theme tokens.

**Spacing & layout**

- 8px rhythm; treat white space as a design element, not leftover.
- Use the dials: raise variance with an asymmetric hero or offset grid when the
  brand allows; keep density low for a premium feel.

**Avoid the "slop" tells** (taste + impeccable anti-patterns)

- Purple→blue "AI gradient"; bouncy/elastic easing; everything wrapped in cards;
  **cards nested inside cards**; side-tab coloured borders; skipped heading levels;
  undersized touch targets; centered-everything with no hierarchy.
- In UI microcopy, vary punctuation — don't lean on the em-dash as a verbal tic
  (a common AI tell). Keep copy specific and human.

**Deliverable:** the built/edited section using tokens, with hierarchy that reads
at a glance and none of the anti-patterns above.

---

## Activity Set 3 — Polish (motion & micro-interactions)

_The emil-design-eng layer — where "fine" becomes "loved". This is the most concrete set._

### Decide whether to animate at all

| Frequency | Decision |
| --- | --- |
| 100+×/day (keyboard, command palette) | **Never animate** |
| Tens×/day (hover, list nav) | Remove or drastically reduce |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare / first-time (onboarding, celebration) | Can add delight |

Every animation must answer **"why does this animate?"** — spatial consistency,
state indication, feedback, or preventing a jarring change. "Looks cool" + seen
often = don't.

### Easing — use custom curves, never `ease-in` on UI

```css
--ease-out:    cubic-bezier(0.23, 1, 0.32, 1);   /* enter/exit */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* move/morph on screen */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* drawers/sheets */
```

- Entering/exiting → `ease-out`. Moving/morphing → `ease-in-out`. Hover/colour →
  `ease`. Constant motion → `linear`.
- **Never `ease-in`** on UI (delays the first frame users watch most). Built-in CSS
  easings are too weak — use the curves above.

### Duration — keep UI under 300ms

| Element | Duration |
| --- | --- |
| Button press feedback | 100–160ms |
| Tooltip / small popover | 125–200ms |
| Dropdown / select | 150–250ms |
| Modal / drawer | 200–500ms |

### Core rules

- **Animate only `transform` and `opacity`** (GPU; skips layout/paint). Never
  animate `width`/`height`/`margin`/`padding`/`top`/`left`.
- **Press feedback:** `:active { transform: scale(0.97) }` on pressable elements
  (subtle, 0.95–0.98).
- **Never enter from `scale(0)`** — start `scale(0.95)` + `opacity: 0` (nothing in
  reality appears from nothing).
- **Origin-aware popovers** scale from their trigger (`transform-origin`), not
  center. **Modals stay centered.**
- **Asymmetric timing:** slow where the user is deciding (e.g. hold-to-delete 2s
  linear), snappy where the system responds (200ms ease-out). Make exits a touch
  faster than enters.
- **Stagger** list entries 30–80ms; never block interaction during a stagger.
- **Springs** for drag/gesture & "alive" elements (they keep velocity when
  interrupted): Apple-style `{ type: 'spring', duration: 0.5, bounce: 0.2 }`; keep
  bounce 0.1–0.3.
- Prefer **CSS transitions** over keyframes for interruptible UI; use `@starting-style`
  for enter animations; reach for `clip-path` for reveals/wipes/comparison sliders.
- **Tailwind note:** these sites have `tailwindcss-animate`; for bespoke motion add a
  token-based transition (`transition-transform duration-200 ease-[cubic-bezier(...)]`)
  rather than `transition-all`.

### Accessibility (non-negotiable)

- `@media (prefers-reduced-motion: reduce)` → keep opacity/colour, drop movement
  (reduce, don't remove).
- Gate hover effects behind `@media (hover: hover) and (pointer: fine)` so touch
  taps don't trigger them.

---

## Review gate (run before shipping)

Combine all three skills' checks. Produce findings as a **Before → After → Why**
markdown table (emil's required format), not prose bullets.

**Technical audit** (impeccable `audit`)

- A11y: 4.5:1 contrast, keyboard reachable + visible focus, real `<label>`s,
  44×44px targets, `prefers-reduced-motion` respected.
- Performance: only `transform`/`opacity` animated; no `transition: all`; images via
  `next/image` with correct `sizes`.
- Responsive: no horizontal overflow and correct reflow at 480 / 768 / 1024 / 1440.

**Creative critique** (impeccable `critique` + taste pre-flight)

- Hierarchy reads at a glance; one clear focal point per view.
- Clarity of copy and CTAs; emotional resonance matches the brand feeling.
- **Cohesion:** easing, duration, and vibe are unified — motion matches mood
  (playful can bounce; a premium brand stays crisp/calm).
- No "slop" tells from Activity Set 2 remain.

**Emil's code checklist** (fix on sight)

| Issue | Fix |
| --- | --- |
| `transition: all` | name the property: `transition: transform 200ms var(--ease-out)` |
| `scale(0)` entry | `scale(0.95)` + `opacity: 0` |
| `ease-in` on UI | `ease-out` / custom curve |
| `transform-origin: center` on popover | set to trigger (modals exempt) |
| Animation on a keyboard action | remove |
| Duration > 300ms on UI | reduce to 150–250ms |
| Hover without `@media (hover)` | add the media query |
| Same enter/exit speed | make the exit faster |
| Everything appears at once | add 30–80ms stagger |

**Then verify the build:** `npm run type-check`, `npm run lint`, `npm run build`,
and look at it on the dev server (responsive widths above).

---

## Set your project's defaults

Record the design direction once — in `CLAUDE.md` or a `DESIGN.md` — so every run
is consistent: the brand's one-line feeling, the three dial values, and the token
set to reuse. Then Activity Set 1 reads it instead of re-inferring each time.

> Example (premium / calm brand): dials variance **4** / motion **4** / density
> **3**; `ease-out` motion under ~250ms; lean on the existing theme tokens and the
> 8px grid.
