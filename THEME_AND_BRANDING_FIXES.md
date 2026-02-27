# Theme & Branding Fixes — FCP Workbench v0.1.0

## OVERVIEW

The dark theme works well. The **light mode** and **blue mode** have serious contrast problems where text becomes invisible or nearly unreadable. This document specifies exactly what needs to change, where, and what the correct colors should be. Additionally, we need "Anton" branding with an icon in the bottom-left sidebar area.

---

## PROBLEM 1: Card Titles Invisible on Dashboard (Blue/Light Modes)

**Where:** Dashboard → module cards (the 2×4 grid)  
**What's broken:** The card title text (e.g., "AMLR Gap Analysis", "Document Creation", "Training Content", "AMLA Data Management") uses teal (#2DD4A8 or similar) which is invisible against the dark card backgrounds in blue mode, and would be low-contrast on light card backgrounds in light mode. In the second row, titles are completely gone.

**Fix — ensure card titles use high-contrast colors per theme:**

```css
/* DARK MODE (working — keep as-is) */
.dark .module-card h3,
.dark .module-card-title {
  color: #FFFFFF;  /* White on dark cards — high contrast */
}

/* LIGHT MODE */
.light .module-card h3,
.light .module-card-title {
  color: #0B1426;  /* Near-black on light cards */
}

/* BLUE MODE */
.blue .module-card h3,
.blue .module-card-title {
  color: #FFFFFF;  /* White on dark-blue cards */
}
```

**The root issue:** Card titles are likely using `text-teal-400` or the `adv-teal` color variable, which only works on very dark backgrounds. Card titles should ALWAYS use the primary foreground color for the theme — white in dark/blue modes, near-black in light mode. The teal accent should only be used for the card icon circles, not the title text.

**If using Tailwind/CSS variables, the fix pattern is:**

```css
/* In your theme CSS variables */
:root {
  /* Light mode defaults */
  --card-title-color: #0F172A;      /* slate-900 — near-black */
  --card-body-color: #475569;       /* slate-600 — readable gray */
  --card-bg: #FFFFFF;               /* white card */
  --card-border: #E2E8F0;          /* subtle border */
  --section-label-color: #334155;   /* slate-700 */
  --muted-text-color: #64748B;      /* slate-500 */
  --page-title-color: #0F172A;      /* near-black */
  --page-subtitle-color: #475569;   /* readable gray */
}

.dark {
  --card-title-color: #FFFFFF;       /* white */
  --card-body-color: #E0E0E0;       /* off-white */
  --card-bg: #152238;               /* adv-card */
  --card-border: #1E3A5F;           /* subtle dark border */
  --section-label-color: #E0E0E0;   /* off-white */
  --muted-text-color: #B0B0B0;      /* gray */
  --page-title-color: #FFFFFF;
  --page-subtitle-color: #B0B0B0;
}

.blue {
  --card-title-color: #FFFFFF;       /* white — NOT teal */
  --card-body-color: #CBD5E1;       /* slate-300 */
  --card-bg: #1E293B;               /* slate-800 */
  --card-border: #334155;           /* slate-700 */
  --section-label-color: #E2E8F0;   /* slate-200 */
  --muted-text-color: #94A3B8;      /* slate-400 */
  --page-title-color: #FFFFFF;
  --page-subtitle-color: #94A3B8;
}
```

---

## PROBLEM 2: Module Page Title Nearly Invisible (Blue/Light Modes)

**Where:** Module page → main title (e.g., "AMLR Gap Analysis" at top of config panel)  
**What's broken:** The title uses a teal color or a teal-with-transparency/gradient effect. In blue mode it appears as faint teal-on-dark, barely readable. The subtitle text below it is similarly faded.

**Fix:**

```css
/* Module page title — must always be high contrast */
.module-page-title {
  color: var(--page-title-color);  /* White in dark/blue, near-black in light */
  font-weight: 700;
  /* REMOVE any: opacity, gradient, text-shadow that might be dimming it */
}

.module-page-subtitle {
  color: var(--page-subtitle-color);  /* #B0B0B0 dark/blue, #475569 light */
}
```

**Specific check:** Look for any CSS like `background: linear-gradient(...)` or `background-clip: text` or `-webkit-text-fill-color` on the module title. If the title has a gradient text effect, remove it in blue/light modes — it only works reliably on the dark theme background.

