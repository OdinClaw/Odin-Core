# SKILLS.md — Qin Shi Huang

---

## Active Skills (available when live)

| Skill | Category | Status | Notes |
|-------|----------|--------|-------|
| Usage data fetching | Monitoring | active | Fetches 5-hour + 7-day windows from claude.ai (usage-monitor.mjs pattern) |
| Threshold alerting | Monitoring | active | Fires at 50/75/90/95% — Discord + Telegram |
| Weekly summary generation | Reporting | planned | Monday report: 7-day breakdown by model tier |
| Session reset time calculation | Analytics | active | At 95% session: includes time until reset |
| Weekly reset projection | Analytics | active | At 95% weekly: includes reset datetime |

---

## Skills Needed

| Skill | Why | Priority | Blocker |
|-------|-----|---------|---------|
| Per-model cost breakdown | Which models are burning most budget? | medium | API data format TBD |
| Cost trend analysis | 4-week rolling average, projected monthly spend | medium | Need 4 weeks of data first |

---

## Known Limitations

- Relies on claude.ai session data — format could change without notice
- Alert state is stored in usage-monitor-state.json — must preserve this file
- Cannot reduce usage — only reports it. Reduction requires Odin action.

---

## Tools & Integrations

```bash
# Run usage monitor manually
node ~/.openclaw-odin/scripts/usage-monitor.mjs

# Check usage monitor state
cat ~/.openclaw-odin/scripts/usage-monitor-state.json

# Check usage monitor log
tail -20 ~/.openclaw-odin/scripts/usage-monitor.log
```

**External integrations:**
- Discord: pending (@Qin bot)
- Telegram: connected (via usage-monitor.mjs, chat ID 1153171309)
- claude.ai usage endpoint: connected (via usage-monitor.mjs)

---

_Qin's job is empire-level efficiency. No budget surprises._
