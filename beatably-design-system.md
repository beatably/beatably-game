# Beatably Mobile Design System

This document is the single source of truth for Beatably's web and mobile UI/UX decisions. It captures system-level design guidelines, color decisions, interaction patterns, component specifications, and exact implementation values derived from the live codebase.

> **Note:** Updated July 2026 after the **web↔iOS parity project**: the iOS app is the visual source of truth and the web now mirrors it — Nunito typography, album-art timeline nodes on a neon tube path with spring placement animation, full-screen animated SpaceBackground, BottomCard slide-up sheets, challenge slide-up panels, coin flight animations, the 8-sound iOS effect set, and live placement preview. Key web implementations live in `frontend/src/components/design/` and `frontend/src/components/timeline/`. Sections written before July 2026 may describe superseded details — the components win.

---

## Summary of Current Design Principles

- **Cosmic dark theme** — deep navy/purple background with vibrant neon accents, not a neutral black/grey theme.
- **Gradient CTAs** — primary buttons use a horizontal teal-to-purple gradient (`#08AF9A → #7D3BED`), not flat Spotify Green.
- **Neon palette** — cyan, magenta, purple, and teal are first-class accent colors used throughout the timeline, player cards, and interactive elements.
- **Mobile-first, fullscreen** — all views are `100dvh`, `overflow: hidden`; safe-area insets handled per-component.
- **No purple CTAs** — still applies; the gradient CTAs use purple as the *end* color of a gradient, not a solid purple fill.

---

## 1) Design Philosophy

- **Mobile-First**: Designed for 375–414px smartphone widths; no horizontal scroll.
- **Cosmic/Vibrant**: Deep purple-navy background with neon glow effects — music-game energy.
- **Touch-Optimized**: All interactive elements meet or exceed the 44px Apple HIG minimum.
- **PWA-ready**: Safe area insets handled via `env()` CSS functions.

---

## 2) Color System

### CSS Variables (HSL) — defined in `index.css` `@layer base`

```css
/* Surfaces */
--background: 245 60% 8%;        /* Deep navy/purple: hsl(245,60%,8%) ≈ #0C0A1A */
--foreground: 0 0% 98%;           /* Near-white */

--card: 245 45% 12%;              /* Card surface: hsl(245,45%,12%) ≈ #141128 */
--card-foreground: 0 0% 98%;

--popover: 245 45% 12%;           /* Same as card */
--popover-foreground: 0 0% 98%;

/* Interactive */
--input: 245 35% 18%;             /* Input/button bg: hsl(245,35%,18%) ≈ #1E1B34 */
--border: 245 30% 25%;            /* Borders: hsl(245,30%,25%) ≈ #2D2A45 */
--ring: 174 92% 48%;              /* Focus ring: teal #08AF9A */

/* Brand */
--primary: 142 76% 36%;           /* Spotify Green: #1DB954 (used in gradient start) */
--primary-foreground: 0 0% 98%;

--secondary: 262 83% 58%;         /* Purple accent: hsl(262,83%,58%) ≈ #9945FF */
--secondary-foreground: 0 0% 98%;

--muted: 245 30% 20%;
--muted-foreground: 0 0% 63.9%;   /* ~#A3A3A3 */

--accent: 262 83% 58%;            /* Same as --secondary */
--accent-foreground: 0 0% 98%;

--destructive: 0 62.8% 30.6%;
--destructive-foreground: 0 0% 98%;

/* Border radius base */
--radius: 0.75rem;                 /* 12px — used by Tailwind rounded-lg */
```

### Tailwind border-radius scale (from `--radius: 0.75rem`):
| Class | Value |
|---|---|
| `rounded-lg` | 12px (`var(--radius)`) |
| `rounded-md` | 10px (`var(--radius) - 2px`) |
| `rounded-sm` | 8px (`var(--radius) - 4px`) |

### Neon Color Palette

Used on timeline nodes, glow effects, confetti, animated background elements:

