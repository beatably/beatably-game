# Beatably Mobile Design System

This document is the single source of truth for Beatably’s mobile UI and UX decisions. It captures the system-level design guidelines, color decisions, interaction patterns, and component specifications that we will apply across all views.

## Decisions from this redesign (summary)

- Mobile-first, minimalist design that fits typical smartphone screens without scrolling.
- One primary CTA color only (Spotify Green). No purple CTAs.
- Secondary actions use outline style (not filled).
- Option “chips” (difficulty, years, genres, markets) use:
  - Active: default (filled) primary style
  - Inactive: ghost + subtle border, transparent background (no purple highlight)
  - No colored focus fill for inactive options
- Status/warning messaging:
  - Default: inline message in the relevant module (same standard text color).
  - Avoid large yellow warning blocks unless needed; prefer readable inline messaging near the context.
- Visual hierarchy:
  - Containers (cards) use larger radius and surface styling.
  - Buttons and option “chips” use smaller radius and explicit borders for clarity.
- Game Code UX: four separate single-digit inputs with auto-advance and backspace navigation.

---

## 1) Design Philosophy

- Mobile-First: Designed primarily for 375–414px smartphone widths.
- Minimalistic: Focused core actions with low visual noise.
- Touch-Optimized: All interactive elements meet or exceed the 44px Apple HIG minimum.
- Cohesive Dark Theme: Professional look suitable for music apps.
- iOS-Ready: Patterns translate cleanly to UIKit/SwiftUI (and React Native).

---

## 2) Color System

Tailwind CSS variables (HSL) defined in CSS. Default dark theme.

```css
/* Core palette (HSL) */
--background: 0 0% 7%;
--foreground: 0 0% 98%;

--card: 0 0% 12%;
--card-foreground: 0 0% 98%;

--input: 0 0% 15%;
--border: 0 0% 20%;

--primary: 142 76% 36%;           /* Spotify Green (#22c55e) */
--primary-foreground: 0 0% 98%;

--accent: 262 83% 58%;            /* Purple accent (sparingly used, not for CTAs) */
--accent-foreground: 0 0% 98%;

--destructive: 0 62.8% 30.6%;
--destructive-foreground: 0 0% 98%;

--muted-foreground: 0 0% 63.9%;
--ring: 142 76% 36%;
```

Usage:
- Primary (Green): Main CTA buttons, positive focus rings, key brand elements.
- Accent (Purple): Decorative accents or subtle emphasis only. Do not use for CTAs.
- Background/Card/Input: Structure the dark theme surfaces.
- Borders: Use subtle dividers to separate elements in dark UI.
- Text: Use `--foreground` for standard copy; `--muted-foreground` for secondary info.

---

## 3) Typography

- Branding: Chewy (chewy-regular) for logo/title where appropriate.
- UI: Encode Sans (100–900) for all UI text.
- Default sizes:
  - h1: 24px, chewy-regular, bold-like (branding)
  - h2: 20px, semibold
  - h3: 18px, medium
  - body: 16px
  - small: 14px (labels)
  - tiny: 12px (helper)

---

## 4) Spacing & Layout

- Base unit: 4px
- Common vertical spacing:
  - Form elements (title → controls): `space-y-3` (12px)
  - Sections: `space-y-6` (24px)
  - Major group: `space-y-6` or `space-y-8`
- Page container:
  - `px-6` horizontal padding
  - `max-w-sm` (384px) inner wrapper for mobile

---

## 5) Visual Hierarchy Tokens

To consistently differentiate containers from controls:

- Containers (surfaces)
  - Class: `container-card`
  - Style: larger radius (e.g., `rounded-xl`), `bg-card`, `border-border`, `mobile-shadow`

- Buttons/Chips (controls)
  - Class: `setting-button`
  - Style: smaller radius (e.g., `rounded-md`), explicit border for inactive states

- Touch feedback
  - Class: `touch-button`
  - Style: fast transitions, press-scale on active

Example CSS utilities (already included):

```css
@layer components {
  .touch-button { @apply transition-all duration-200 ease-out; }
  .touch-button:active { @apply scale-95; }

  .container-card { @apply rounded-xl; }
  .setting-button { @apply rounded-md; }
}
```

---

