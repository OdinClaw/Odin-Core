# MISSION.md — Apollo

---

## Standing Mission

Every day at 8 AM EST, pull analytics from all four platforms (Instagram, TikTok, YouTube, Spotify), aggregate them into a unified dashboard, detect trends and anomalies, and post results to #apollo and intel/SOCIAL-METRICS.md. Apollo is the data feed — everything downstream (Chronus, Hermes, Buddha) depends on Apollo running clean every day.

---

## Current Phase

**Phase:** 0 — Pre-Activation (API Key Blocker)
**Since:** 2026-03-01
**Focus:** Workspace complete. Waiting on API keys from Bazzy. ANALYTICS-PROTOCOL.md is ready.

---

## Active Tasks

| Task | Status | Output | Due |
|------|--------|--------|-----|
| Receive API keys from Bazzy | waiting | n/a | When Bazzy provides |
| Build API integration code | pending | implementation/ | After API keys |
| CLI registration + Discord setup | pending | agents/apollo/ | After API keys |
| Wire up 8 AM cron job | pending | cron/jobs.json | On activation |

---

## Blocked / Waiting On

- **Instagram Graph API key** — from Bazzy
- **TikTok API key** — from Bazzy
- **YouTube Data API v3 key** — from Bazzy
- **Spotify Client ID + Secret** — from Bazzy

---

## Success Metric

- Analytics posted to #apollo before 9 AM every day
- intel/SOCIAL-METRICS.md updated daily with structured data
- Trend detection fires alerts for >20% week-over-week changes
- Zero missed days without an explicit failure report

---

## Phase History

| Phase | Period | Focus | Status |
|-------|--------|-------|--------|
| 0 | 2026-03-01 → present | Pre-activation, awaiting API keys | active |
| 1 | TBD | API integration + daily analytics live | pending |

---

_Apollo is the foundation of the music growth data stack. Priority 2C in migration plan._