```css
--neon-blue:    217 91% 60%;   /* #4169E1 */
--neon-cyan:    180 100% 50%;  /* #00CED1 */
--neon-teal:    174 72% 56%;   /* #20B2AA */
--neon-purple:  262 83% 58%;   /* #9945FF */
--neon-magenta: 328 100% 54%;  /* #FF1493 */
--neon-pink:    330 100% 71%;  /* #FF69B4 */
--neon-green:   142 76% 36%;   /* Spotify Green */
--neon-lime:    123 100% 62%;  /* #32CD32 */
--neon-red:     4 90% 58%;     /* #FF4757 */
--neon-orange:  14 100% 61%;   /* #FF6348 */
--neon-yellow:  48 100% 67%;   /* #FFD700 */
```

---

## 3) Backgrounds & Gradients

### Global page background
```css
background: radial-gradient(ellipse at center, hsl(245 60% 12%) 0%, hsl(245 60% 8%) 100%);
background-color: hsl(245 60% 8%) !important; /* #0C0A1A fallback */
background-attachment: fixed;
```

The Landing view overrides root to solid black (`#000000`) so the video background shows through uninterrupted.

### Primary CTA gradient (all `bg-primary` buttons)
```css
background: linear-gradient(90deg, #08AF9A 0%, #7D3BED 100%);
/* Hover: */
background: linear-gradient(90deg, #07a08e 0%, #6d32d4 100%);
```
This gradient is applied globally via `.bg-primary { background: linear-gradient(...) !important }` in `index.css`. Every `bg-primary` button renders this gradient, not flat green.

### Other named gradients
```css
.spotify-gradient {
  background: linear-gradient(135deg, hsl(142 76% 36%) 0%, hsl(142 76% 42%) 100%);
}
.purple-gradient {
  background: linear-gradient(135deg, hsl(262 83% 58%) 0%, hsl(262 83% 65%) 100%);
}
.primary-gradient::before {
  /* Same as bg-primary — teal→purple horizontal */
  background: linear-gradient(90deg, #08AF9A 0%, #7D3BED 100%);
}
```

### Timeline background (CurvedTimeline)
```css
background:
  radial-gradient(ellipse at 20% 30%, rgba(153, 69, 255, 0.15) 0%, transparent 50%),
  radial-gradient(ellipse at 80% 70%, rgba(0, 206, 209, 0.15) 0%, transparent 50%),
  radial-gradient(ellipse at 50% 50%, rgba(255, 20, 147, 0.10) 0%, transparent 60%),
  hsl(245 60% 8%);
```

### SVG timeline path gradient
```
linearGradient (x1=0% y1=0% x2=100% y2=100%):
  Stop 0%:   hsl(262 83% 58%)  — purple  #9945FF
  Stop 50%:  hsl(328 100% 54%) — magenta #FF1493
  Stop 100%: hsl(180 100% 50%) — cyan    #00CED1
```

### Gradient borders (CSS utility classes)
```css
/* Magenta-to-purple gradient border (used on active player card in PlayerHeader) */
.gradient-border-magenta::before {
  background: linear-gradient(135deg, #FF1493, #9945FF);
}

/* Cyan-to-teal gradient border */
.gradient-border-cyan::before {
  background: linear-gradient(135deg, #00CED1, #20B2AA);
}
```
Both use `-webkit-mask` compositing to show only the border itself, not the interior fill.

### Decades slider active track gradient
```css
background: linear-gradient(90deg, #08AF9A, #7D3BED); /* same teal→purple */
```

---

## 4) Typography

- **Single family**: `Nunito` (Google Fonts, weights 400–900) — the web approximation of iOS's SF Rounded, set as the default `sans` font in Tailwind. Chewy and Encode Sans were removed in the July 2026 parity pass.
- Legacy helper classes (`chewy-regular`, `encode-sans-*`) still exist in `index.css` but now map to Nunito weights (`chewy-regular` → Nunito 900).
- Score numbers and playback timers use `tabular-nums`; timeline node labels are 13px weight-900 white with a purple glow shadow (iOS NodeLabel).

### Type scale in use
| Context | Tailwind | px equiv |
|---|---|---|
| Page title (Waiting Room) | `text-5xl font-bold chewy-regular` | 48px |
| Winner heading | `text-3xl md:text-5xl font-extrabold tracking-tight` | 30–48px |
| Section label (settings) | `text-xl font-semibold` | 20px |
| Song title reveal | `text-sm md:text-base` | 14–16px |
| Player header | `text-[10px] md:text-xs` | 10–12px |
| Chip labels | `text-sm` | 14px |
| Badges / helper text | `text-xs` | 12px |
| Decade tick labels | `text-[10px] font-medium text-foreground/70` | 10px |
| Code digits | `text-4xl font-bold tracking-wider` | 36px |

