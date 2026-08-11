# SOC 2 readiness (self-assessment)

**NOT SOC 2 CERTIFIED**  
**DRAFT — MANAGEMENT / LEGAL REVIEW REQUIRED**  
**Owner:** MANAGEMENT MUST ASSIGN  
**Purpose:** Early readiness signal for a future Type I/II examination — **not** an audit report and **not** a claim of compliance.

Readiness bands used below:

| Band | Meaning |
|---|---|
| **early** | Policy/control missing or only aspirational |
| **partial** | Technical or draft controls exist; evidence/ops incomplete |
| **strong** | Control implemented with repeatable tests/evidence path (still not certified) |

---

## Trust Services Criteria families (lightweight)

### Security (CC)

| Topic | Band | Notes |
|---|---|---|
| Control environment / governance | **early** | WISP draft; QI not named |
| Communication & information | **partial** | Internal docs; no client-facing security whitepaper approved |
| Risk assessment | **partial** | Draft SRA exists; not management-approved |
| Monitoring | **partial** | Audit logs + health; no SOC monitoring program |
| Logical access | **strong** (tech) / **partial** (ops) | AuthZ, MFA staff, tenancy tests; joiner/leaver POLICY |
| System operations | **partial** | Backup/restore coded; production drill evidence may be missing |
| Change management | **partial** | CI + suites; formal CAB early |
| Risk mitigation / vendors | **early–partial** | Register drafted; contracts not in repo |

### Availability

| Topic | Band | Notes |
|---|---|---|
| Availability commitments | **early** | No customer SLA in product docs |
| Backup & recovery | **partial→strong** tech | Online backup verified in code/tests; offsite/ransomware posture partial |
| HA / multi-region | **early** | NOT IMPLEMENTED |

### Confidentiality

| Topic | Band | Notes |
|---|---|---|
| Classification | **partial** | Data inventory draft |
| Encryption | **partial** | Secrets AES-GCM; docs/backups volume-dependent |
| NDAs / workforce | **early** | Employee policy draft only |

### Processing integrity

| Topic | Band | Notes |
|---|---|---|
| Input validation | **strong** (tech) | Gate, validate-on-write, upload checks |
| Publish integrity | **strong** (tech) | Immutable releases |
| AI integrity | **partial** | Grounding + sanitize; model nondeterminism residual |

### Privacy

| Topic | Band | Notes |
|---|---|---|
| Privacy notice / choices | **early** | LEGAL REVIEW REQUIRED |
| PHI | **n/a / prohibited** | See HIPAA-SCOPE — not seeking HIPAA |

---

## Evidence readiness

| Evidence type | Ready? |
|---|---|
| System description | PARTIAL (`ARCHITECTURE.md`, this package) |
| Control matrix mapped to TSC | early (use FINANCIAL-DATA-COMPLIANCE-MATRIX as seed) |
| Population of access reviews | NOT IMPLEMENTED / POLICY |
| Pentest report | NOT IMPLEMENTED — EXTERNAL AUDIT REQUIRED |
| Vendor SOC reports collected | VENDOR ACTION REQUIRED |
| Training records | POLICY REQUIRED — none invented |

---

## Recommended path (non-binding)

1. Adopt WISP + retention + employee policy  
2. Complete vendor diligence + §7216 review  
3. Enable malware scanning in prod; Postgres RLS if multi-firm SaaS  
4. External pentest against `PENTEST-SCOPE.md`  
5. Engage auditor only when evidence folder contains **real** artifacts  

**Reminder:** Passing internal tests ≠ SOC 2 certification.