---

## PROBLEM 3: Section Labels Too Faint (Blue/Light Modes)

**Where:** Module config panel → section headers like:
- "How deeply should Claude analyze?"
- "Writing style"
- "Knowledge Sources"
- "What should Claude produce?"

**What's broken:** These labels use a very muted gray that's almost invisible against the panel background in blue mode. They appear to use something like `text-gray-600` or `text-muted-foreground` that's been set too dim.

**Fix:**

```css
/* Section labels must be clearly readable */
.section-label,
.config-section-title {
  color: var(--section-label-color);
  font-weight: 600;
  font-size: 0.875rem; /* 14px minimum */
}
```

**Per theme:**
| Theme | Section Label Color | Notes |
|-------|-------------------|-------|
| Dark  | `#E0E0E0` (off-white) | Current is fine |
| Blue  | `#E2E8F0` (slate-200) | Must be light enough to read on slate-800 bg |
| Light | `#334155` (slate-700) | Dark enough to read on white/gray bg |

---

## PROBLEM 4: Web Search Checkbox Label Invisible (Blue Mode)

**Where:** Knowledge Sources → Claude's Own Knowledge → "Enable web search" checkbox area  
**What's broken:** In blue mode, the checkbox label text for the web search toggle is invisible. Only the green checkbox icon shows. The label text is likely using a color that matches the card background.

**Fix:** Ensure all checkbox/toggle label text uses `var(--card-body-color)`:

```css
.knowledge-source-card label,
.knowledge-source-card .checkbox-label,
.knowledge-source-card p {
  color: var(--card-body-color);
}

/* The small descriptor text under each knowledge source title */
.knowledge-source-description {
  color: var(--muted-text-color);
}
```

---

## PROBLEM 5: Thinking Control Button Labels (Blue/Light Mode)

**Where:** "How deeply should Claude analyze?" → the 5 buttons (Quick, Think, Think Hard, Investigate, Plan First)  
**What's broken:** The inactive button labels may have insufficient contrast in non-dark themes. The active/selected button (Investigate with teal background) works fine — but the inactive ones may be hard to read.

**Fix:**

```css
/* Inactive thinking buttons */
.thinking-button {
  color: var(--card-body-color);
  background: var(--card-bg);
  border: 1px solid var(--card-border);
}

/* Active/selected thinking button — keep as-is (teal bg, white text) */
.thinking-button.active,
.thinking-button[aria-selected="true"] {
  color: #FFFFFF;
  background: #2DD4A8;
  border-color: #2DD4A8;
}

/* Hover state */
.thinking-button:hover:not(.active) {
  background: var(--card-border); /* slightly highlighted */
}
```

---

## PROBLEM 6: Output Format Chip Contrast (Blue/Light Mode)

**Where:** "What should Claude produce?" → chip labels (Executive Summary, Decision Memo, etc.)  
**What's broken:** Unselected chips may have low contrast text in blue/light modes. The currently-selected chips (teal background) look fine.

**Fix:**

```css
/* Unselected output format chips */
.output-chip {
  color: var(--card-body-color);
  background: var(--card-bg);
  border: 1px solid var(--card-border);
}

/* Selected chips — keep as-is */
.output-chip.selected {
  color: #FFFFFF;
  background: #2DD4A8;
  border-color: #2DD4A8;
}
```

---

## PROBLEM 7: "Recent Sessions" Empty State Text

**Where:** Dashboard → "No sessions yet. Start by selecting a module above."  
**What's broken:** This text sits inside a dark teal-soft card. In light mode, the dark card looks out of place on a white background. The text itself may also have low contrast.

**Fix:**

```css
.empty-state-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
}

.empty-state-text {
  color: var(--muted-text-color);
}
```

---

## COMPLETE THEME COLOR REFERENCE TABLE

Use this as the master reference. Every text element should map to one of these variables.