---

## 5) Spacing & Layout

- **Base unit**: 4px (Tailwind default)
- **Page container**: `px-6` horizontal, `max-w-sm` (384px) inner wrapper
- **Viewport**: `100dvh`/`100dvw`, `overflow: hidden`
- **Safe area**: handled per-view via `paddingTop: "max(1rem, env(safe-area-inset-top))"` and `paddingBottom: "max(2rem, env(safe-area-inset-bottom))"`

Common vertical rhythm:
| Tailwind class | px |
|---|---|
| `space-y-2` | 8px |
| `space-y-3` | 12px |
| `space-y-4` | 16px |
| `space-y-6` | 24px |
| `gap-2` | 8px |
| `gap-3` | 12px |
| `gap-4` | 16px |
| `p-3` | 12px |
| `p-4` | 16px |
| `p-6` | 24px |

---

## 6) Shadows & Glow Effects

### Utility box shadows
```css
.mobile-shadow {
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06),
    0 0 0 1px rgba(255, 255, 255, 0.05);
}

.glow-green  { box-shadow: 0 0 20px rgba(34, 197, 94, 0.3); }
.glow-purple { box-shadow: 0 0 20px rgba(147, 51, 234, 0.3); }
```

### Neon glow classes
```css
.neon-glow-cyan    { box-shadow: 0 0 20px rgba(0, 206, 209, 0.5),   0 0 40px rgba(0, 206, 209, 0.3); }
.neon-glow-magenta { box-shadow: 0 0 20px rgba(255, 20, 147, 0.5),  0 0 40px rgba(255, 20, 147, 0.3); }
.neon-glow-purple  { box-shadow: 0 0 20px rgba(153, 69, 255, 0.5),  0 0 40px rgba(153, 69, 255, 0.3); }
.neon-glow-blue    { box-shadow: 0 0 20px rgba(65, 105, 225, 0.5),  0 0 40px rgba(65, 105, 225, 0.3); }
```

### Play button glow (dynamic, driven by `glowIntensity`)
```javascript
// Playing state:
boxShadow: 'inset 0 0 20px rgba(255,255,255,0.3), inset 0 0 40px rgba(0,214,192,0.5)'
// Idle (animated):
boxShadow: `inset 0 0 ${10 + (glowIntensity - 0.3) * 20}px rgba(255,255,255,${glowIntensity * 0.4}), inset 0 0 ${30 + (glowIntensity - 0.3) * 30}px rgba(0,214,192,${glowIntensity * 0.6})`
```

---

## 7) Visual Hierarchy Tokens

| Layer | Class | Radius | Surface |
|---|---|---|---|
| Container/card | `.container-card` | `rounded-xl` (12px) | `bg-card border-border mobile-shadow` |
| Button/chip | `.setting-button` | `rounded-md` (10px) | explicit border |
| Touch feedback | `.touch-button` | — | `transition-all duration-200 ease-out; active:scale-95` |
| Inline action | `.inline-link-button` | none | transparent, underline |

---

## 8) Buttons & CTAs

### Primary CTA
```jsx
<Button className="w-full h-12 px-4 bg-primary text-primary-foreground font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 no-focus-outline">
  Primary Action
</Button>
```
`bg-primary` renders the teal→purple gradient due to the global CSS override. No separate gradient class needed.

### Secondary (outline)
```jsx
<Button variant="outline" className="w-full h-12 px-4 border border-border bg-transparent hover:bg-input font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2 setting-button no-focus-outline">
  Secondary Action
</Button>
```

### Spec
- Height: `h-12` (48px) for all page-level CTAs
- Padding: `px-4`
- Text: `font-semibold`, `whitespace-nowrap`
- Layout: `flex items-center justify-center gap-2`
- Focus: `no-focus-outline` (removes persistent mobile tap highlight); `force-no-outline` for icon buttons like play/pause
- Primary uses gradient, **not** flat green and **not** solid purple
- Secondary uses `bg-transparent` + `border-border`; hover → `bg-input`

