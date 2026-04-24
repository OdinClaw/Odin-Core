---
version: 1
name: Odin Design System
scope:
  - Discord and chat responses
  - operational dashboards
  - generated reports
  - client deployment templates
  - internal agent status pages
owner: Odin
paired_with: AGENTS.md
design_tokens:
  color:
    background: "#0E1117"
    surface: "#151A22"
    surface_elevated: "#1C2330"
    border: "#2B3442"
    text: "#E7ECF3"
    text_muted: "#A8B3C2"
    accent: "#E0B15A"
    info: "#5AA9E6"
    success: "#51B37A"
    warning: "#E6A23C"
    danger: "#D76262"
  typography:
    interface: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    monospace: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    scale:
      xs: "12px"
      sm: "14px"
      md: "16px"
      lg: "20px"
      xl: "28px"
  radius:
    small: "4px"
    medium: "8px"
  spacing:
    xs: "4px"
    sm: "8px"
    md: "12px"
    lg: "16px"
    xl: "24px"
  motion:
    duration_fast: "120ms"
    duration_standard: "180ms"
    easing: "ease-out"
accessibility:
  minimum_text_contrast: "4.5:1"
  minimum_touch_target: "40px"
  never_color_only: true
---

# DESIGN.md - Odin Visual and Output Language

This file defines how Odin-facing interfaces, reports, and generated artifacts should look and feel.

`AGENTS.md` governs how agents behave. `DESIGN.md` governs how their output is presented.

## Design Position

Odin is an operating layer, not a mascot. The interface should feel like command infrastructure: calm, legible, precise, and alive enough that it does not feel sterile.

The default design language is:

- dark operational base
- warm gold accent for Odin-level authority
- blue for neutral information
- green, amber, and red for health states
- compact layouts built for scanning
- clear hierarchy over decorative flourish

Client deployments may override colors, logo, and typography, but should preserve the structure: status first, decision second, evidence third.

## Core Principles

### 1. Status first

A user should understand the state of the system before reading the details.

Start dashboards, reports, and status cards with:

- current state
- what changed
- what needs attention
- next action

Avoid burying health, failures, or blockers under narrative.

### 2. Quiet authority

Odin should feel decisive without being loud.

Use restrained contrast, tight spacing, and clear labels. Do not overuse giant type, gradients, oversized cards, or decorative backgrounds for operational views.

### 3. Human-readable, machine-usable

Generated output should be easy for Bazzy to read and easy for another agent to parse.

Prefer predictable headings, stable labels, and short sections. Do not invent a new layout for every run.

### 4. File-system native

The pantheon uses files as the integration layer. Reports and pages should make paths, owners, timestamps, and source files visible when they matter.

## Voice and Tone

Odin's output should sound like an operator who checked the system and made the call.

Use:

- direct first sentence
- short paragraphs
- specific findings
- concrete paths, commands, run IDs, and timestamps when relevant
- calm language during failures

Avoid:

- filler praise
- vague reassurance
- corporate language
- motivational framing
- unexplained acronyms
- long dramatic intros

## Discord and Chat Formatting

Discord is the primary surface. Messages should be compact and useful on first read.

### Standard response shape

Use this order when reporting work:

1. Result
2. What changed
3. Verification
4. Remaining risk or next step

### Status labels

Use stable labels when helpful:

- `OK`
- `FIXED`
- `WATCH`
- `BLOCKED`
- `FAILED`
- `NEEDS_INPUT`

Do not use labels as decoration. Use them only when they clarify state.

### Error reports

When something fails, include:

- exact error string
- affected agent or service
- timestamp with timezone when available
- whether it is still happening
- action taken

Bad:

> It broke but should be fine now.

Good:

> `FIXED`: Odin hit `terminated` from `minimax/MiniMax-M2.7` at 2026-04-23 23:51 ET. Gateway and Discord stayed healthy. I added the missing file and kept MiniMax as primary.

## Dashboards

Operational dashboards should be dense, calm, and scan-friendly.

### Layout

- Left or top navigation for major systems.
- Main panel starts with overall health.
- Use tables for repeated system state.
- Use cards only for individual repeated items or summary metrics.
- Keep card radius at `8px` or less.
- Do not nest cards inside cards.

### Priority order

1. Health summary
2. Active incidents
3. Agent status
4. Model routing
5. Recent runs
6. Logs and evidence
7. Configuration links

### Health colors

- Success: healthy, complete, reachable
- Warning: degraded, retrying, stale, needs watch
- Danger: broken, unreachable, permission failure, data loss risk
- Info: neutral progress, background work, queued jobs

Every color-coded state also needs a text label.

## Reports

Reports should read like operational briefs, not blog posts.

Use this structure:

1. `Summary`
2. `Findings`
3. `Actions Taken`
4. `Verification`
5. `Open Risks`
6. `Sources`

For client-facing reports, replace internal paths and private operational details with safe summaries unless Bazzy explicitly asks for raw system detail.

## Generated Pages and Client Templates

Client deployments may define their own `DESIGN.md` values. Preserve this hierarchy:

- client brand colors override Odin colors
- client typography overrides Odin typography
- Odin status semantics stay stable
- accessibility requirements stay mandatory
- report structure stays predictable

When generating a page for a client, make the client's brand or object visible in the first viewport. Do not hide identity in tiny navigation text.

## Icons and Controls

Use familiar icons for tool actions when a UI framework supports them:

- save
- refresh
- search
- settings
- filter
- alert
- check
- external link

Use text buttons for commands that need clarity. Add tooltips for icon-only controls.

Use:

- toggles for binary settings
- segmented controls for modes
- sliders or numeric inputs for values
- tabs for major views
- menus for option sets
- swatches for color choices

## Typography

Use system fonts by default. They are fast, legible, and platform-native.

Reserve large type for page-level identity or major state. Use compact headings inside dashboards, sidebars, and cards.

Do not scale font sizes with viewport width. Use responsive layout, not fluid type, to solve small screens.

## Spacing and Density

Odin interfaces should feel organized, not sparse.

- Use `8px` and `12px` spacing for dense controls.
- Use `16px` and `24px` spacing for section separation.
- Keep related labels, values, and actions visually close.
- Avoid ornamental whitespace that makes operational data harder to compare.

## Accessibility

Every generated interface must:

- meet contrast requirements for body text
- keep focus states visible
- support keyboard navigation
- avoid color-only status
- keep text inside its container on mobile and desktop
- avoid overlapping text and controls

If a design choice conflicts with readability, readability wins.

## Anti-Patterns

Do not use:

- decorative gradient blobs or abstract background shapes
- nested UI cards
- hero sections for operational tools
- one-note palettes where every element is the same hue
- tiny status text with no summary
- vague "everything looks good" reports
- invented brand language that does not match the actual client
- visual polish that hides broken state

## Implementation Notes for Agents

Before creating or editing a UI, report, or generated page:

1. Read `AGENTS.md` for behavior.
2. Read this file for presentation.
3. Check for a local or client-specific `DESIGN.md`.
4. Use the most specific design file available.
5. Preserve Odin's status semantics unless Bazzy requests a different operating model.

When this file conflicts with a client `DESIGN.md`, prefer the client file for visual branding and this file for operational clarity, accessibility, and status semantics.
