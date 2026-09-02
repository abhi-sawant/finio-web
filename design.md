# Design Philosophy

A portable design system spec. Everything here is stack-agnostic in principle (it happens to be
implemented with Tailwind CSS v4 + shadcn/ui + Base UI + CVA in the source project), and every rule
is written so it can be copy-pasted into a new project's design doc and followed without access to
the original codebase. Where concrete values are given (hex codes, spacing, radii) they are a
**reference starting palette** — swap the color values for a new brand, but keep the *structure*
(the token names, the light/dark pairing, the one-accent-color rule) unchanged.

---

## 1. Core Principles

1. **One accent color, used sparingly.** The palette has exactly one brand/primary hue. It marks
   the single most important action or number on a screen (primary buttons, active states, the
   focus ring, links). Everything else is neutral. A screen with three "important" colors has zero
   important colors.
2. **Flat, not glossy.** No gradients, no colored glows, no frosted/blurred glass panels. Elevation
   comes from a hairline border plus a soft neutral shadow, never from a saturated drop-shadow or a
   `backdrop-blur` on a colored surface. If a codebase inherits gradient/glow utility classes from
   an earlier design pass, keep the class names (so call sites don't churn) but resolve them to
   flat colors — see §2.4.
3. **Warm neutrals over cold grays.** Backgrounds and borders lean slightly warm (cream/paper in
   light mode, warm charcoal in dark mode) rather than clinical `#fff`/`#000`/blue-gray. This is a
   deliberate emotional register — calm and paper-like — not a technical constraint; a project
   choosing a colder register should still keep the *rest* of this document's structure.
4. **Semantic tokens, never raw hex in components.** Components reference `background`,
   `foreground`, `primary`, `muted`, `destructive`, etc. Nothing in a component file hardcodes a
   color. This is what makes dark mode, theming, and future rebrands a token edit instead of a
   grep-and-replace.
5. **Every interactive surface has an explicit focus, hover, active, and disabled state**, defined
   once in the primitive (button, switch, input), never re-implemented per screen.
6. **Confirmations and toggles are real components, never native browser primitives.** No
   `window.confirm()`, no hand-rolled `<span role="switch">`. One `Switch` component, one
   `confirm()` dialog, used everywhere — consistent look, consistent keyboard/focus behavior.
7. **Density with breathing room.** Compact row heights (list rows, form rows) paired with generous
   outer page padding and consistent vertical rhythm between sections. Rows are tight; sections
   are spacious.
8. **Numbers are typographically loud, labels are quiet.** A monetary/statistic value is
   `font-semibold` (or bolder) at a larger size; its caption/label is `text-muted-foreground` at a
   smaller size directly below or beside it. This pairing repeats everywhere a number appears.

---

## 2. Design Tokens

### 2.1 Token architecture

Define color as CSS custom properties on `:root` (light) and a `.dark` class (dark), then map them
into the CSS-framework's theme layer by reference — never inline a literal color a second time.

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  /* chart-1..5, sidebar-*, and one bespoke semantic band (see 2.3) follow the same pattern */
}
```

Required token set for any new project (names are the contract; keep them even if values change):

| Token | Role |
|---|---|
| `background` / `foreground` | Page canvas and default text |
| `card` / `card-foreground` | Elevated surfaces (cards, list containers) |
| `popover` / `popover-foreground` | Dialogs, dropdowns, tooltips |
| `primary` / `primary-foreground` | The one brand accent, and text/icons placed on it |
| `secondary` / `secondary-foreground` | A quiet, non-brand fill (secondary buttons, chips) |
| `muted` / `muted-foreground` | Subdued backgrounds and de-emphasized text/captions |
| `accent` / `accent-foreground` | A soft tint of `primary` for hover/active backgrounds |
| `destructive` / `destructive-foreground` | Danger actions and negative values |
| `border` / `input` | Hairlines and form-control borders |
| `ring` | Focus ring color — should equal `primary` |
| `chart-1..chart-5` | A 5-step categorical palette for data viz, derived from the same hues as primary/destructive/warning |

### 2.2 Reference palette (swap values, keep structure)

**Light**
```
--background: #f7f5f1;   --foreground: #1b1a17;
--card: #fffdf9;         --card-foreground: #1b1a17;
--primary: #146b54;      --primary-foreground: #fffdf9;
--secondary: #f0ece3;    --secondary-foreground: #1b1a17;
--muted: #f0ece3;        --muted-foreground: #79746a;
--accent: #e9f1ec;       --accent-foreground: #0f4c3d;
--destructive: #b3421f;  --destructive-foreground: #fffdf9;
--border: #eae5db;       --input: #eae5db;
--ring: #146b54;
```

**Dark** — do not just invert lightness; re-tune each color so contrast and saturation feel
intentional, not auto-generated:
```
--background: #211e1a;   --foreground: #f3efe7;
--card: #2a2521;         --card-foreground: #f3efe7;
--primary: #2e9c7a;      --primary-foreground: #0b1f19;   /* brighter/more saturated than light-mode primary */
--secondary: #35302a;    --secondary-foreground: #f3efe7;
--muted: #35302a;        --muted-foreground: #b0a99c;
--accent: #24352e;       --accent-foreground: #8fcbb3;
--destructive: #e0714a;  --destructive-foreground: #241008;
--border: rgba(243,239,231,0.10);   --input: rgba(243,239,231,0.14);  /* alpha-over-bg, not a solid hex */
--ring: #2e9c7a;
```

Rules encoded in the palette above, keep these when swapping values:
- **Dark-mode `primary` is a brighter/more saturated shade of the same hue**, not the same hex
  reused — a dim accent reads as disabled on a dark background.
- **Dark-mode `border`/`input` are semi-transparent white (`rgba(foreground, 0.1–0.14)`)**, not a
  solid gray — this lets the border read correctly against both `background` and `card`, which are
  two different dark values.
- **`accent-foreground` is a saturated version of `primary`'s hue**, used for icon/text tinting on
  top of the soft `accent` fill (e.g. a category icon on its accent-tinted circle).

### 2.3 One bespoke semantic token beyond the standard set

If the product needs a severity/status color that is neither "success" (`primary`) nor
"destructive," add exactly one more named pair rather than reaching for raw Tailwind color
utilities (`bg-amber-100` etc.) in components:

```css
--warning-band: #fbede6;            /* light */
--warning-band-foreground: #7a2e13;
--warning-band-accent: #b3421f;
```
Add more only when a real recurring UI need shows up — resist growing this list speculatively.

### 2.4 Flat-fill utility classes (legacy-gradient compatibility shim)

If migrating a codebase off gradients/glows, keep the old class names as an escape hatch so call
sites are untouched, but make every one resolve to a **flat color**:

```css
@layer utilities {
  .bg-grad-primary { background-color: var(--primary); }
  .bg-grad-primary-soft { background-color: var(--accent); }
  .shadow-glow-primary { box-shadow: var(--shadow-float); } /* a plain elevation shadow, not a glow */
}
```
In a project starting fresh, skip this section entirely and just use the semantic tokens directly.

### 2.5 Elevation

Two shadow tokens only — a resting one and a floating one. Both are neutral (black/foreground at
low opacity), never tinted with the brand color:

```css
--shadow-card:  0 1px 2px rgba(0,0,0,0.05);          /* light mode resting elevation */
--shadow-float: 0 18px 40px -20px rgba(0,0,0,0.35);  /* light mode dialogs/popovers */
/* dark mode: same shape, opacity raised (0.4 / 0.6) since the surface itself is already dark */
```

A "card" surface (`.card-elevated` or equivalent) is always: opaque `card` background + `1px solid
border` + `shadow-card`. Never a translucent/blurred background — that's reserved for modal
backdrops only (see §5.3).

### 2.6 Radius scale

One base variable, everything else derived by multiplication, so a single number controls the
whole product's "roundness":

```css
--radius: 1rem;
--radius-sm:  calc(var(--radius) * 0.6);
--radius-md:  calc(var(--radius) * 0.8);
--radius-lg:  var(--radius);
--radius-xl:  calc(var(--radius) * 1.4);
--radius-2xl: calc(var(--radius) * 1.8);
```
Buttons and pill-shaped controls use `rounded-full`. Cards and dialogs use `rounded-md`/`rounded-lg`.
Never mix an arbitrary one-off radius (`rounded-[7px]`) into a component — pick the nearest step.

### 2.7 Typography

- One variable/webfont for both body and headings (e.g. a single Geist/Inter-class sans), mapped
  to both `--font-sans` and `--font-heading` — a second display face is a common but usually
  unnecessary complexity for a utilitarian product.
- Font sizes stay inside the framework's default type scale (`text-xs` through `text-2xl`-ish).
  Introduce a bespoke size only for one hero number per page (e.g. a dashboard's total balance).
- Body/label text: `text-sm`. Captions/secondary metadata: `text-xs`, always paired with
  `text-muted-foreground`. Section/dialog titles: `text-base font-medium` using the heading font
  variable.

---

## 3. Layout & Page Shell

### 3.1 Header / Main convention

Every screen is built from exactly two shared primitives, never a bespoke per-page wrapper:

- **`Header`** — `sticky top-0`, transparent-to-background, centers a `max-w-5xl` row with
  `px-3 py-3` (`lg:px-8`), holding a title/back-button on the left and 0–2 icon actions on the
  right.
- **`Main`** — `mx-auto max-w-5xl space-y-4 px-3 pt-2` and, critically, **large bottom padding**
  (`pb-40` on mobile, `pb-8` on desktop) so content never sits under a fixed bottom nav / FAB.

```tsx
<Header><h1>Page Title</h1><IconButton /></Header>
<Main>
  <section className="card-elevated rounded-md p-4">...</section>
