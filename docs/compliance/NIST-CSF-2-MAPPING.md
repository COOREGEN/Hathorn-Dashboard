# NIST Cybersecurity Framework 2.0 — lightweight mapping

**DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED**  
**Owner:** MANAGEMENT MUST ASSIGN  
**Purpose:** Orient Hathorn Dashboard controls to NIST CSF 2.0 functions. This is **not** a formal CSF profile assessment and **not** a certification.

Status vocabulary: IMPLEMENTED · VERIFIED · PARTIAL · NOT IMPLEMENTED · POLICY REQUIRED · LEGAL REVIEW REQUIRED · EXTERNAL AUDIT REQUIRED

---

## GOVERN (GV)

| Category | Mapping | Status |
|---|---|---|
| GV.OC Organizational context | Firm + platform tenancy model; product thesis docs | PARTIAL |
| GV.RM Risk management strategy | SECURITY-RISK-ASSESSMENT draft | POLICY REQUIRED |
| GV.RR Roles & responsibilities | WISP roles placeholders | POLICY REQUIRED |
| GV.PO Policy | WISP / employee / retention drafts | POLICY REQUIRED |
| GV.OV Oversight | MANAGEMENT-ACTION-REGISTER | POLICY REQUIRED |
| GV.SC Cybersecurity supply chain | SERVICE-PROVIDER-REGISTER + diligence checklist | PARTIAL |

## IDENTIFY (ID)

| Category | Mapping | Status |
|---|---|---|
| ID.AM Assets | DATA-INVENTORY, ARCHITECTURE, SENSITIVE-DATA-FLOWS | PARTIAL |
| ID.RA Risk assessment | SRA draft | PARTIAL |
| ID.IM Improvement | Technical/management registers | PARTIAL |

## PROTECT (PR)

| Category | Mapping | Status |
|---|---|---|
| PR.AA Identity & auth | bcrypt, JWT, staff MFA, roles, throttle | PARTIAL (client MFA absent; middleware token_version gap) |
| PR.AC Access | requireClientAccess, firm membership, RLS scripts | VERIFIED app-layer; RLS runtime PARTIAL |
| PR.DS Data security | AES-GCM secrets; TLS/HSTS; sanitize AI; quarantine | PARTIAL |
| PR.PS Platform security | Headers CSP/HSTS; secure SDLC draft | PARTIAL |
| PR.AT Awareness | Employee policy draft | POLICY REQUIRED |

## DETECT (DE)

| Category | Mapping | Status |
|---|---|---|
| DE.CM Continuous monitoring | audit_logs, health, structured logs | PARTIAL |
| DE.AE Adverse event analysis | IR runbooks | PARTIAL |

## RESPOND (RS)

| Category | Mapping | Status |
|---|---|---|
| RS.MA Incident management | INCIDENT-RESPONSE, BREACH decision tree | PARTIAL / LEGAL REVIEW REQUIRED |
| RS.AN Analysis | Ops correlation ids | PARTIAL |
| RS.MI Mitigation | Kill switches, secret rotation, quarantine | IMPLEMENTED (tech) |
| RS.CO Communications | Notification forks | LEGAL REVIEW REQUIRED |

## RECOVER (RC)

| Category | Mapping | Status |
|---|---|---|
| RC.RP Recovery plan | DISASTER-RECOVERY | IMPLEMENTED (documented) |
| RC.IM Improvements | Post-incident register updates | POLICY REQUIRED |
| RC.CO Communications | Client notice | LEGAL REVIEW REQUIRED |

---

## Using this mapping

1. Prefer the FINANCIAL-DATA-COMPLIANCE-MATRIX for FTC/IRS work.  
2. Use this CSF map for board-level storytelling without claiming “NIST compliant.”  
3. Revisit after Postgres cutover, malware-on-by-default, and external pentest.
