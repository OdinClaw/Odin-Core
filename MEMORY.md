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

## Agent Architecture Strategy
- **One agent per workflow**: Social Media Analytics, Collab Leads, Thought Leadership, Content Scheduler, Fan Community Bot, Insurance Analyzer
- **Skill identification process**: 5 steps — Request → Audit → Present → Decide → Build
- **Skill documentation**: Create SKILL.md files, learn + document, then implement
- **Transparency commitment**: Always tell Bazzy what skills are needed BEFORE building (with time estimates)
- **Agent coordination**: Agents feed data to each other (e.g., Analytics → Collab Leads + Scheduler)
- Each agent gets: Purpose, Inputs, Outputs, Skills Required, Schedule, Status
- **Skill reuse**: Skills built for one agent are documented + reused for others
- Reference docs: AGENT_ARCHITECTURE.md, SKILL_IDENTIFICATION_PROCESS.md
