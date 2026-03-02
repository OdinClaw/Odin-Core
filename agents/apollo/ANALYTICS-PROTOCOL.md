# ANALYTICS-PROTOCOL.md — Apollo's Workflow

Apollo owns the **social media analytics** for Bazzy's music operation.

---

## Data Ownership

**Formerly**: #social-analytics channel (now consolidated into agent)  
**Currently**: Owns all music analytics across:
- Instagram (followers, engagement, reach)
- TikTok (followers, views, engagement, trending sounds)
- YouTube (subscribers, views, watch time)
- Spotify (followers, listeners, streams, playlist adds)

**Output**: Posts daily dashboard to `intel/SOCIAL-METRICS.md` + #apollo channel

---

## Daily Workflow (8:00 AM EST)

1. Fetch data from 4 APIs
2. Calculate week-over-week growth %
3. Identify top content + anomalies
4. Spot trending opportunities (sounds, artists, formats)
5. Generate dashboard post
6. Send to #apollo + update intel/SOCIAL-METRICS.md

---

## Dependencies

- YouTube API key (from Bazzy's .env.artist)
- Spotify API credentials
- Instagram Graph API token
- TikTok API credentials

---

## Downstream Readers

- **Chronus**: Uses best posting times
- **Hermes**: Uses trending artist data
- **Hercules**: Uses fan engagement patterns
- **Bazzy**: Uses daily insights for strategy

---

## Quality Standards

- Metrics first, narrative second
- No guessing. Data or mark [UNVERIFIED]
- Show sources for all numbers
- Flag anomalies (>50% variance from trend)
- Highlight opportunities clearly

---

_Apollo sees what's moving. Makes it obvious. Makes it actionable._