### Destructive (exit confirmation)
```jsx
<button className="w-full h-12 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold touch-button whitespace-nowrap flex items-center justify-center gap-2">
```

---

## 9) Inputs

### Standard text input
```jsx
<Input className="bg-input border-border text-foreground h-11 focus:ring-primary" />
```

### Game Code (4-digit)
```jsx
<div className="flex gap-2 justify-center">
  {codeDigits.map((digit, i) => (
    <Input
      key={i}
      id={`code-${i}`}
      className="bg-input border-border text-foreground text-center h-12 w-12 text-lg focus:ring-primary"
      maxLength={1}
    />
  ))}
</div>
```
Auto-advance on input; backspace moves focus to previous field when empty.

> iOS Safari fix: all inputs have `font-size: 16px !important` to prevent auto-zoom on focus.

---

## 10) Option Chips (Difficulty, Genres, Hits to Win)

Active chip (filled gradient):
```jsx
<Button className="h-10 text-sm touch-button setting-button border border-border" variant="default">
  Normal
</Button>
```

Inactive chip (ghost):
```jsx
<Button
  className="h-10 text-sm touch-button setting-button border border-border focus:ring-0 focus:bg-transparent"
  variant="ghost"
>
  Easy
</Button>
```

Genre chips (left-aligned, taller for emoji):
```jsx
<Button className="h-auto py-2 text-sm justify-start touch-button setting-button border border-border focus:ring-0 focus:bg-transparent">
  <span className="text-2xl mr-2">🎸</span> Rock
</Button>
```
Grid layout: `grid grid-cols-2 gap-2` for difficulty and genre; `grid grid-cols-3 gap-2` for hits-to-win; `grid grid-cols-3 gap-4 px-8` for music source mode buttons.

---

## 11) View-by-View Layout Specs

### Landing View (`Landing.jsx`)
- Root: `flex flex-col items-center justify-between relative text-foreground px-6 landing-container`
- Root inline style: `{ backgroundColor: '#000000', minHeight: '100dvh', paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }`
- Background: fullscreen `<video>` with `object-cover`; gradient overlay `bg-gradient-to-t from-black/100 to-transparent z-[1]`
- Logo: `h-16 sm:h-20 w-auto mx-auto` inside `text-center pt-8 sm:pt-12 relative z-10`
- Form wrapper: `w-full max-w-sm space-y-3 sm:space-y-4 relative z-10 pb-8 sm:pb-12`
- Name input: `h-11`
- "Create Game" button: `w-full h-12 bg-primary …`
- "Join with code" button: `w-full h-12 … outline-button-override` (outline style)
- Error: `text-destructive text-center text-sm mt-3 p-2 bg-destructive/10 rounded-md`
- "How to play" link: `text-sm text-foreground/30 underline underline-offset-2 bg-transparent border-none` — bottom of view, `mt-8 pt-4`

### Waiting Room (`WaitingRoom.jsx`)
- Root: `waiting-room-container flex flex-col items-center text-foreground px-6`
- Root inline style: `{ backgroundColor: 'hsl(var(--background))', height: '100dvh', paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }`
- Inner scroll wrapper: `w-full max-w-sm space-y-6 my-auto py-8`
- Title: `text-5xl font-bold chewy-regular text-foreground mb-2` — centered
- Code+Players Card: `bg-card border-border mobile-shadow container-card`; content `p-6`
  - Game code label: `text-sm text-muted-foreground mb-2`
  - Game code value: `text-4xl font-bold text-foreground tracking-wider select-all mb-2`
  - "Share this code" text: `text-xs text-muted-foreground`
  - Players header: `text-lg font-semibold text-foreground mb-3`
  - Player row: `flex items-center justify-between p-3 bg-input rounded-lg h-12`
    - Name: `font-medium text-foreground`
    - Host badge: `text-xs text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded border border-primary/20`
    - Kick icon button: `bg-transparent border-0 p-2 -m-2 focus:outline-none`; icon `w-4 h-4 text-muted-foreground`
  - Status message: `mt-4 text-sm text-foreground text-center` (inline, no colored block)