| CSS Variable | Dark Mode | Blue Mode | Light Mode | Used For |
|---|---|---|---|---|
| `--bg-primary` | `#0B1426` | `#0F172A` (slate-900) | `#F8FAFC` (slate-50) | Page background |
| `--bg-secondary` | `#0F1B2D` | `#1E293B` (slate-800) | `#FFFFFF` | Panel/content background |
| `--card-bg` | `#152238` | `#1E293B` (slate-800) | `#FFFFFF` | Card backgrounds |
| `--card-border` | `#1E3A5F` | `#334155` (slate-700) | `#E2E8F0` (slate-200) | Card borders |
| `--card-title-color` | `#FFFFFF` | `#FFFFFF` | `#0F172A` (slate-900) | Card headings, module titles |
| `--card-body-color` | `#E0E0E0` | `#CBD5E1` (slate-300) | `#475569` (slate-600) | Card body text, labels |
| `--page-title-color` | `#FFFFFF` | `#F1F5F9` (slate-100) | `#0F172A` (slate-900) | Page/module titles (h1) |
| `--page-subtitle-color` | `#B0B0B0` | `#94A3B8` (slate-400) | `#64748B` (slate-500) | Subtitles, descriptions |
| `--section-label-color` | `#E0E0E0` | `#E2E8F0` (slate-200) | `#334155` (slate-700) | Config section headers |
| `--muted-text-color` | `#B0B0B0` | `#94A3B8` (slate-400) | `#64748B` (slate-500) | Helper text, captions |
| `--accent` | `#2DD4A8` | `#2DD4A8` | `#16A085` (darker teal) | Teal accent — buttons, active states, icons |
| `--accent-hover` | `#1BA882` | `#1BA882` | `#138D75` | Teal hover |
| `--accent-on-accent` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | Text ON teal buttons |
| `--sidebar-bg` | `#0B1426` | `#0F172A` | `#FFFFFF` | Sidebar background |
| `--sidebar-text` | `#B0B0B0` | `#94A3B8` | `#475569` | Sidebar inactive items |
| `--sidebar-active-bg` | `#2DD4A8` | `#2DD4A8` | `#2DD4A8` | Sidebar active item bg |
| `--sidebar-active-text` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | Sidebar active text |
| `--input-bg` | `#0F1B2D` | `#1E293B` | `#F1F5F9` (slate-100) | Input field backgrounds |
| `--input-border` | `#1E3A5F` | `#334155` | `#CBD5E1` (slate-300) | Input borders |
| `--input-text` | `#E0E0E0` | `#E2E8F0` | `#0F172A` | Input text |
| `--input-placeholder` | `#707070` | `#64748B` | `#94A3B8` | Placeholder text |
| `--header-bg` | `#0B1426` | `#0F172A` | `#FFFFFF` | Top header bar |
| `--header-text` | `#E0E0E0` | `#E2E8F0` | `#0F172A` | Header text |
| `--warning-text` | `#F5A623` | `#F5A623` | `#D97706` (amber-600) | Warning/API not configured |
| `--error-text` | `#E74C3C` | `#EF4444` | `#DC2626` (red-600) | Error states |
| `--output-panel-bg` | `#0F1B2D` | `#1E293B` | `#FFFFFF` | Right-side output panel |
| `--output-panel-text` | `#E0E0E0` | `#CBD5E1` | `#334155` | Output placeholder text |

---

## LIGHT MODE — SPECIFIC TEAL ADJUSTMENT

The standard teal `#2DD4A8` is designed for dark backgrounds. On white/light backgrounds, it becomes hard to read as text (WCAG AA fails for small text). 

**Rule:** In light mode, teal is ONLY used for:
- Button backgrounds (white text on teal button — this works)
- Icon circles (teal icon on white)
- Active sidebar highlight
- Selected chips

**Never use teal for:**
- Body text on light backgrounds
- Section labels
- Card titles
- Any text that needs to be read

If teal must appear as text in light mode (e.g., links), use the darker variant `#16A085` or `#0F766E` which passes WCAG AA on white.

```css
.light {
  --accent-text: #0F766E;  /* Teal-700 — readable on white */
  --accent: #2DD4A8;        /* Still used for backgrounds/icons */
}
```

---

## BLUE MODE — WHAT IT SHOULD LOOK LIKE

Blue mode should feel like a "softer dark mode" using Slate tones instead of the deep navy of the dark theme. It's still primarily dark, but with blue-gray undertones. Key principle: **all text colors from dark mode shift one step lighter** to compensate for the slightly different background hue.

