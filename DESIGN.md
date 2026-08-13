---
name: Report Analysis
description: A quiet, evidence-first workspace for trustworthy Facebook performance analysis.
colors:
  ink: "#1c1917"
  text-muted: "#68625d"
  text-faint: "#817a74"
  border-stone: "#e7e5e4"
  surface-white: "#ffffff"
  canvas-stone: "#f7f6f3"
  rail-stone: "#f0eee9"
  primary-teal: "#0f766e"
  primary-teal-soft: "#e1f5ee"
  source-ink: "#1f2927"
  warning-amber: "#a16207"
  danger-red: "#991b1b"
typography:
  display:
    fontFamily: '"IBM Plex Sans Thai", "IBM Plex Sans", -apple-system, sans-serif'
    fontSize: "clamp(21px, 2.3vw, 29px)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"IBM Plex Sans Thai", "IBM Plex Sans", -apple-system, sans-serif'
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  body:
    fontFamily: '"IBM Plex Sans Thai", "IBM Plex Sans", -apple-system, sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: '"IBM Plex Sans Thai", "IBM Plex Sans", -apple-system, sans-serif'
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.04em"
  data:
    fontFamily: '"IBM Plex Mono", ui-monospace, monospace'
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "28px"
components:
  button-secondary:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    padding: "7px 11px"
    height: "36px"
  navigation-active:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.primary-teal}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "9px 10px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "14px 16px"
  panel:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "20px"
  status-ready:
    backgroundColor: "{colors.primary-teal-soft}"
    textColor: "{colors.primary-teal}"
    rounded: "{rounded.pill}"
    padding: "4px 7px"
---

# Design System: Report Analysis

## Overview

**Creative North Star: "The Analyst's Field Desk"**

Report Analysis feels like a well-kept working desk for evidence: warm stone surrounds quiet white work surfaces, ink typography carries the analysis, and restrained teal identifies trusted state and direction. The system is compact and serious without becoming cold; hierarchy, rhythm, and source clarity do the expressive work.

The visual system extends the incumbent three-tier report rather than reframing it. Workspace chrome stays quiet, analytical content remains dominant, and supplemental-file workflows are visibly adjacent to—not blended with—API-backed evidence.

**Key Characteristics:**

- Warm, low-contrast workspace framing around crisp white analytical surfaces.
- Compact IBM Plex typography with monospaced treatment reserved for data and identifiers.
- Restrained teal for active, ready, positive, and directional states.
- Fine stone borders, selective elevation, and progressive disclosure instead of ornamental decoration.

## Colors

The palette combines warm mineral neutrals with a single trusted teal voice; semantic colors appear only when the data or system state requires them.

### Primary

- **Evidence Teal** (`#0f766e`): Marks active navigation, selected tier steps, successful values, upload affordances, and trusted readiness.
- **Washed Evidence Teal** (`#e1f5ee`): Supports teal text and icons in chips, selected files, and low-emphasis positive surfaces.

### Neutral

- **Working Ink** (`#1c1917`): Primary text, brand mark, and strongest interface contrast.
- **Source Ink** (`#1f2927`): The dark source-health band; reserved for provenance and system-level confidence.
- **Warm Stone Canvas** (`#f7f6f3`): Main workspace background.
- **Quiet Rail Stone** (`#f0eee9`): Sidebar and navigation frame.
- **Paper Surface** (`#ffffff`): Cards, panels, selected controls, and active navigation.
- **Measured Gray** (`#68625d`): Supporting descriptions and secondary copy.
- **Faint Annotation** (`#817a74`): Tertiary labels, inactive states, and metadata.
- **Hairline Stone** (`#e7e5e4`): Dividers and surface outlines.

### Tertiary

- **Caution Amber** (`#a16207`): Warnings and values that need attention, never general decoration.
- **Evidence Red** (`#991b1b`): Errors, failed source status, and materially poor performance.

### Named Rules

**The One Trusted Voice Rule.** Teal is the only global accent; reserve it for state, direction, and evidence that is ready to act on.

**The Provenance Contrast Rule.** Dark Source Ink belongs to source-health and provenance context, not ordinary content cards.

**The Semantic Color Rule.** Amber and red must encode an actual warning, failure, or negative analytical result.

## Typography

**Display Font:** IBM Plex Sans Thai (with IBM Plex Sans and system sans-serif fallback)

**Body Font:** IBM Plex Sans Thai (with IBM Plex Sans and system sans-serif fallback)
**Label/Mono Font:** IBM Plex Mono (with system monospace fallback)

**Character:** IBM Plex Sans Thai keeps mixed Thai and English copy calm, technical, and highly scannable. IBM Plex Mono gives measurements, grades, dates, and identifiers a precise evidence-led texture without turning the whole interface into a developer tool.

### Hierarchy

- **Display** (600, `clamp(21px, 2.3vw, 29px)`, 1.2): Page and report titles; use one dominant title per surface.
- **Title** (600, `15px`, 1.2): Panel headings and compact structural anchors.
- **Body** (400, `12px`, 1.6): Analytical copy, recommendations, row labels, and readable explanations.
- **Label** (500, `10px`, 0.04em): Navigation groups, metadata, status context, and uppercase micro-headings.
- **Data** (500, `11px`, 1.4): Numeric values, record counts, coverage ranges, grades, and identifiers.

### Named Rules

**The Data Has a Texture Rule.** Use IBM Plex Mono for values and identifiers, never as a blanket body face.

**The Compact, Not Cramped Rule.** Small labels rely on weight, spacing, and contrast; do not compensate with dense all-caps paragraphs.

## Layout

