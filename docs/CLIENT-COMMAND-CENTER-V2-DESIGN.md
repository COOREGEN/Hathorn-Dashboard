# Client Financial Command Center V2 — Design

**Route:** `/dash/overview-v2`  
**Status:** Visual constitution prototype — stop here for approval  
**Data:** `hathorn_test` Northbridge fixtures only (no staging seed)

## Layout hierarchy

```
FIRM RAIL (quiet)          WORKSPACE
Today · Clients · Work     Client · Period · Status
Reports · Ask              ↓
Firm (lower)               HERO STORY (number dominates)
                           ↓
                           FINANCIAL CANVAS (one chart)
                           ↓
                           SUPPORTING METRICS (3–5, not cards)
                           ↓
                           WHY IT CHANGED | EXPENSE MIX
                           ↓
                           WHAT HATHORN SEES (right rail)
                           ↓
                           CLOSE STATUS STRIP
```

## Interaction map

| Control | Updates |
|---|---|
| Metric lens / tile | Chart · hero · delta · Ask suggestions · insight emphasis |
| Period scrubber / arrows | Full model via URL `month=` (server truth) |
| Compare mode | Prior-year / prior-month series + deltas |
| Driver row | Detail drawer (amount, Δ, Ask) |
| ⌘K / Ask | Contextual ask overlay → `/ask` with client/period |

## Chart states

- Actual (solid mint, minimal glow)
- Prior year (dashed neutral) when compare on
- Budget (dotted) for revenue when budget lines exist
- Hover = inspection panel tooltip (not browser default)
- Range: 6M / 12M / 24M / YTD / ALL

## Metric semantics

Color follows financial meaning via comparison context:
- Revenue / NI / Cash / AR up = favorable (mint)
- Gross margin down = unfavorable (warm red)
- Never green solely because arithmetic is positive

## Ask Hathorn

Integrated panel + ⌘K command. Suggestions follow client/period/lens.  
Does not invent drivers — bridges come from `pl_lines` / entity math.

## Responsive

- 1440: three-panel command center
- 1024: intel stacks under canvas
- 768: rail collapses horizontal; tiles 2-col
- 390: single column; chart height reduced; status wraps

## Accessibility

Keyboard period step, focus rings, tooltip text also in chart aria-label, reduced-motion disables chart animation duration, status not color-only (text labels).

## Explicit non-goals (this pass)

App-wide shell rewrite · portal redesign · photo backgrounds behind charts · inventing demo dollars.