```css
.blue {
  --bg-primary: #0F172A;    /* Slate-900 — slightly lighter than #0B1426 */
  --bg-secondary: #1E293B;  /* Slate-800 */
  --card-bg: #1E293B;       /* Same as secondary — cards blend into panels */
  --card-border: #334155;   /* Slate-700 — visible but subtle */
}
```

---

## IMPLEMENTATION APPROACH

The cleanest fix is to define all colors as CSS custom properties on the root/theme classes, then reference them everywhere. This avoids the problem of hardcoded Tailwind color classes that don't adapt to themes.

**Step 1:** Create or update the theme CSS file (likely `index.css` or a dedicated `themes.css`):

```css
/* themes.css — master theme definitions */
:root,
.dark {
  --bg-primary: #0B1426;
  --bg-secondary: #0F1B2D;
  --card-bg: #152238;
  --card-border: #1E3A5F;
  --card-title: #FFFFFF;
  --card-body: #E0E0E0;
  --page-title: #FFFFFF;
  --page-subtitle: #B0B0B0;
  --section-label: #E0E0E0;
  --muted: #B0B0B0;
  --accent: #2DD4A8;
  --accent-hover: #1BA882;
  --accent-text: #2DD4A8;
  --input-bg: #0F1B2D;
  --input-border: #1E3A5F;
  --input-text: #E0E0E0;
  --input-placeholder: #707070;
  --sidebar-bg: #0B1426;
  --sidebar-text: #B0B0B0;
  --sidebar-active-bg: #2DD4A8;
  --sidebar-active-text: #FFFFFF;
}

.blue {
  --bg-primary: #0F172A;
  --bg-secondary: #1E293B;
  --card-bg: #1E293B;
  --card-border: #334155;
  --card-title: #F1F5F9;
  --card-body: #CBD5E1;
  --page-title: #F1F5F9;
  --page-subtitle: #94A3B8;
  --section-label: #E2E8F0;
  --muted: #94A3B8;
  --accent: #2DD4A8;
  --accent-hover: #1BA882;
  --accent-text: #2DD4A8;
  --input-bg: #1E293B;
  --input-border: #334155;
  --input-text: #E2E8F0;
  --input-placeholder: #64748B;
  --sidebar-bg: #0F172A;
  --sidebar-text: #94A3B8;
  --sidebar-active-bg: #2DD4A8;
  --sidebar-active-text: #FFFFFF;
}

.light {
  --bg-primary: #F8FAFC;
  --bg-secondary: #FFFFFF;
  --card-bg: #FFFFFF;
  --card-border: #E2E8F0;
  --card-title: #0F172A;
  --card-body: #475569;
  --page-title: #0F172A;
  --page-subtitle: #64748B;
  --section-label: #334155;
  --muted: #64748B;
  --accent: #2DD4A8;
  --accent-hover: #1BA882;
  --accent-text: #0F766E;    /* Darker teal for readability on white */
  --input-bg: #F1F5F9;
  --input-border: #CBD5E1;
  --input-text: #0F172A;
  --input-placeholder: #94A3B8;
  --sidebar-bg: #FFFFFF;
  --sidebar-text: #475569;
  --sidebar-active-bg: #2DD4A8;
  --sidebar-active-text: #FFFFFF;
}
```

**Step 2:** Search and replace all hardcoded color references in components. Every instance of a hardcoded text color (like `text-white`, `text-gray-400`, `text-teal-400`, `text-[#E0E0E0]`, etc.) should be replaced with the corresponding CSS variable reference:

```
text-white → text-[var(--card-title)] or text-[var(--page-title)]
text-gray-400 → text-[var(--muted)]
text-teal-400 → text-[var(--accent-text)]  (ONLY for intentional accent text)
text-[#E0E0E0] → text-[var(--card-body)]
text-[#B0B0B0] → text-[var(--muted)]
bg-[#152238] → bg-[var(--card-bg)]
bg-[#0B1426] → bg-[var(--bg-primary)]
border-[#1E3A5F] → border-[var(--card-border)]
```

**Step 3:** Test all three themes by clicking through every page (Dashboard, each module, Workflows, Prompt, Settings) and verifying all text is readable.

---

## CONTRAST CHECKLIST (Test Each)