- Action buttons: `space-y-3` containing Settings (outline), Leave (outline), Start Game (primary gradient)

### Player Header (`PlayerHeader.jsx`)
- Header: `w-full bg-card flex items-center justify-between p-2 md:px-2 md:py-1`
- Player card typography: `text-[10px] md:text-xs`
- Player card (non-active): `flex flex-col rounded-xl items-center px-1.5 py-1 md:px-2 md:py-1 bg-card/50 border-2 border-border justify-center relative`
- Active player card: same + `gradient-border-magenta neon-glow-magenta` (2px animated gradient border + magenta outer glow)
- Player card sizes (responsive to count):
  - 4 players: `min-w-[60px] max-w-[80px]`
  - ≤3 players: `min-w-[70px] md:min-w-[80px]`
- Score: `font-semibold text-base md:text-lg text-foreground`
- Score animation: `animate-pulse bg-primary/10 rounded-md px-1` (on score change)
- Token coins: stacked with `left: ${i * 7}px` offset, `zIndex: count - i`

### Game Footer (`GameFooter.jsx`)
- Container: `w-full bg-card shadow flex flex-col items-center px-1 py-1 md:py-2 border-t border-border rounded-t-2xl`
- Progress bar (compact, used during play): `relative flex-1 h-1 bg-input rounded-full overflow-hidden`; fill: `absolute left-0 top-0 h-1 bg-primary rounded-full`
- Progress bar (full, song reveal): `relative flex-1 h-2 bg-input rounded-full overflow-hidden`; fill: `h-2 bg-primary rounded-full`
- Play/pause button: `w-12 h-12 md:w-20 md:h-20 rounded-full`; color `rgba(0,214,192, …)` / `#00D6C0` when playing; size pulses via `transform: scale(…)`
- Restart button: `w-8 h-8 md:w-10 md:h-10 rounded-full bg-input hover:bg-input/90`
- Album art (reveal state): `w-20 h-20 md:w-32 md:h-32 rounded overflow-hidden bg-card`
- Song info layout: `flex items-center gap-4 justify-center w-full mb-2`
- Safe area bottom: `paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0px)"`

### Game Timeline (`CurvedTimeline.jsx`)
- Container: `curved-timeline-container w-full h-full relative overflow-hidden`
- Background: multi-radial gradient on background with animated star dots + floating blurred orbs (100–220px, `filter: blur(40px)`, `opacity: 0.3`)
- SVG path: gradient purple→magenta→cyan; blur glow layer at `rgba(153,69,255,0.8)` strokeWidth 20, `filter: blur(4px)`, `opacity: 0.15`
- Timeline node states:
  - Default: `bg-gray-600 border-gray-500 shadow-md shadow-black/20`
  - Hovered: `border-[#9945FF] shadow-md shadow-purple-400/30`
  - Selected: gradient `linear-gradient(135deg,#FF1493,#9945FF)` + `neon-glow-magenta`
  - Disabled: `border-[#FF1493] opacity-50`
  - Placed correct: `bg-green-500 border-green-400 shadow-lg shadow-green-500/50`
  - Placed wrong: `bg-red-500 border-red-400 shadow-lg shadow-red-500/50`
- Year card reveal animation: `outline: 5px solid #17F869` (correct) or `5px solid rgb(239,68,68)` (wrong); `wave-ripple` animation scales to 2.8×, 3.33s and 5s (staggered)
- Confetti colors: `['#17F869', '#9945FF', '#00CED1', '#FF1493', '#FFD700', '#FF69B4']`

### Winner View (`WinnerView.jsx`)
- Full-screen: `fixed inset-0 z-50 flex items-center justify-center bg-background overflow-hidden`
- Confetti particles: `absolute top-0 w-2 h-3 rounded-sm`, `dropConfetti` animation, colors `#10B981 #3B82F6 #8B5CF6 #F59E0B #EF4444` with `0 0 8px ${color}55` glow
- Trophy: `text-7xl md:text-8xl drop-shadow-[0_0_20px_rgba(255,215,0,0.4)]`, `trophyBounce` animation (2.2s)
- Glow behind trophy: `absolute inset-0 blur-2xl rounded-full bg-primary/20 -z-10`, `glowPulse` animation (2.8s)
- Winner name: `text-3xl md:text-5xl font-extrabold tracking-tight text-foreground drop-shadow-lg`
- Scores table: `divide-y divide-border rounded-lg bg-card/20 backdrop-blur-sm border border-border`
  - Row: `flex items-center justify-between px-4 py-3`
  - Winner row: `bg-primary/10`
  - Rank: `text-sm font-bold text-primary` (1st) / `text-muted-foreground` (others)