The desktop shell uses a fixed `236px` workspace rail and a fluid main column. Content is centered to a maximum of `1180px`, with `30px` horizontal working margins and a recurring compact rhythm of `8px`, `12px`, `16px`, `20px`, and `28px`. The report hierarchy stays linear: utility context, page title and mode, tier path, then evidence.

Cards use responsive grids rather than fixed canvases. At `1120px`, the rail becomes a horizontal navigation strip, source panels stack, and KPI grids reduce to two columns. At `700px`, outer padding tightens to `14px`, headings stack, navigation labels collapse, and dense analytical grids preserve two-column comparison where legibility allows. At `430px`, source health becomes a single column and the smallest report grids stay deliberately compact rather than turning into oversized mobile cards.

**The Report Leads Rule.** Workspace chrome frames the analysis but never competes with the title, mode control, tier path, or metrics.

**The Progressive Density Rule.** Preserve the Overview → Ads vs Organic → Post deep-dive path; reveal detail through navigation rather than placing every metric in one view.

## Elevation & Depth

The system is flat by default and uses tonal layering plus hairline borders for most separation. Shadows are selective: a soft structural shadow identifies active controls, while a stronger ambient shadow gives the dark source-health band appropriate system-level weight.

### Shadow Vocabulary

- **Selected Control** (`0 3px 10px rgba(41, 37, 36, 0.06–0.07)`): Active mode and tier controls.
- **Active Navigation** (`0 5px 14px rgba(41, 37, 36, 0.06)`): The selected workspace destination.
- **Source Authority** (`0 10px 24px rgba(28, 25, 23, 0.12)`): Source-health band only.

### Named Rules

**The Flat-by-Default Rule.** Cards and panels rest on borders and tonal contrast; elevation marks selection or source authority, not decoration.

## Shapes

Shapes are gently technical: compact controls use `8–10px` corners, working cards use `8–12px`, and larger source panels use `14px`. Pills (`999px`) are reserved for concise badges and statuses. Hairline dividers carry dense data; dashed borders identify drop zones; circular geometry is limited to health dots and small indicators.

**The Radius Follows Scale Rule.** Larger containing surfaces receive larger corners, while data cells and tier markers remain tighter and more precise.

## Components

### Buttons

- **Shape:** Gently rounded (`10px`) with a minimum height of `36px` for utility actions.
- **Secondary:** Paper Surface background, Hairline Stone border, Measured Gray text, and compact `7px 11px` padding.
- **Hover / Focus:** Hover darkens the border and text; keyboard focus uses a visible `3px` translucent teal outline with `2px` offset.
- **Icon Action:** A square `34px` transparent control with a `9px` radius; hover adds a faint teal wash.

### Chips

- **Style:** Fully rounded, compact, and semantic. Ready state pairs Washed Evidence Teal with teal text; neutral state uses warm gray; failure uses pale red with Evidence Red.
- **State:** Chips summarize classification or availability. They do not act as primary navigation or carry long copy.

### Cards / Containers

- **Corner Style:** Compact cards use `8px`; workspace panels use `14px`.
- **Background:** Paper Surface on Warm Stone Canvas.
- **Shadow Strategy:** Flat at rest; rely on Hairline Stone borders.
- **Border:** `1px` for workspace panels and `0.5px–1px` for dense report cards and dividers.
- **Internal Padding:** `14–16px` for report cards and `20px` for source panels.

### Inputs / Fields

- **Style:** File input is represented as a spacious dashed drop zone with a Warm Paper fill, `12px` corners, centered icon, and explicit supported formats.
- **Focus:** The label receives the global translucent teal focus outline when the hidden native file input is focused.
- **Selected / Disabled:** A selected file becomes a pale teal bordered status panel; loading actions reduce opacity and keep a wait cursor.

### Navigation

Workspace navigation is quiet and label-led. Default items are transparent; hover adds translucent white; the active item becomes a white raised surface with teal icon/text. At medium widths it becomes a horizontal strip, and below `700px` it keeps icons while hiding labels. Planned destinations remain visible only where space allows and are distinctly disabled.

### Mode Control

The Organic/Paid selector is a compact segmented control on a recessed stone track. Its selected option is a white, lightly raised segment; the control should never overpower the report title.

### Tier Path

The three analysis tiers live in a bordered, horizontally scrollable path. The active tier receives a white surface and teal numbered marker; unavailable deep-dive remains visible but disabled so the analytical sequence is legible.

### Source Health Band

The Source Ink band is the signature provenance component. It combines source identity, readiness, record count, and coverage in one compact status surface; teal communicates readiness and pale red communicates failure. Responsive reductions remove secondary statistics before removing source identity or health.

### Motion

Report content settles over `380ms` with a short upward translation and blur release using `cubic-bezier(.16, 1, .3, 1)`. Ordinary state changes use `160ms ease-out`; loading uses a `900ms` linear spinner. Reduced-motion preference disables both report settling and spinner animation.

## Do's and Don'ts

### Do:

- **Do** keep analytical evidence visually dominant over workspace chrome.
- **Do** use teal sparingly for selected, ready, positive, or directional state.
- **Do** preserve IBM Plex Mono for numbers, ranges, grades, and identifiers.
- **Do** identify whether a metric comes from an API, file, manual input, or calculation.
- **Do** reduce secondary metadata before removing source identity, state, or analytical sequence on smaller screens.

### Don't:

- **Don't** flatten the three-tier report into a single dense dashboard.
- **Don't** blend uploaded-file metrics into API data without explicit source and mapping state.
- **Don't** use dark Source Ink panels as ordinary decorative cards.
- **Don't** add accent colors unless they encode a distinct data category or semantic state.
- **Don't** replace fine borders and controlled whitespace with heavy shadows or oversized card spacing.