After implementing fixes, verify these specific elements in ALL THREE themes:

**Dashboard:**
- [ ] Page title "FCP Compliance AI Workbench" — clearly readable
- [ ] Subtitle "AI-powered tools..." — readable (can be lighter but not invisible)
- [ ] All 8 module card titles — bold, clearly readable
- [ ] All 8 module card descriptions — readable body text
- [ ] "Open module →" links — visible and look clickable
- [ ] "Recent Sessions" header — readable
- [ ] Empty state text — readable
- [ ] Sidebar module names — all readable
- [ ] "RECENT SESSIONS" sidebar label — readable
- [ ] "No recent sessions" — readable
- [ ] API status indicator ("API Not Configured") — visible

**Module page (test with Gap Analysis):**
- [ ] Module title "AMLR Gap Analysis" — bold, clearly readable, no gradient artifacts
- [ ] Module description text — readable
- [ ] "How deeply should Claude analyze?" label — clearly readable
- [ ] Thinking button labels (Quick, Think, Think Hard, Investigate, Plan First) — all readable
- [ ] Active thinking button — white text on teal, readable
- [ ] "Writing style" label — readable
- [ ] Strict/Balanced/Creative labels — readable
- [ ] Active writing style — white on teal
- [ ] "Knowledge Sources" label — readable
- [ ] Each knowledge source title (Claude's Own Knowledge, Online Regulation, Local Folders, Combined) — readable
- [ ] Each knowledge source description text — readable
- [ ] Checkbox labels (Enable web search) — readable
- [ ] "Focus area (optional)" label — readable
- [ ] Input placeholder text — visible but lighter
- [ ] Folder path text — readable
- [ ] "What should Claude produce?" label — readable
- [ ] Category labels (STRATEGIC, ANALYSIS, OPERATIONAL) — readable
- [ ] Chip text (Executive Summary, Decision Memo, etc.) — all readable
- [ ] Selected chip — white on teal
- [ ] Output panel placeholder text — readable

**Workflows page:**
- [ ] "Workflows" title — readable
- [ ] Category headers (MONITORING & SCANNING, etc.) — readable
- [ ] Workflow card titles — readable
- [ ] Workflow descriptions — readable
- [ ] Step count, duration, tags — readable

---

## FEATURE REQUEST: ANTON BRANDING (Bottom-Left Sidebar)

Add "Anton" branding with a small icon/logo at the bottom of the sidebar. There's available space below "RECENT SESSIONS / No recent sessions".

### Design Specification

```
┌────────────────────────┐
│                        │
│  ... sidebar content   │
│                        │
│  RECENT SESSIONS       │
│  No recent sessions    │
│                        │
│                        │  ← flexible space
│                        │
│ ┌────────────────────┐ │
│ │  ⬡  Anton          │ │  ← new branding element
│ │  FCP Workbench     │ │
│ │  v0.1.0            │ │
│ └────────────────────┘ │
└────────────────────────┘
```

### Implementation

```tsx
// At the bottom of Sidebar.tsx — use mt-auto to push to bottom

<div className="mt-auto px-4 py-4 border-t border-[var(--card-border)]">
  <div className="flex items-center gap-3">
    {/* Anton Logo/Icon */}
    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#2DD4A8] to-[#1BA882] flex items-center justify-center shadow-md">
      <span className="text-white font-bold text-lg">A</span>
    </div>
    <div>
      <div className="text-sm font-semibold text-[var(--card-title)]">
        Anton
      </div>
      <div className="text-xs text-[var(--muted)]">
        FCP Workbench v0.1.0
      </div>
    </div>
  </div>
</div>
```

### Anton Icon Options

**Option A — Gradient Letter (simplest, recommended):**
A rounded square with teal gradient, white "A" letter inside. Clean, professional, matches Advisense aesthetic.

```tsx
<div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#2DD4A8] to-[#0F766E] flex items-center justify-center shadow-md">
  <span className="text-white font-bold text-lg tracking-tight">A</span>
</div>
```

**Option B — Shield icon (FCP/compliance feel):**
A shield icon from Lucide with "A" inside, conveying protection/compliance.

```tsx
import { Shield } from 'lucide-react';

<div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#2DD4A8] to-[#0F766E] flex items-center justify-center shadow-md relative">
  <Shield className="w-5 h-5 text-white" />
  <span className="absolute text-[8px] font-bold text-white mt-0.5">A</span>
</div>
```

**Option C — Hexagon (modern, tech feel):**

```tsx
<div className="w-9 h-9 flex items-center justify-center">
  <svg viewBox="0 0 36 36" className="w-9 h-9">
    <defs>
      <linearGradient id="antonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#2DD4A8' }} />
        <stop offset="100%" style={{ stopColor: '#0F766E' }} />
      </linearGradient>
    </defs>
    <polygon
      points="18,2 32,10 32,26 18,34 4,26 4,10"
      fill="url(#antonGrad)"
      rx="2"
    />
    <text x="18" y="22" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="Inter, sans-serif">
      A
    </text>
  </svg>
</div>
```

### Sidebar Structure (Full)

The sidebar should use flexbox with `flex-col` and `h-full` so the branding is always pushed to the bottom:

```tsx
<aside className="flex flex-col h-full w-56 bg-[var(--sidebar-bg)] border-r border-[var(--card-border)]">
  {/* Top: User info */}
  <div className="px-4 py-4">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-full bg-[#2DD4A8] flex items-center justify-center">
        <span className="text-white font-semibold text-sm">A</span>
      </div>
      <div>
        <div className="text-sm font-semibold text-[var(--card-title)]">Anton</div>
        <div className="text-xs text-[var(--muted)]">FCP Workbench</div>
      </div>
    </div>
  </div>

  {/* Navigation */}
  <nav className="flex-1 px-2 overflow-y-auto">
    {/* Dashboard, Prompt, Workflows links */}
    {/* MODULES section with all 8 modules */}
    {/* RECENT SESSIONS section */}
  </nav>

  {/* Bottom: Anton branding — always at bottom */}
  <div className="px-4 py-3 border-t border-[var(--card-border)]">
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#2DD4A8] to-[#0F766E] flex items-center justify-center shadow-sm">
        <span className="text-white font-bold text-sm">A</span>
      </div>
      <div>
        <div className="text-sm font-semibold text-[var(--card-title)] tracking-tight">
          Anton
        </div>
        <div className="text-[10px] text-[var(--muted)]">
          FCP Workbench v0.1.0
        </div>
      </div>
    </div>
  </div>
</aside>
```

---

## SUMMARY OF ALL CHANGES

| Priority | Component | Fix |
|----------|-----------|-----|
| 🔴 Critical | Dashboard card titles | Change from teal/accent to `var(--card-title)` (white in dark/blue, dark in light) |
| 🔴 Critical | Module page title | Remove gradient/opacity effects. Use solid `var(--page-title)` |
| 🔴 Critical | Section labels | Change to `var(--section-label)` — must be clearly readable |
| 🔴 Critical | Knowledge source text | All labels and descriptions use `var(--card-body)` and `var(--muted)` |
| 🟡 High | Web search checkbox label | Ensure label text uses `var(--card-body)`, not invisible color |
| 🟡 High | Thinking button labels | Inactive buttons: `var(--card-body)` text on `var(--card-bg)` background |
| 🟡 High | Output format chips | Unselected: `var(--card-body)` text, `var(--card-bg)` background |
| 🟡 High | Input fields | Text: `var(--input-text)`, placeholder: `var(--input-placeholder)`, bg: `var(--input-bg)` |
| 🟢 New | Anton branding | Add to sidebar bottom with teal gradient icon + "Anton" + "FCP Workbench v0.1.0" |
| 🟢 Nice | Light mode teal text | Use `#0F766E` (teal-700) instead of `#2DD4A8` for any text on white backgrounds |

---

## HOW TO TEST

1. Open the app at `http://localhost:5174`
2. Click the theme toggle (moon/sun icon in the top header bar)
3. Cycle through: Dark → Blue → Light
4. On each theme, check:
   - Dashboard page
   - Any module page (Gap Analysis is best — it has all components)
   - Workflows page
5. Use the contrast checklist above
6. WCAG AA minimum contrast ratios: 4.5:1 for normal text, 3:1 for large text (18px+ or 14px bold)

**Quick contrast check tool:** Paste foreground and background hex colors into https://webaim.org/resources/contrastchecker/ to verify.