- Buttons: `mt-8 flex items-center gap-3` — Play Again (primary) + Return to Lobby (outline)

### Settings Panel (`GameSettings.jsx`, used inside WaitingRoom)
- Root: `space-y-6`, `paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 30px)"`
- Section labels: `text-xl font-semibold text-foreground`
- Music source buttons: `relative overflow-hidden rounded-md`, aspect ratio 4:3; active state uses gradient border mask (same teal→purple gradient, `padding: '3px'`, mask-composite technique)
- Decades range slider: custom component `DecadesTimeline`
  - Track background: 1px height, `bg-border/40`, `rounded-full`
  - Active track: 1px, `linear-gradient(90deg, #08AF9A, #7D3BED)`
  - Min handle: 20×20px circle, `borderColor: '#08AF9A'`, `boxShadow: '0 0 0 3px rgba(8,175,154,0.2)'`
  - Max handle: same with `#7D3BED` / `rgba(125,59,237,0.2)`
  - Tick labels: `text-[10px] font-medium text-foreground/70`, positioned `top: 22px`
- Spotify toggle: `h-8 w-[51px] rounded-full`; knob `h-7 w-7 bg-white rounded-full shadow-lg`; enabled bg `#7D3BED`; disabled `bg-gray-400`
- Toggle container: `rounded-lg border border-border/50 bg-white/5 px-4 py-3`
- Reset: `inline-link-button` (see §12 below)

---

## 12) Inline Text Actions

### `.inline-link-button` utility class
```css
.inline-link-button {
  @apply text-foreground underline font-semibold text-sm p-2 -m-2
         flex items-center gap-2 hover:text-foreground/80
         focus:outline-none bg-transparent border-0 rounded-none appearance-none;
}
```
Use for page-level inline actions (Reset, Clear, etc.) that shouldn't take CTA prominence.

### List-row icon button (e.g. Kick)
```jsx
<button
  onClick={handleKick}
  aria-label={`Kick ${name}`}
  className="bg-transparent border-0 p-2 -m-2 rounded focus:outline-none"
>
  <svg className="w-4 h-4 text-muted-foreground hover:text-foreground" ...>
    <path d="M6 18L18 6" /><path d="M6 6L18 18" />
  </svg>
</button>
```
- Icon: `w-4 h-4`, color `text-muted-foreground`, hover `text-foreground`
- Touch area: `p-2 -m-2` gives 44px+ area around 16px icon
- No background or border

---

## 13) Status & Messaging

- Default: inline `text-sm text-foreground text-center mt-4` inside the relevant card — no colored block.
- Error: `text-destructive text-center text-sm mt-3 p-2 bg-destructive/10 rounded-md`
- Warning in exit modal: yellow warning SVG icon (`text-yellow-500`) + `text-sm text-muted-foreground`; title `text-lg font-semibold text-foreground`
- Host badge: `text-xs text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded border border-primary/20`

---

## 14) Animations & Keyframes

### Global utility classes
```css
.touch-button          { transition-all duration-200 ease-out }
.touch-button:active   { scale-95 }
.interactive-card      { transition-all duration-300 ease-out }
.interactive-card:hover { -translate-y-1 shadow-2xl }
```

