# HIPAA scope statement

**DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED**  
**Owner:** MANAGEMENT MUST ASSIGN  

## Determination (product policy)

**Protected Health Information (PHI / ePHI) is not an approved data type** for Hathorn Dashboard.

The product is a financial statement / advisory platform for accounting firm clients. It is **not** designed, marketed, or configured as a healthcare records system, EHR, or medical billing clearinghouse.

This document does **not** claim “HIPAA compliant” or “HIPAA certified.” Those phrases must not appear in sales materials based on this file.

---

## What this means operationally

| Topic | Policy |
|---|---|
| Storing medical records, clinical notes, diagnoses, treatment data | **Prohibited** |
| Connecting to covered-entity clinical APIs for PHI | **Not supported** |
| BAA marketing | Do **not** offer BAAs for PHI processing unless counsel redesigns scope |
| Accidental upload of medical documents | Treat as incident / policy violation; restrict access; delete/quarantine per counsel; refresh training |

---

## Boundary cases (counsel)

Some home-care or healthcare **business** clients may still use the product for **financial** books (revenue, payroll, AR). Financial data alone is not automatically PHI, but documents can mix contents.

| Scenario | Guidance |
|---|---|
| P&L for a home-care agency | Generally financial CONFIDENTIAL — allowed |
| Upload of patient census with names + diagnoses | **PHI risk — prohibited**; LEGAL REVIEW if discovered |
| Payroll for caregivers | Financial — allowed; still CONFIDENTIAL |
| Insurance EOBs with patient identifiers | **Avoid** — treat as PHI risk |

When uncertain: **do not upload**; ask counsel.

---

## Technical posture (factual)

- No PHI-specific schema, workflows, or access models  
- Document pipeline accepts files that *could* contain anything — MIME/malware controls are not a HIPAA program  
- AI sanitize layer redacts some identity patterns but is **not** a HIPAA de-identification method  

Status of HIPAA program: **NOT IMPLEMENTED** (intentionally out of scope).

---

## If strategy ever changes

A deliberate HIPAA initiative would require: LEGAL REVIEW, BAAs, risk analysis, encryption/access upgrades, workforce training, contingency plans, and likely EXTERNAL AUDIT. Until then, refuse PHI.