## 6) Buttons & CTAs

Primary CTA (use only green). Guidance to avoid text wrapping and ensure parity across views:
```jsx
{/* Use h-12 (48px), horizontal padding, prevent wrapping, and center content */}
<Button className="w-full h-12 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2">
  <span>Primary Action</span>
</Button>
```

Secondary (outline). Match height and padding to primary so buttons appear consistent across screens:
```jsx
<Button variant="outline" className="w-full h-12 px-4 border border-border bg-transparent hover:bg-input font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2">
  Secondary Action
</Button>
```

Spec:
- Height: h-12 (48px) for main page CTAs and page-level secondary buttons to keep visual parity.
- Horizontal padding: use `px-4` on button containers (prevents tight text and keeps consistent visual rhythm).
- Text wrapping: apply `whitespace-nowrap` to prevent label wrapping; if a label must be longer, prefer a shorter label or adjust layout rather than wrapping.
- Content layout: prefer `flex items-center justify-center gap-2` inside buttons so icons + text align consistently.
- Weight: `font-semibold` for readability and prominence.
- DO NOT use purple for CTAs. Purple is for accents only.
- When using icon-only buttons, still maintain accessible hit area by applying `p-2 -m-2` on the button element (visual small, touch area ≥44px).

---

## 7) Inputs

Standard input:
```jsx
<Input
  className="bg-input border-border text-foreground h-11 focus:ring-primary"
  placeholder="Enter your name..."
/>
```

Game Code (4-digit, single chars with auto-advance):
- 4 individual fields, each maxLength=1
- Digit-only input
- Auto-advance on input; backspace moves focus to previous field when empty

Example (simplified):
```jsx
<div className="flex gap-2 justify-center">
  {codeDigits.map((digit, i) => (
    <Input
      key={i}
      id={`code-${i}`}
      className="bg-input border-border text-foreground text-center h-12 w-12 text-lg focus:ring-primary"
      value={digit}
      maxLength={1}
      onChange={...}
      onKeyDown={...}
    />
  ))}
</div>
```

---

## 8) Option “Chips” (Difficulty, Years, Genres, Markets)

- Active option: default (filled) style
- Inactive option: ghost + subtle border, transparent background
- Inactive focus: no colored fill, no ring, maintain transparency
- Size & typography:
  - Touch target / height: `h-10` (recommended) to meet mobile touch-size guidance while keeping a compact visual rhythm.
  - Text sizing: use `text-sm` for chips (consistently across difficulty, years, genres, markets) so labels visually match other controls.
  - Alignment: left-aligned content for chips that are list-like (genres/markets) using `justify-start` to improve scanability.

Examples:
```jsx
{/* Active */}
<Button className="h-10 text-sm touch-button setting-button" variant="default">Normal</Button>

{/* Inactive */}
<Button
  className="h-10 text-sm touch-button setting-button border border-border focus:ring-0 focus:bg-transparent"
  variant="ghost"
>
  Easy
</Button>
```

Notes:
- If a chip contains multi-word labels (e.g., "10 cards" or "International (US)"), ensure text wrapping is avoided by using `whitespace-nowrap` on the Button or truncation where necessary.
- Maintain the visual parity between chips and small inline controls — prefer `h-10 text-sm` for all such option controls unless a special case is justified.

---

## 9) Status & Messaging

- Default pattern: Inline message placed inside the relevant container (module), not in a separate warning card.
- Use standard text color for consistency with the module (avoid yellow unless absolutely necessary).

Example (Waiting Room — inline in the combined card):
```jsx
{isCreator && !canStart && (
  <div className="mt-4 text-sm text-foreground text-center">
    {!enoughPlayers && "Need at least 2 players to start"}
    {tooManyPlayers && "Maximum 4 players allowed"}
  </div>
)}
```

Optional (rarely): Use subtle amber surface for long-form warnings. Prefer inline messaging to reduce visual noise.

---

## 10) Combined Game Code + Players

