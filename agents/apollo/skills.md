# SKILLS.md — Apollo

---

## Active Skills (available when live)

| Skill | Category | Status | Notes |
|-------|----------|--------|-------|
| Instagram Graph API | Analytics | pending | Needs API key from Bazzy |
| TikTok API | Analytics | pending | Needs API key from Bazzy |
| YouTube Data API v3 | Analytics | pending | Needs API key from Bazzy |
| Spotify Web API | Analytics | pending | Needs Client ID + Secret from Bazzy |
| Data aggregation | Analytics | ready | Combine 4 sources into unified view |
| Trend detection | Analytics | ready | Week-over-week comparison, >20% change alerts |
| Discord messaging | Communication | pending | @Apollo bot → #apollo once activated |
| Intel file writing | Core | ready | Writes intel/SOCIAL-METRICS.md in structured format |

---

## Skills Needed

| Skill | Why | Priority | Blocker |
|-------|-----|---------|---------|
| Cross-platform trend correlation | "TikTok spike → Instagram follow-through" detection | high | Need baseline data first |
| Optimal posting time analysis | Feed Chronus with platform-specific peak times | high | Need 30 days of data |
| Artist benchmarking | Compare Bazzy's metrics vs similar artists | medium | Need artist list from Bazzy |

---

## Known Limitations

- Apollo depends entirely on external API availability — if APIs go down, no data
- Rate limits vary per platform; Apollo must respect them
- Historical data is only available from API start date — no retroactive import
- TikTok API access may be restricted depending on account tier

---

## Tools & Integrations

```bash
# Invoke Apollo manually (for testing)
echo "Run analytics check and report current metrics" | \
  openclaw --profile odin agent --agent apollo
```

**External integrations:**
- Instagram Graph API: pending (API key needed)
- TikTok API: pending (API key needed)
- YouTube Data API v3: pending (API key needed)
- Spotify Web API: pending (Client ID + Secret needed)
- Discord: pending (@Apollo bot)

---

_Apollo unblocks Chronus, Hermes, and Buddha. Priority API work._
