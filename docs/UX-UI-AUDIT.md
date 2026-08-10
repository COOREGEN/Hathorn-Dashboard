# UX / UI audit — Hathorn Dashboard

Release candidate visual and interaction audit. Screenshots under `/opt/cursor/artifacts/` from the QA run.

## Global findings

**What works:** Quiet financial aesthetic (Cormorant / EB Garamond / Libre Franklin), consistent paper/ink tokens, tabular figures, editorial commentary, clear empty states for unavailable modules.

**What we fixed:** Product naming (Dashboard not Ledger); login product mark; Firm vs Firm ops labels; Vendors honesty; favicon; formatter NaN guards.

**Remaining design work:** Staff masthead still carries many top-level modules (desktop-first). Consider progressive grouping in a later polish pass — not collapsed here to avoid hiding accounting workflows.

---

## Page results

### Login `/login`
- **Purpose:** Authenticate staff and clients  
- **Primary user:** All  
- **What works:** Clean dark entry; MFA step; forgot password link; disabled busy state  
- **Problems found:** Product mark said “Advisory Group”; no favicon  
- **Changes made:** Mark → Dashboard; footer → Hathorn Dashboard; favicon  
- **Desktop:** PASS  
- **Mobile:** PASS (centered card)  
- **Remaining:** None material  

### Today `/today` (staff home)
- **Purpose:** What needs attention today  
- **Primary user:** Advisor / admin  
- **What works:** Task-oriented list; practice footer  
- **Problems found:** Footer “Firm” → `/admin`  
- **Changes made:** Firm + Firm ops + Ask Hathorn links  
- **Desktop:** PASS  
- **Mobile:** PARTIAL (dense footer wraps — usable)  
- **Remaining:** Masthead density  

### Staff Dashboard `/dash` (+ financials, cash, etc.)
- **Purpose:** Client financial workspace  
- **Primary user:** Staff  
- **What works:** Rail, period/entity URL state, charts, KPIs  
- **Problems found:** Rail said “Ledger”; Firm → admin only  
- **Changes made:** Rail sub Dashboard; Firm + Firm ops  
- **Desktop:** PASS  
- **Mobile:** PARTIAL (rail drawer — desktop-first OK)  
- **Remaining:** Vendors intentionally empty (copy clarified)  

### Attention `/portfolio`
- **Purpose:** Which clients need the advisor  
- **Result:** PASS (branding subtitle fixed)  

### Clients / Planning / Documents / Tax / Guidance / Reconciliations / Integrations / Close / Exceptions / Upload / Engagement
- **Result:** PASS functionally (proof + prior suites). Branding subs fixed where they said Ledger.  
- **Mobile:** Desktop-first acceptable for staff  

### Ask Hathorn `/ask`
- **Purpose:** Grounded Copilot  
- **Result:** PASS (proof Copilot section)  

### Intelligence `/intelligence`
- **Purpose:** Trends/signals/profitability  
- **Result:** PASS; UNAVAILABLE customer dimensions labeled honestly  

### Client Experience `/client-experience`
- **Purpose:** Staff curation + preview  
- **Result:** PASS  

### Firm `/firm` · Firm ops `/admin` · Platform `/platform`
- **Result:** PASS; platform admin separated  

### Review `/review/[periodId]`
- **Purpose:** Gate + story + publish  
- **Result:** PASS (proof lifecycle)  

### Client portal `/portal*`
- **Purpose:** Published statement experience  
- **What works:** Overview metrics, insights, reports, documents; preview banner for staff  
- **Problems found:** None blocking  
- **Desktop:** PASS  
- **Mobile (~390px):** PASS — stacks cleanly, no horizontal chaos  
- **Remaining:** None material  

### Account security `/account/security`
- **Purpose:** MFA enrollment  
- **Result:** PASS (branding fixed)  

---

## Charts

Revenue trend / planning ECharts / dash SVG: labels and $K units consistent. Forecast vs actual differentiated in planning. CashOutlookChart is an honest non-chart stub (not fake data).

## Accessibility (spot)

- Keyboard: login fields and buttons operable  
- Labels present on login  
- Charts expose aria-labels on SVG paths  
- **Not** claiming full WCAG certification  

## Copy

Product vs tenant: login/product chrome = Hathorn Dashboard; seeded firm = Hathorn Advisory Group. “Ledger payroll” retained where it means GL/control side of reconciliations.