Pattern used in Waiting Room:
```jsx
<Card className="bg-card border-border mobile-shadow container-card">
  <CardContent className="p-6">
    {/* Game Code */}
    <div className="text-center mb-6">
      <div className="text-sm text-muted-foreground mb-2">Game Code</div>
      <div className="text-4xl font-bold text-foreground tracking-wider select-all mb-2">
        {code}
      </div>
      <div className="text-xs text-muted-foreground">Share this code with friends</div>
    </div>

    {/* Players */}
    <div>
      <div className="text-lg font-semibold text-foreground mb-3">
        Players ({players.length}/4)
      </div>
      <div className="space-y-2">
        {/* Player items ... */}
      </div>
    </div>

    {/* Inline status */}
    {isCreator && !canStart && (
      <div className="mt-4 text-sm text-foreground text-center">
        {!enoughPlayers && "Need at least 2 players to start"}
        {tooManyPlayers && "Maximum 4 players allowed"}
      </div>
    )}
  </CardContent>
</Card>
```

---

## 11) Landing Page Pattern

```jsx
// Header
<div className="text-center mb-8">
  <img className="h-12 w-auto mx-auto" />
</div>

// Form & Actions
<div className="w-full max-w-sm space-y-6">
  <div className="space-y-2">
    <Label>Your Name</Label>
    <Input className="h-11" />
  </div>

  <Button className="h-12 bg-primary text-primary-foreground">Create Game</Button>

  <div className="text-center text-muted-foreground text-sm py-2">or</div>

  {/* Join with 4-digit code (separate inputs) */}
  <div className="space-y-2">
    <Label>Game Code</Label>
    <div className="flex gap-2 justify-center">{/* ... four digit inputs ... */}</div>
  </div>

  <Button variant="outline" className="h-12">Join Game</Button>
</div>
```

---

## 12) Animations & Interactions

Touch feedback (already defined):
```css
.touch-button { @apply transition-all duration-200 ease-out; }
.touch-button:active { @apply scale-95; }
```

Card hover (for non-touch demos/dev):
```css
.interactive-card { @apply transition-all duration-300 ease-out; }
.interactive-card:hover { @apply -translate-y-1 shadow-2xl; }
```

Focus states:
- Primary interactive elements: green ring (`focus:ring-primary`)
- Inactive chips: no ring and no background fill on focus (`focus:ring-0 focus:bg-transparent`)

---

## 13) Accessibility

- Touch targets ≥ 44 × 44 px; preferred 48 px for primary CTAs.
- Color contrast: meet or exceed 4.5:1 for text on dark surfaces.
- Labels: use `<Label htmlFor>` associations for inputs.
- Semantics: buttons for all actions, headings for structure.

---

## 14) Responsive Behavior

- Mobile-first design, with optional `sm` and `md` enhancements.
- Core flows are usable without horizontal scroll on 375px width.

---

## 15) iOS Translation Readiness

- Containers map to UIView/SwiftUI stacks with rounded corners and shadows.
- Buttons map to UIButton/SwiftUI Button with green filled style for primary and outline style for secondary.
- Chips map to segmented style buttons or toggle buttons with stateful fill.
- Status messages are inline composable Text components.

---

## 16) Implementation Notes (ShadCN)

- Components used:
  - Button, Card, Input, Label, Switch
- Button variants adjusted for dark UI:
  - `outline`: `border bg-background hover:bg-input hover:text-foreground`
  - `ghost`: `hover:bg-input hover:text-foreground`
- Utilities and tokens:
  - `.container-card`, `.setting-button`, `.touch-button`
- Option controls:
  - Active: `variant="default"`
  - Inactive: `variant="ghost"`, `border border-border`, `focus:ring-0 focus:bg-transparent`

---

## 17) Checklist for Future Views

- Use a single green CTA per view. Secondary actions are outline buttons.
- Keep status/warning text within the relevant card/module when possible.
- Use `.container-card` for surfaces and `.setting-button` for controls to keep hierarchy readable.
- Use inline, readable text colors for messaging rather than color blocks unless necessary.
- Maintain 48px height for primary CTA buttons.
- Use 4-digit separated inputs for codes requiring simple numeric entry.

## 18) Header Color and Inline Text Actions

Header color (titles/headings):
- Screen titles should use `text-foreground` (white) by default.
- Do not use Primary Green on headings; reserve primary for actionable controls and brand accents only.
- Example (Waiting Room):
```jsx
<h2 className="text-5xl font-bold chewy-regular text-foreground">Waiting Room</h2>
```

