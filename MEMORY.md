# MEMORY.md — Long-Term Memory

## Active Projects

### Bazzy's Growth Stack — Integrated Music + IT (🚀 PHASE 1: INFRASTRUCTURE, Started March 1, 2026)

#### Music Growth (Approved Ideas: 1, 3, 4)
1. **Social Media Analytics** (#social-analytics) — Daily streaming data, engagement tracking, optimal posting times
   - Status: MVP Cron job created (runs 8 AM EST)
   - Waiting: API setup (YouTube + Spotify)
   
2. **Fan Community Bot** (#fan-community) — Discord engagement, listening parties, fan shoutouts
   - Status: Framework planned
   - Priority: After Analytics Dashboard live
   
3. **Collab Finder** (#collab-finder) — AI-powered trending artist discovery, outreach templates
   - Status: Cron job created (runs Wed 10 AM EST)
   - Waiting: First run feedback

#### IT Professional (Approved Ideas: 1, 2, 4)
1. **Insurance Legacy Wrapper** (#insurance-ai-agent) — AI layer over AIM/Imageright/Titan
   - REVISED STRATEGY: Don't build from scratch. Wrap existing tools with intelligent interface.
   - MVP: Natural language policy search + claims lookup
   - Status: Strategy refined, specs ready
   - Constraint: Limited visibility into operations workflows
   
2. **AI Agent Portfolio Site** (#portfolio-showcase) — GitHub repos, case studies, live demos
   - Status: Planned (3 projects: insurance, artist toolkit, creator tools)
   - Priority: After insurance + toolkit reach beta stage
   
3. **Thought Leadership** (#thought-leadership) — LinkedIn posts (3/week), blog articles, industry insights
   - Status: Content calendar created + cron job (Mon 9 AM EST)
   - Waiting: Weekly drafts to begin

#### Integrated: Artist Toolkit (🔥 TOP PRIORITY NOW)
1. **Analytics Dashboard** (#toolkit-development) — Real-time metrics (Instagram, TikTok, YouTube, Spotify)
   - Status: MVP spec being updated to include Instagram + TikTok (critical platforms)
   - CRITICAL NOTE: Instagram + TikTok drive Bazzy's entire presence
   - Next: Get API keys from Bazzy + expand dashboard spec
   - Timeline: 2-4 weeks to MVP live with ALL platforms
   
2. **Content Scheduler** (planned Phase 2)
   - Status: On hold pending Analytics Dashboard completion
   
3. **Revenue Model**: Freemium SaaS ($10-20/mo), white-label for studios, consulting

#### Insurance Tool (Research Phase — Lower Priority)
- Status: DEFERRED — Research & data collection only
- Bazzy collecting workflows from brokers/assistants over time
- Will develop spec incrementally as data arrives
- Security vetting will be required before any implementation
- No execution until infrastructure + security review complete

### Odin Environment — Discord-Based Foundation (✅ PHASE 1 COMPLETE: Feb 28, 2026)
- **Previous Approach**: Mission Control app — ❌ **ABANDONED** (overcomplication)
- **New Approach**: Discord as primary environment + interface
- **Why**: Richer platform, less custom code, native integrations, better for agent orchestration
- **Status**: Phase 1 Complete — Core Discord integration live

#### Phase 1: Discord Foundation (✅ COMPLETE)
- ✅ 8 MVP channels created:
  - #odin-general (chat with user)
  - #cron-jobs (all cron execution logs)
  - #status-heartbeat (periodic heartbeat checks)
  - #agents (sub-agent activity)
  - #projects (project updates)
  - #usage-limits (token/cost tracking)
  - #docudigest (docs & learning)
  - #workshop (experimental work)
- ✅ Bot permissions configured (Administrator role)
- ✅ Discord integration scripts deployed:
  - `post_to_discord.py` — Helper to post messages from cron jobs
  - `discord_integration.py` — Full bot listener (future use)
- ✅ Heartbeat cron job created (every 30 min → #status-heartbeat)

#### Phase 2: Automation & Integration (UPCOMING)
- Wire up other cron jobs to post to appropriate channels
- Agent spawn/lifecycle logging to #agents
- Project status updates to #projects
- Usage tracking to #usage-limits
- Custom Discord commands for Odin operations

## About Bazzy (Owner)

### Career #1: Artist / Music Producer
- **Studio**: Recording studio in Brooklyn
- **Genres**: R&B, Pop, Rap
- **Skills**: Self-engineer all music, handle own content + social posting
- **YouTube**: https://www.youtube.com/@mixedbybazzy
- **Spotify**: https://open.spotify.com/artist/6sNRIgWiyGwj7gikTGPaGb
- **Goal**: Grow audience, become successful as artist/producer

### Career #2: IT Professional / AI Specialist
- **Role**: IT Administrator, regional support team for insurance company
- **Company**: Wholesale insurance firm (acts as middleman between carriers & insured)
- **Domain Knowledge**: Started ADBanker License program (90 hours completed, broker track interest)
- **Legacy Systems**: 
  - AIM + Imageright (program pair users interact with)
  - Titan (alternative program)
  - Both: old, non-user-friendly, time-consuming workflows
- **Credentials**: AWS Cloud Practitioner certified
- **Skills**: Cloud infrastructure knowledge, coding basics, passionate about AI
- **Constraints**: On IT side, not operations side. Limited direct visibility into business workflows.
- **Goals**: 
  - Build AI agents for personal goals
  - Improve legacy system UX with AI layer
  - Become successful as IT professional + AI specialist

### Vision
Use Odin to grow music audience AND scale IT/AI career — aiming for wealth + fame through both paths

## User Preferences
- Wants free/cost-optimized solutions
- Follows existing OpenClaw config rules
- Values momentum-based task prioritization
- **Primary Communication Channel**: Discord (#odin-general)
- All OpenClaw capabilities (memory, skills, soul.md, cron jobs) remain the same, just output goes to Discord
- Cron jobs post results to Discord automatically (via post_to_discord.py)

## Lessons Learned
- ALWAYS read memory files at session start — no excuses
- User gets (rightfully) frustrated when progress is forgotten
- Instagram + TikTok are CRITICAL for artist growth (not just YouTube/Spotify)
- Insurance tool needs deep research before implementation (security + workflows matter)
- Better to prioritize correctly early than build wrong thing fast

## Communication Preferences
- Direct, no-nonsense — wants things done right the first time
- Prefers Discord for all communication
- Values clear action items + clear timelines
- Appreciates documentation + examples
- Wants to understand the "why" before execution

## Agent Architecture: The Pantheon (March 2, 2026 — ACTIVATED)

### System Overview
- **12 specialized agents** running 24/7, each with specific role + personality
- **Mythology framework**: Each agent named after Greek god / mythological figure from Record of Ragnarok
- **File-based coordination**: Agents communicate via markdown files, not APIs
- **Feedback-driven improvement**: Agents get smarter through corrections, not model swaps
- **Transparent operations**: Every agent's workflow is documented + visible

### Pantheon Roster (Active/Queued/Paused)

**ACTIVE NOW**:
1. **Odin** — Environment Orchestrator (overseer, operations)
2. **Apollo** — Social Media Analytics Agent (Instagram, TikTok, YouTube, Spotify daily)
3. **Buddha** — Thought Leadership Agent (LinkedIn 3x/week)

**CONSOLIDATION COMPLETE (March 2, 2026)**:
- Old Music Growth, IT Professional, Integrated Artist Toolkit folders → Agent ownership
- All data + memory preserved
- Agents now own their respective workflows (see SIGNALS.md)

**QUEUED (Waiting for APIs or dependencies)**:
4. **Hermes** — Collab Leads Agent (weekly artist discovery + outreach)
5. **Chronus** — Content Scheduler Agent (optimal posting times)
6. **Hercules** — Fan Community Bot (Discord engagement)
7. **Tesla** — Portfolio AI Agent (GitHub + portfolio site proof-of-work)
8. **Beelzebub** — Research + Development Lab (LLM optimization, architecture evolution)

**PAUSED/RESEARCH PHASE**:
9. **Zeus** — Insurance Analyzer Agent (workflow research only, no build yet)
10. **Hades** — Security Audit Agent (activated after core pantheon stable)
11. **Shiva** — Trading Bot (foundation only, no capital yet)
12. **Qin Shi Huang** — Spending Tracker (activated after core pantheon stable)
13. **Adam** — DocuDigest Agent (knowledge capture + memory indexing)
14. **Sasaki Kojiro** — Workshop Agent (curriculum + production systems)

### File Structure (The Operating System)

**Layer 1: Identity**
- `IDENTITY.md` — Quick reference card
- `agents/[name]/SOUL.md` — Full personality + principles
- `agents/[name]/IDENTITY.md` — Quick ref for each agent

**Layer 2: Operations**
- `AGENTS.md` (root) — Session startup + pantheon rules
- `agents/[name]/AGENTS.md` — Agent-specific workflow + schedule
- Role-specific guides (e.g., `agents/apollo/ANALYTICS-PROTOCOL.md`)

**Layer 3: Knowledge**
- `MEMORY.md` (root) — Bazzy's feedback + system learnings
- `agents/[name]/memory/MEMORY.md` — Agent-specific learnings
- `memory/YYYY-MM-DD.md` — Daily operational logs
- `shared-context/THESIS.md` — Bazzy's worldview (music, AI, insurance)
- `shared-context/FEEDBACK-LOG.md` — Universal corrections (reads to ALL agents)
- `shared-context/SIGNALS.md` — Project status + trends

**Coordination Layer**
- `intel/SOCIAL-METRICS.md` — Apollo's daily output
- `intel/THOUGHT-LEADERSHIP.md` — Buddha's weekly posts
- `intel/COLLAB-LEADS.md` — Hermes's opportunities
- One writer per file. Other agents read. No conflicts.

### How Agents Improve Over Time

1. **Bazzy gives feedback** → agent writes to memory file immediately
2. **Pattern emerges** → gets distilled into MEMORY.md or FEEDBACK-LOG.md
3. **Next session** → agent reads updated files
4. **Behavior improves** → without model swap or prompt engineering
5. **Same cost, exponentially better output**

### Coordination Rules

- **One writer per file** (e.g., Apollo writes `intel/SOCIAL-METRICS.md`, others read)
- **Scheduling matters** (Apollo 8 AM → feeds Chronus, Buddha, Hermes)
- **Filesystem is integration layer** (no APIs, just markdown files)
- **Each agent has one job.** Do it exceptionally.

### Writing Standards (Universal)

All agents read `shared-context/FEEDBACK-LOG.md` at session start:
- Be direct. Deliver answer in 1-2 sentences.
- No fluff, no corporate buzzwords, no em dashes.
- Show your work. Numbers get sources. Estimates show logic.
- Professional but human. Talk like a builder.
- Clarity over creativity.

---

### Skill Identification Process (Unchanged)

When building a new agent:
1. **Request**: Bazzy identifies need
2. **Audit**: I identify required skills
3. **Present**: I show what + how long
4. **Decide**: Bazzy approves or defers
5. **Build**: Learn, document, implement, deploy

Every skill gets documented (SKILL.md) + can be reused across agents.
