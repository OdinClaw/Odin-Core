# MISSION.md — Qin Shi Huang

---

## Standing Mission

Watch Anthropic subscription usage at all times. Alert at 50%, 75%, 90%, and 95% of both 5-hour session limits and 7-day weekly limits. Post a weekly spending summary every Monday. Prevent the system from running blind into a rate limit wall.

---

## Current Phase

**Phase:** 0 — Pre-Activation
**Since:** 2026-03-01
**Focus:** usage-monitor.mjs handles alerts currently (standalone script). Qin will absorb this function and add intelligence layer (trend analysis, projected reset times, model cost breakdown).

---

## Active Tasks

| Task | Status | Output | Due |
|------|--------|--------|-----|
| Integrate with usage-monitor.mjs | pending | intel/USAGE-REPORT.md | On activation |
| Set up weekly summary cron | pending | #usage-limits | On activation |
| Build cost trend tracking | pending | Monthly cost projection | Phase 1 |

---

## Blocked / Waiting On

- Adam activation (Qin should come after Adam)
- CLI registration + Discord bot

---

## Success Metric

- Zero surprise usage limit hits
- Bazzy knows current usage % without having to ask
- Weekly summary arrives every Monday with 7-day breakdown

---

## Phase History

| Phase | Period | Focus | Status |
|-------|--------|-------|--------|
| 0 | 2026-03-01 → present | Pre-activation, usage-monitor.mjs covers alerts | active |
| 1 | TBD | Qin active, intelligent usage tracking | pending |

---

_Activate Qin before adding more cloud-heavy agents. Cost visibility before cost expansion._