</Main>
```

Same `max-w-5xl` container width in both, so header and content always align. `lg:space-y-6` widens
vertical rhythm between sections on desktop.

### 3.2 List rows vs. cards

Two distinct patterns, don't blur them:

- **A single self-contained item** (a stat, a form section) → its own `card-elevated rounded-md
  p-4`.
- **A homogeneous list of items** (accounts, transactions) → one `card-elevated divide-y` container,
  each row a plain flex row with `py-3` and *no* border/shadow of its own — the divider lines come
  from `divide-y`, not from n individual card shadows stacked on top of each other.

### 3.3 Row anatomy

The recurring two-column row layout, used for almost every list item in the product:

```
[ icon/avatar ]  [ title (truncate, text-sm font-medium)      ]  [ value (text-sm font-semibold, right-aligned) ]
                 [ subtitle (truncate, text-xs, muted)          ]  [ secondary caption (text-[11px], muted)       ]
```
- Title truncates (`truncate`) inside a `min-w-0 flex-1` wrapper — never let a long name push the
  value column off-screen.
- The trailing value flips to `text-destructive` when negative; nothing else about the row changes
  color.
- Row-level actions (archive/delete) are icon-only circular buttons, `h-7 w-7 rounded-full border`,
  revealed via `group` hover on desktop but always visible on touch.

### 3.4 Safe areas (PWA / mobile web)

```css
@supports (padding-top: env(safe-area-inset-top)) {
  .safe-top    { padding-top: env(safe-area-inset-top); }
  .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
}
```
Apply `safe-top` to the outermost app shell and `pb-safe`/`bottom-safe-nav` to any fixed bottom
bar. Set `overscroll-behavior: none` on `html` so pull-to-refresh/bounce never fights a fixed
header on iOS.

---

## 4. Component Conventions

### 4.1 Buttons

A single `buttonVariants` (CVA) function is the *only* place button styling is defined. Every
button in the product — regardless of feature — imports this, never hand-rolls `className="..."`.

Variants and their semantic meaning (keep this exact list; resist adding more):
| Variant | Use for |
|---|---|
| `default` | The one primary action on a screen/dialog |
| `outline` | Secondary action, needs visible boundary |
| `secondary` | Secondary action, filled but non-brand |
| `ghost` | Tertiary / icon-only / toolbar actions |
| `destructive` | Delete/remove — tinted (`bg-destructive/10`), not a solid red fill; a solid fill is reserved for the rare *confirmed* destructive click inside an `AlertDialog` |
| `link` | Inline text-styled action |

Sizes: `xs, sm, default, lg` for text buttons, `icon-xs, icon-sm, icon, icon-lg` for icon-only —
square, never a text button squeezed down. Baseline interaction rules baked into the variant
function itself, not per-usage:
- `active:translate-y-px` — a 1px press-down on click, the tactile "physical button" cue.
- `focus-visible:ring-3 ring-ring/50` + `border-ring` — identical focus treatment across every
  variant.
- `disabled:opacity-50 pointer-events-none`.
- `aria-invalid:` styling built in, so a button used as a form-submit auto-reflects validation
  state.

### 4.2 Dialogs

- Centered, not a drawer, on both mobile and desktop (`max-w-[calc(100%-2rem)] sm:max-w-sm`) —
  reserve bottom sheets for a deliberate, separate "sheet" pattern if the product needs one; don't
  mix the two idioms for the same kind of content.
- Backdrop: `bg-foreground/15` + light blur (`backdrop-blur-xs`) — never opaque, never heavy blur.
- Content surface is fully opaque (`bg-popover`), `ring-1 ring-border`, `shadow-[var(--shadow-float)]`
  — the *backdrop* is translucent, the *dialog itself* never is.
- `DialogFooter` gets its own subtle `bg-muted/50` band, full-bleed to the dialog's rounded corners
  (negative margin trick), separated by a `border-t` — this visually demotes the action row below
  the content without a heavy divider line.
- Footer buttons: `flex-col-reverse` on mobile (primary action on top, thumb-reachable),
  `sm:flex-row sm:justify-end` on desktop (primary action rightmost, conventional).
- A close (`X`) icon button is present by default in the top-right corner, `size="icon-sm"
  variant="ghost"`, absolutely positioned — opt out per-dialog, don't opt in.

### 4.3 Confirmations — one shared imperative API, not `window.confirm`

Expose a single `useConfirm()` hook returning a promise-based `confirm({ title, description,
confirmLabel?, destructive? })` that resolves `true`/`false`, backed by one shared `AlertDialog`
instance mounted at the app root. Consequences of this shape, keep all of them:
- Escape / backdrop click always resolves `false` (a cancel), never leaves the caller hanging.
- A second `confirm()` call while one is pending resolves the *first* call `false` before opening
  the new one — a stray promise is a memory/UX leak.
- `destructive` (default `true`) controls whether the confirm button renders as `destructive` or
  `default` — so the same primitive serves "Delete this?" and "Are you sure you want to send this?"
  without two components.

### 4.4 Toggles

One `Switch` primitive (`role="switch"`, real `<button>`, not a styled checkbox) plus one
`SwitchField` wrapper that lays out icon + title + description + switch as a settings row and wires
`aria-labelledby`/`aria-describedby` automatically. Rules:
- The switch is always the *only* focusable element in the row — even when the whole row is
  clickable (`interactiveRow`), the row's own `onClick` explicitly bails if the click originated
  inside the switch, to avoid a double-toggle.
- Checked state: solid `bg-primary` track; unchecked: `bg-muted`. Thumb is always plain white with a
  small shadow, in both themes — it's the track that carries the semantic color, not the thumb.
- Two sizes only (`sm` inline-in-a-row, `md` settings-row) — don't proliferate sizes.

### 4.5 Icon avatars

A small (16–20px) `lucide` icon rendered directly (no wrapping circle) inside list rows, but wrapped
in a `h-9 w-9 rounded-full` colored circle when it represents a **user-chosen entity** (a category,
a goal, a person) whose color is part of the data model. The circle's background is that entity's
own stored color at reduced opacity or the shared `accent` token; the icon color is the full-opacity
entity color. A picker for this (see the goal-icon-picker pattern) is a `grid grid-cols-6 gap-2` of
`h-9` square buttons, each `rounded-sm border`, with the selected one getting
`border-primary bg-primary/10`.

### 4.6 Forms

- Every field: a `text-muted-foreground text-xs font-medium` label above a full-width input, `mb-1.5`
  gap.
- Inputs default to a filled, borderless look — `bg-muted rounded-sm px-3 py-2` — reserving a
  visible `border` for states that need to stand out (validation error, selected option).
- A numeric-amount field gets its own custom keypad component rather than the OS numeric keyboard,
  when the amount is the primary object of the screen (e.g. "add transaction") — this keeps layout
  stable and avoids OS-keyboard quirks across platforms.
- Color/preset pickers are a `flex flex-wrap gap-3` of plain colored circles/squares; the selected
  one gets a `ring-2 ring-primary ring-offset-2 scale-110`.

### 4.7 Toasts

One toast library, mounted once at the root (`position="top-center" richColors closeButton`).
Every mutating action that can be trivially reversed shows a success toast with an inline **Undo**
action button rather than a confirmation dialog beforehand — confirm *before* for destructive/
irreversible actions (§4.3), undo *after* for cheap/reversible ones. Don't use both for the same
action.

---

## 5. Motion & Feedback

- Default transition timing across the whole system: fast and subtle — dialogs/popovers use a
  ~100ms fade+scale (`animate-in fade-in-0 zoom-in-95`), never a slow (>200ms) or bouncy easing.
- Reserve a distinct, purpose-built animation for a genuine error signal (e.g. a shake on wrong-PIN
  entry), and always gate it behind `@media (prefers-reduced-motion: reduce) { animation: none; }`.
- No animation exists purely for decoration — every motion in the system maps to a specific state
  change (open/close, error, drag) a user needs to notice.

---

## 6. Accessibility Baseline

- Every icon-only control has an explicit `aria-label`.
- A toggle whose visual label sits in a sibling element (not a native `<label>`) is wired with
  `aria-labelledby`/`aria-describedby` pointing at that sibling's `id` — never left unlabeled just
  because it's "obviously" next to text.
- Focus-visible ring is identical across every interactive primitive (`ring-ring/50`, `ring-3`,
  `border-ring`) — a user tabbing through the app sees one consistent focus language, not a
  different ring per component library default.
- Respect `prefers-reduced-motion` for any non-essential animation.
- Any chart/graph that is the sole carrier of information ships a real `<table>` fallback behind a
  disclosure ("View data table") — a canvas/SVG chart alone is not an accessible data
  presentation.

---

## 7. Dark Mode Implementation

- A single class (`.dark`) toggled on the document root — not a `data-theme` attribute, not a
  separate stylesheet — driven by a small provider that supports `light` / `dark` / `system`
  (the `system` branch subscribes to `prefers-color-scheme` via `matchMedia` and updates live).
- **Every token gets a hand-tuned dark value** in a `.dark { --token: ... }` block — never rely on
  `filter: invert()` or automatic darkening. A few values are legitimately *more* saturated in dark
  mode than light (the primary accent, see §2.2) because raw contrast math would otherwise wash it
  out against a dark background.
- Border/input tokens in dark mode use alpha-over-background (`rgba(foreground, 0.1)`) rather than a
  flat gray hex, so hairlines read consistently against both `background` and the slightly-lighter
  `card` surface.

---

## 8. Porting This to a New Project — Checklist

1. Pick **one** brand hue. Derive `primary` (light) and a brighter/more-saturated sibling for
   `primary-foreground`/dark-mode `primary`. Everything else in the palette is neutral warm-or-cool
   grays — pick one temperature and stay consistent.
2. Write out the full token table in §2.1 for both `:root` and `.dark`, using §2.2 as a template to
   fill in, not to copy verbatim.
3. Set one `--radius` base value and derive the rest by multiplication (§2.6). Decide once whether
   the product is "soft" (large radius, ~1rem) or "sharp" (small radius, ~0.375rem).
4. Build the primitives in this order, each depending only on tokens (never on each other's
   internals): Button → Switch → Dialog/AlertDialog+useConfirm → Input/Label → Header/Main shell.
5. Establish the row anatomy (§3.3) and the card-vs-list-row distinction (§3.2) before building any
   real feature screen — retrofitting it later means touching every screen twice.
6. Add the accessibility baseline (§6) into the primitives themselves, not as a later audit pass.
7. Only after all of the above, start building feature screens — they should need zero bespoke
   color values or one-off shadow/radius declarations.