### Keyframe definitions
```css
@keyframes float {          /* Cosmic background dots */
  0%,100% { transform: translateY(0) translateX(0); opacity: 0.3; }
  25%      { transform: translateY(-20px) translateX(10px); opacity: 0.6; }
  50%      { transform: translateY(-40px) translateX(-10px); opacity: 0.3; }
  75%      { transform: translateY(-20px) translateX(10px); opacity: 0.6; }
  /* Duration: 20s, infinite, ease-in-out */
}

@keyframes wave-ripple {    /* Post-place year card ripple */
  0%   { transform: scale(1); opacity: 0.75; }
  100% { transform: scale(2.8); opacity: 0; }
  /* First wave: 3.33s; Second wave: 5s with 0.67s delay */
}

@keyframes confetti-burst { /* Tap-confirm confetti */
  0%   { transform: translate(-50%,-50%) translate(0,0) scale(1); opacity: 1; }
  100% { transform: translate(-50%,-50%) translate(var(--confetti-x),var(--confetti-y)) scale(0); opacity: 0; }
}

@keyframes dropConfetti {   /* Winner screen falling confetti */
  0%   { transform: translateY(-120vh) rotate(0deg); opacity: 0; }
  10%  { opacity: 1; }
  100% { transform: translateY(110vh) rotate(720deg); opacity: 0.9; }
}

@keyframes trophyBounce {   /* Winner trophy */
  0%,100% { transform: translateY(-16px) scale(1); }
  50%      { transform: translateY(0) scale(1.05); }
  /* Duration: 2.2s, ease-in-out, infinite */
}

@keyframes glowPulse {      /* Glow behind trophy */
  0%,100% { opacity: 0.35; transform: scale(1); }
  50%      { opacity: 0.60; transform: scale(1.1); }
  /* Duration: 2.8s, ease-in-out, infinite */
}
```

---

## 15) Focus & Accessibility

- Global tap highlight: `-webkit-tap-highlight-color: transparent` on `*`
- `.no-focus-outline`: removes outline after mobile tap (`:focus:not(:focus-visible)`)
- `.force-no-outline`: removes outline on all states including `:focus-visible` — used only on media control buttons (play/pause/restart)
- All interactive elements: `min-height: 44px; min-width: 44px` on mobile (≤768px)
- Keyboard accessible: all actions use `<button>` elements (not divs)
- Inputs: `font-size: 16px !important` on iOS to prevent auto-zoom

---

## 16) Z-Index Hierarchy

| z-index | Usage |
|---|---|
| `0` | Background stars / orbs |
| `1` | Landing gradient overlay |
| `2–3` | SVG timeline paths and year nodes |
| `10` | Timeline title overlay |
| `50` | WinnerView full-screen overlay |
| `1000` | Fixed mobile header/footer |
| `9999` | Modal overlays (backdrop) |
| `10000` | Modal content panels |
| `10001` | Restart loading overlay |

---

## 17) Mobile Safe Area Utilities

```css
.mobile-fullscreen      { height: 100dvh; width: 100dvw; overflow: hidden; }
.mobile-safe-area       { padding: env(safe-area-inset-*); }
.mobile-safe-area-top   { padding-top: env(safe-area-inset-top); }
.mobile-safe-area-bottom{ padding-bottom: env(safe-area-inset-bottom); }
.mobile-fixed-top       { position: fixed; top: env(safe-area-inset-top); z-index: 1000; }
.mobile-fixed-bottom    { position: fixed; bottom: env(safe-area-inset-bottom); z-index: 1000; }
```

PWA standalone mode removes global body padding; each view component adds its own `paddingTop/paddingBottom` via inline style using `max(Xrem, env(safe-area-inset-*))`.

---

## 18) Cross-Platform Parity (July 2026)

The former "iOS Translation Readiness" checklist is complete — the direction reversed: iOS was redesigned first and the web was brought to parity. The shared visual spec now lives in code:

| Element | iOS source of truth | Web implementation |
|---|---|---|
| Color tokens | `Design/BeatableColors.swift` | `index.css` `:root` + `tailwind.config.js` (`surface`, `surface-2`, `footer-panel`, `gap-circle`, `coin`) |
| Space background | `Components/SpaceBackground.swift` | `components/design/SpaceBackground.jsx` (3 blurred orbs + 25 seeded drifting stars, full-screen behind the game view) |
| Timeline | `Components/TimelineView.swift` + `TimelineLayout.swift` | `components/timeline/*` — fixed 4-row scale layout, neon tube path (magenta glow w30/blur12/0.18 + 4px purple→magenta→cyan core), 40px album-art nodes, magenta "?" MysteryNode with double ripple, 24px gap circles, spring placement animation (`usePlacementAnimation.js`, spring 0.35/bounce 0.6 + 105px overshoot) |
| Bottom sheets | `Components/BottomCard.swift` | `components/design/BottomCard.jsx` (top-corner 28, rising purple glow, white/8 edge, separate backdrop fade) — used by SongGuessModal + SongDetailSheet |
| Phase footer (challenge window / resolved / reveal / song-guess-wait) | `GameView.swift` `PhaseActionsFooter` | rendered **inline in the footer** in `GameFooter.jsx` — NOT floating panels (iOS `ChallengeWindowPanel`/`ChallengeResolvedOverlay` structs are dead code). `ChallengeSheet.jsx` only provides `ResolvedIcon` + `SheetButton`. Song-guess fields (`SongGuessModal` BottomCard) auto-open on your turn |
| Song detail | `Components/SongDetailSheet.swift`, opened via `TimelineView` `onCardTap` | tap a timeline ArtNode → `SongDetailSheet.jsx` (hi-res art, teal year, official Apple Music PNG badge at `public/img/listen-on-apple-music.png`). Footer song info is display-only |
| Lobby settings | `LobbyView.swift` Creator/GuestSettingsPanel | `GameSettings.jsx` card layout + `readOnly` prop; always shown in `WaitingRoom.jsx` (editable host / read-only guest). No game-start modal |
| Score header | `GameView.swift` ScoreHeader | `PlayerHeader.jsx` (quarter-width cards, active = magenta gradient border + dual glow @0.6 r8 / @0.3 r18, inactive `surface-2/85`) |
| Coins | `GameView.swift` CoinView/OverlappingCoins + flight animations | `components/design/CoinView.jsx` + `CoinFlightLayer.jsx` (payment: pop 1.7 + fly up 340px; award: fly down + land + card bounce at +0.42s) |
| Notifications | `GameView.swift` EventNotificationCard | `components/design/EventNotificationCard.jsx` (bottom slide-up, colored glowing icon, colored/35 border) |
| Sounds | `Audio/SoundManager.swift` | `utils/soundUtils.js` + `utils/useGameSounds.js` — 8 sounds (place .45, correct .5, challenge .55, credit .6, bonus .6, casino .6, win .6, lose .5) |
| Live placement preview | backend relay (`preview_placement`/`placement_preview`) | emitted from `App.handlePendingDrop`, rendered as a MysteryNode for observers via `remotePreviewIndex` |
| Game over | `GameView.swift` GameOverOverlay | `WinnerView.jsx` (radial purple backdrop, trophy spring-in + ±5° rock, magenta glow, surface-2 scores card, #1 row teal/10) |

**iOS-native bits that intentionally have no web equivalent**: haptics (`UIImpactFeedbackGenerator`), AVAudioSession handling, keyboard prewarming, `beatably://` deep links.

**Shared motion values**: press scale 0.95 @120ms; sheets/phase `cubic-bezier(0.34, 1.3, 0.64, 1)` @350ms; ripples ease-out 2.2–2.5s infinite; pulses ease-in-out 1.4s; view fade 250ms.

---

## 19) Checklist for New/Updated Views

- [ ] Background: deep navy `hsl(245 60% 8%)` or radial gradient variant; never plain black except Landing
- [ ] Primary CTA: `bg-primary` (renders teal→purple gradient); `h-12 px-4 font-semibold whitespace-nowrap`
- [ ] Secondary: outline, `bg-transparent border-border hover:bg-input`
- [ ] Cards: `bg-card border-border mobile-shadow container-card` (`rounded-xl`)
- [ ] Buttons/chips: `.setting-button` (`rounded-md`); active=gradient, inactive=ghost+border
- [ ] Status text: inline inside relevant card, `text-sm text-foreground text-center mt-4`
- [ ] No flat solid purple or green CTAs — gradient only for primary
- [ ] Add `no-focus-outline` to all buttons; `force-no-outline` for media control buttons only
- [ ] Safe area: `paddingTop: "max(1rem, env(safe-area-inset-top))"` on root views
- [ ] Touch targets ≥ 44×44px; use `p-2 -m-2` trick for icon-only buttons
- [ ] Player card active state: `gradient-border-magenta neon-glow-magenta`
- [ ] Player card inactive: `bg-card/50 border-2 border-border rounded-xl`
