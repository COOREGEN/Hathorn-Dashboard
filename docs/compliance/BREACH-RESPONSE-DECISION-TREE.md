# Breach response decision tree

**DRAFT — LEGAL REVIEW REQUIRED**  
**Owner:** MANAGEMENT MUST ASSIGN  
**Related:** `docs/INCIDENT-RESPONSE.md`, FTC Safeguards Rule breach notification guidance (FTC customer information notification event — **500+ consumers**, requirements effective May 2024), state breach laws, IRS Pub 5708 themes

This tree helps responders **classify and escalate**. It is **not** legal advice and does **not** authorize public statements. Notification content, timelines, and whether the FTC Rule applies require counsel.

---

## Step 0 — Safety & preserve evidence

```
Suspected security event
        |
        v
[Contain without destroying logs]
  - Kill switches (AI_PROVIDER_ENABLED=0, etc.) as needed
  - Disable compromised users / rotate secrets
  - Take verified DB backup before risky remediation
  - Capture correlationIds, audit_logs metadata, deploy version
        |
        v
Continue to Step 1
```

---

## Step 1 — Is customer information involved?

```
Was there unauthorized acquisition, access, use, or disclosure
of CONFIDENTIAL / RESTRICTED data?
        |
   +----+----+
   |         |
  NO        YES
   |         |
   v         v
Ops IR     Treat as potential
only       "security event"
(SEV2/3)   involving customer info
           (LEGAL REVIEW)
```

Examples that usually **yes**: cross-tenant exposure, DB dump, stolen `ENCRYPTION_KEY`/`AUTH_SECRET` with evidence of use, ransomware encrypting client DB/documents, public bucket of client files (if ever introduced).

Examples that may be **no**: single-tenant AI outage, Docling worker down, failed deploy with no data access.

---

## Step 2 — What was exposed? (classification)

| Class | Examples | Escalation |
|---|---|---|
| Credentials | Password hashes, JWT secret, QBO tokens, MFA secrets | CRITICAL — rotate immediately |
| Financial CONFIDENTIAL | P&L, payroll, AR, cash, releases | HIGH |
| Tax RESTRICTED | Returns, organizers, SSNs in document bytes, tax AI context | CRITICAL + §7216 counsel |
| Identity | Emails, names at scale | HIGH |
| Metadata only | Counts, health flags | MEDIUM |

---

## Step 3 — FTC Safeguards notification fork

**LEGAL REVIEW REQUIRED before sending any regulator notice.**

```
If counsel determines FTC Safeguards Rule applies
AND the event is a notifiable breach of customer information
AND the number of consumers whose information was involved is 500 or more
        |
        v
FTC notification event path
  - Use FTC-prescribed process/content current at the time
  - Do NOT rely on this markdown for deadlines or form fields
  - Document decision in ops_incidents / legal file (not invented here)
        |
        v
Also evaluate state AG / individual notice laws (varies)
```

If fewer than 500, or Rule applicability unclear: **still escalate to counsel** — other laws may apply; do not assume “no notice.”

---

## Step 4 — Tax / IRS considerations

```
Did the event involve tax return information?
        |
       YES → Counsel: §7216, Pub 5708 incident themes,
             professional obligations, client notice language
        |
       NO  → Continue general privacy/security counsel path
```

---

## Step 5 — Who must be informed (checklist — counsel confirms)

| Audience | When | Owner |
|---|---|---|
| Internal QI / management | Immediately for HIGH/CRITICAL | MANAGEMENT MUST ASSIGN |
| Counsel | Immediately if customer info / tax / 500+ possible | MANAGEMENT MUST ASSIGN |
| Affected clients | Per counsel | MANAGEMENT MUST ASSIGN |
| FTC | If 500+ Safeguards notification event applies | LEGAL REVIEW REQUIRED |
| State regulators / AG | Per counsel | LEGAL REVIEW REQUIRED |
| Insurer (cyber policy) | Per policy terms | MANAGEMENT MUST ASSIGN |
| Vendors (Anthropic, Intuit, host) | If their systems involved or keys leaked | MANAGEMENT MUST ASSIGN |
| Law enforcement | If criminal activity / extortion | LEGAL REVIEW REQUIRED |

---

## Step 6 — Technical eradication & recovery

Follow `docs/DISASTER-RECOVERY.md` and `docs/INCIDENT-RESPONSE.md`:

1. Rotate `AUTH_SECRET`, `ENCRYPTION_KEY`, provider API keys  
2. Invalidate sessions (`token_version` / secret rotation)  
3. Disconnect compromised QBO connections  
4. Re-scan documents; keep quarantine blocks  
5. Restore from verified backup if integrity lost  
6. Re-enable features only after verification  

---

## Step 7 — Post-incident

| Activity | Status expectation |
|---|---|
| Timeline & root cause | Required |
| Update risk assessment | Required |
| Update TECHNICAL / MANAGEMENT action registers | Required |
| Tabletop lessons learned | POLICY REQUIRED if never run |
| Public blog / marketing claims of “compliance” | **Forbidden** without counsel |

---

## Severity quick map

| Sev | Use when |
|---|---|
| SEV1 | Cross-tenant exposure; auth bypass; ransomware; confirmed credential forgery |
| SEV2 | Major outage; suspected but unconfirmed breach |
| SEV3 | Single optional integration degraded without data loss |

---

**Document control:** v0.1-DRAFT 2026-08-11 — not counsel-approved.