Inline text actions inside list rows (e.g., Kick in Players list):
- Use link-style text instead of a filled/outlined button to keep row height compact and consistent.
- Semantics: use a `<button>` element (for accessibility), styled like a link.
- Style tokens:
  - Color: `text-foreground` (white)
  - Emphasis: `font-semibold`
  - Decoration: `underline`
  - Size: `text-sm`
  - Hover: `hover:text-foreground/80`
  - Focus: `focus:outline-none`
- Example snippet:
```jsx
<div className="flex items-center justify-between p-3 bg-input rounded-lg">
  <div className="flex items-center gap-2">
    <span className="font-medium text-foreground">Player Name</span>
    <span className="text-xs text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded border border-primary/20">Host</span>
  </div>
  <button
    className="text-foreground underline font-semibold text-sm hover:text-foreground/80 focus:outline-none"
  >
    Kick
  </button>
</div>
```

Page-level inline text actions (Reset, Clear, etc.):
- Use when an action should be visually compact and not take the prominence of a CTA.
- Visual rules:
  - Do not render inside a rounded/filled control — keep the visual as inline text (no visible rounded background).
  - Center page-level inline actions when they represent global/module-level actions (e.g., "Reset to defaults").
  - Style tokens:
    - Color: `text-foreground`
    - Emphasis: `font-semibold`
    - Decoration: `underline`
    - Size: `text-sm`
    - Touch target: ensure accessible hit area by applying `p-2 -m-2` on the `<button>` (keeps visual footprint small while providing at least 44×44px touch area).
    - Hover: `hover:text-foreground/80`
    - Focus: `focus:outline-none`
- Example snippet (Reset action centered, no rounded box):
```jsx
<div className="flex justify-center">
  <button
    onClick={handleReset}
    aria-label="Reset to defaults"
    className="text-foreground underline font-semibold text-sm p-2 -m-2 hover:text-foreground/80 focus:outline-none"
  >
    <svg className="w-4 h-4 text-muted-foreground mr-2" ...>...</svg>
    Reset
  </button>
</div>
```

Notes:
- Use icon-only inline actions sparingly; always ensure `aria-label` for accessibility and preserve an invisible padding area for touch.
- These guidelines keep inline actions visually unobtrusive while meeting accessibility and touch requirements.

Icon-based inline actions (recommended)
- Use when you want a compact, language-independent control for small row actions.
- Prefer an X/Close or User-Minus icon for "remove player" semantics.
- Keep the icon visually small but ensure the touch target meets accessibility (44×44px). Use padding on the clickable element rather than visible background.

Example (X/Close icon — minimal visual, accessible touch area):
```jsx
<div className="flex items-center justify-between p-3 bg-input rounded-lg">
  <div className="flex items-center gap-2">
    <span className="font-medium text-foreground">Player Name</span>
    <span className="text-xs text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded border border-primary/20">Host</span>
  </div>

  {/* Accessible icon button with invisible padding for touch target */}
  <button
    onClick={handleKick}
    aria-label={`Kick ${playerName}`}
    className="bg-transparent border-0 p-2 -m-2 rounded focus:outline-none"
  >
    <svg
      className="w-4 h-4 text-muted-foreground hover:text-foreground"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M6 18L18 6" />
      <path d="M6 6L18 18" />
    </svg>
  </button>
</div>
```

Guidelines:
- Use `p-2 -m-2` (or similar) on the button to guarantee a 44px+ touch area while keeping the visual footprint small.
- Color the icon `text-muted-foreground` by default and change to `text-foreground` on hover/focus.
- Keep no background or border unless the row requires a visible affordance; prefer transparent backgrounds to avoid adding height.
- Use `aria-label` for accessibility and keyboard focusability (button element).
- If multiple actions exist, consider a small overflow menu (three dots) to avoid UI clutter.

Rationale:
- Preserves a consistent visual rhythm in list rows (no extra height from a button).
- Reduces CTA overload; primary green remains reserved for the main action (e.g., Start Game).
- Improves readability in dark UI by keeping text actions aligned with standard copy color.

This design system ensures consistency, accessibility, and an optimized mobile experience across all Beatably views while aligning with our latest design decisions and best practices.
