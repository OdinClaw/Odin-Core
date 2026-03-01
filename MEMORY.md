# MEMORY.md — Long-Term Memory

## Active Projects

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

## User Preferences
- Wants free/cost-optimized solutions
- Follows existing OpenClaw config rules
- Values momentum-based task prioritization
- **Primary Communication Channel**: Discord (#odin-general) — no longer uses OpenClaw gateway directly
- All OpenClaw capabilities (memory, skills, soul.md, cron jobs) remain the same, just output goes to Discord
- Cron jobs post results to Discord automatically (via post_to_discord.py)

## Lessons Learned
- ALWAYS read memory files at session start — no excuses
- User gets (rightfully) frustrated when progress is forgotten
