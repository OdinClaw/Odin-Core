# SKILL IDENTIFICATION PROCESS — How We Build Agents Together

This document defines the process for identifying, documenting, and implementing skills required for each agent.

---

## The 5-Step Process

### Step 1: Agent Request
**Bazzy identifies a need:**
> "I need to find collaborators in my niche"

**I respond with:**
- What the agent does
- What it needs (inputs)
- What it produces (outputs)
- Why it's valuable

---

### Step 2: Skills Audit
**I analyze the agent and identify required skills:**

For "Collab Leads Agent":
- ✅ TikTok API (fetch trending artists)
- ✅ Spotify API (artist data + scoring)
- ✅ SoundCloud API (emerging artists)
- ✅ Web scraping (find contact info)
- ✅ Scoring algorithm (compatibility matching)
- ✅ Email templates (outreach)
- ✅ Discord integration (post results)

---

### Step 3: Present Skill List to Bazzy
**I show you what we need to build this agent:**

```
To build the Collab Leads Agent, we need these skills:

TIER 1 (Required for MVP):
✅ TikTok API integration (30 min to learn)
✅ Spotify API advanced queries (15 min to learn)
✅ Compatibility scoring algorithm (1 hour to build)

TIER 2 (Nice to have):
✅ SoundCloud API (20 min to learn)
✅ Web scraping for contact discovery (45 min to learn)

TIER 3 (Future enhancement):
✅ Email outreach templates (30 min)

TOTAL: ~2 hours for MVP, 3.5 hours for full feature set

Recommendation: Build Tier 1 first, then add Tier 2 if needed.
```

---

### Step 4: Bazzy's Decision
**You decide:**

Option A: "Yes, build all of it" → We allocate time + build everything
Option B: "MVP only" → We focus on Tier 1, add others later
Option C: "Not ready yet" → We defer and work on something else
Option D: "Different approach" → We rethink the strategy together

---

### Step 5: Skill Documentation + Implementation

Once approved, I:

1. **Create SKILL.md file** (in project folder)
   - What the skill does
   - API docs + links
   - Code examples
   - Gotchas/warnings
   - Integration points

2. **Implement the skill** (actual code)
   - Test against real API
   - Handle errors gracefully
   - Document results

3. **Update MEMORY.md**
   - What we learned
   - Gotchas discovered
   - Integration notes

4. **Integrate into agent**
   - Wire up skill to agent
   - Test end-to-end
   - Deploy to Discord/cron

5. **Document learnings**
   - Lessons learned
   - Best practices discovered
   - Performance notes

---

## Skill Categories

### API Integrations
Skills for connecting to external platforms:
- YouTube Data API
- Spotify Web API
- Instagram Graph API
- TikTok API
- SoundCloud API
- LinkedIn API
- Discord API (already have)

### Data Processing
Skills for analyzing + transforming data:
- Trend detection (time-series analysis)
- Scoring algorithms (matching, ranking)
- Aggregation (combining multiple sources)
- Filtering (finding relevant data)

### Content Generation
Skills for creating content:
- Email templates
- LinkedIn post generation
- Caption writing (with hashtags)
- Social media recommendations

### Automation
Skills for scheduling + triggering:
- Post scheduling (Instagram, TikTok, YouTube)
- Cron job orchestration (already have)
- Discord bot commands
- Event-based triggers

### Analysis
Skills for understanding patterns:
- Sentiment analysis (reading comments)
- Trending detection (what's hot)
- Performance analysis (what works)
- Competitor analysis (how you compare)

---

## Skill Maturity Levels

Each skill gets a maturity rating:

**Level 1 - Prototype**: Basic functionality works, not production-ready
**Level 2 - MVP**: Works reliably, handles common cases, documented
**Level 3 - Production**: Handles edge cases, error recovery, fully tested
**Level 4 - Optimized**: Fast, efficient, monitored, continuously improving

When we build a skill, we'll target **Level 2 (MVP)** first. Then improve incrementally based on real usage.

---

## Real Example: Social Media Analytics Agent

### Step 1: Agent Request
"I need daily analytics from Instagram, TikTok, YouTube, Spotify"

### Step 2: Skills Audit
- TikTok API integration
- Instagram Graph API integration
- YouTube Data API v3 integration
- Spotify Web API integration
- Data aggregation (combine 4 sources)
- Trend detection (compare week-over-week)
- Discord messaging

### Step 3: Present to Bazzy
```
To build Social Media Analytics Agent, we need:

TIER 1 (MVP):
- TikTok API (30 min)
- Instagram Graph API (30 min)
- Spotify API (15 min)
- YouTube API (10 min)
- Data aggregator (20 min)
- Discord integration (10 min)

TIER 2 (Enhancement):
- Trend detection algorithm (30 min)
- Viral alerts (15 min)
- Best posting time analysis (20 min)

TOTAL: 2.5 hours for MVP

Timeline: Week 1-2 to build MVP, Week 3 for Tier 2 enhancements
```

### Step 4: Bazzy Approves
"Yes, build all. Get API keys from me this week."

### Step 5: Build Process
Week 1:
- I learn Instagram Graph API (read docs, build test code)
- I learn TikTok API (read docs, build test code)
- Document learnings in SKILL.md files
- Build data aggregator

Week 2:
- Test with real data (using Bazzy's channels)
- Refine dashboard formatter
- Add error handling

Week 3:
- Deploy cron job
- Start posting daily
- Gather feedback
- Add Tier 2 features based on what's most useful

---

## How to Know We're Ready to Build

✅ Bazzy has approved the agent + skills
✅ All required APIs are accessible (keys obtained)
✅ No blocker skills (everything is learnable in <2 hours)
✅ Clear success metric (how do we know it works?)
✅ Discord channel created (for output)

When all 5 are true: **We build.**

---

## Transparency Rules

At every step, I communicate:
- What skills we need (no surprises)
- How long each will take (realistic estimates)
- What Bazzy's approval is needed for
- What learnings emerge during implementation
- What edge cases we discover

**You're never left guessing.** You know exactly what's being built and why.

---

## Skill Reuse

Skills built for one agent can be used by others:

Example:
- Social Media Analytics Agent uses: TikTok API, Spotify API, data aggregation
- Collab Leads Agent reuses: TikTok API, Spotify API (we don't rebuild)
- Thought Leadership Agent uses: Same aggregation pattern (learned from first agent)

Over time, we build a **library of reusable skills** that make building new agents faster.

---

## Documentation Template

Every skill gets documented like this:

```
# [SKILL NAME] — SKILL.md

## What It Does
One-sentence description + use case

## API Reference
- Official docs link
- Authentication requirements
- Rate limits
- Sandbox/test environment

## Code Example
```python
# Real working example
```

## Integration Points
- Where it's used (which agents)
- How to call it
- Expected output

## Gotchas
- Common mistakes
- Edge cases
- Error handling

## Performance
- Speed benchmarks
- Cost implications (if API charges)
- Optimization opportunities

## Learning Path
- How to learn this skill (resources)
- Time estimate
- Difficulty level
```

---

## Next: Social Media Analytics Agent

**This is our first agent.** Following this process:

**Step 1**: Agent confirmed ✅ (you want daily analytics)
**Step 2**: Skills identified ✅ (6 skills needed)
**Step 3**: Skills presented ✅ (I told you what we need)
**Step 4**: Your decision ⏳ (waiting for API keys)
**Step 5**: Build ⏳ (starts when you give approval)

Once you get API keys → I start building → Week 2-3 we're live.

---

_This process repeats for every agent. Transparent. Intentional. No surprises._
