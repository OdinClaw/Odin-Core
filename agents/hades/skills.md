# SKILLS.md — Hades

---

## Active Skills (available when live)

| Skill | Category | Status | Notes |
|-------|----------|--------|-------|
| Config security audit | Security | ready | Reviews openclaw.json for exposed credentials, overly broad permissions |
| Credential exposure detection | Security | ready | Scans workspace files for plaintext secrets |
| Permission scope analysis | Security | ready | Reviews Discord bot scopes, API key permissions |
| Access pattern review | Security | ready | Maps which agents access which files/APIs |
| Risk report generation | Documentation | ready | Prioritized findings with severity and remediation |

---

## Known Limitations

- Hades audits, not patches — implementation is Odin/Bazzy's job
- Cannot access external systems to verify API key validity
- Audit is point-in-time — system changes after audit require re-audit
- Paused until Phase 4 complete — do not activate prematurely
