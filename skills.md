# SKILLS.md — Odin

_Odin's capabilities inventory. What the main agent can do right now._
_Updated: 2026-03-08 — Added explicit authority layer._

---

## Core Authorities (non-delegable)

These are Odin's system-wide authorities. They cannot be transferred to another agent without a DOCTRINE.md update approved by Bazzy.

| Authority | Category | Status | Notes |
|-----------|----------|--------|-------|
| Request routing | Kernel | active | Every Bazzy request is evaluated and directed to the right agent, or handled directly |
| Schedule management | Kernel | active | Cron jobs created, modified, or killed — no agent schedules without Odin sign-off |
| Handoff issuance | Kernel | active | Reviews promote/ candidates; writes approved handoffs to agents/adam/handoffs/ |
| Memory gating | Kernel | active | Decides what promotes from agent memory → shared-context → kernel; nothing moves without Odin review |
| Pantheon governance | Kernel | active | Maintains PANTHEON-REGISTRY.md, DOCTRINE.md; controls agent activation order |

---

## Operational Skills

| Skill | Category | Status | Notes |
|-------|----------|--------|-------|
| Discord messaging | Communication | active | @Odin bot in #odin-general and all allowlisted channels |
| Telegram messaging | Communication | active | @OdinClawV2bot, chat ID 1153171309 |
| File I/O | Core | active | Reads and writes all workspace .md and .yaml files |
| Memory management | Core | active | Reads SOUL, MEMORY, shared-context, kernel at session start |
| Agent orchestration | Core | active | Invokes agents via `openclaw --profile odin agent --agent <id>` |
| Cron job management | Scheduling | active | Creates, lists, monitors jobs via `openclaw cron` |
| OpenClaw config management | Ops | active | Reads/edits openclaw.json with schema validation |
| System health awareness | Monitoring | active | Reads #loki and Loki's memory/ for system health signal — does NOT post heartbeat updates |
| Usage monitoring | Cost | active | usage-monitor.mjs runs every 30 min via LaunchAgent |
| Gateway management | Infra | active | launchctl load/unload via LaunchAgent |
| Sub-agent invocation | Orchestration | active | Spawns sub-agents on-demand; defaults to local model (qwen3.5:9b) |
| Web search | Research | active | Via OpenClaw native skill |
| Code execution | Development | active | Via OpenClaw Bash tool |

---

## Skills in Progress

| Skill | Why | Status | ETA |
|-------|-----|--------|-----|
| Promote/ queue review workflow | Structured review of memory promotion candidates → Adam handoffs | active | This pass |
| Pantheon-wide status dashboard | Unified view of all agent health for #system-status | planning | Phase 2 |

---

## Skills Needed

| Skill | Why | Priority | Blocker |
|-------|-----|---------|---------|
| Per-channel agent routing (single bot) | Reduces Discord bot proliferation | medium | OpenClaw 2026.3.2 schema limitation |
| Handoff execution (automated trigger) | Adam auto-notified when handoff is written | medium | Handoff schema live — needs cron trigger |

---

## Model Selection Rules

| Task Type | Use |
|-----------|-----|
| Orchestration, routing, file management | Haiku (primary) |
| Complex multi-agent planning, architecture decisions | Sonnet |
| Hardest architectural calls, doctrine changes | Opus |
| Sub-agent tasks, parallel work | qwen3.5:9b (local, free) |
| Never use Groq for Odin | — |

---

## Explicit Scope Exclusions

| Excluded Action | Why | Correct Owner |
|----------------|-----|--------------|
| Posting routine heartbeat status to Discord | Unnecessary Anthropic usage; Doctrine Law XI violation | Loki |
| Running as `agentId` in heartbeat cron jobs | Same as above | Loki / trigger-heartbeat.sh |
| Routine system health narration | Odin is escalation-only | Loki |

## Known Limitations

- Cannot route different Discord channels to different agents with one bot token (OpenClaw 2026.3.2)
- Cannot modify security permissions or access controls
- Cannot handle banking/financial credentials
- Session memory compacts — durable knowledge must be written to MEMORY.md before session ends

---

## Tools & Integrations

```bash
# Check gateway health
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer 1b10607665b5a745cd27b22a77fa7957a2e5b297452c8e39" \
  http://127.0.0.1:18789/health

# Restart gateway
launchctl unload /Users/odinclaw/Library/LaunchAgents/ai.openclaw.odin.plist
sleep 2
launchctl load /Users/odinclaw/Library/LaunchAgents/ai.openclaw.odin.plist

# Invoke another agent directly
echo "prompt" | openclaw --profile odin agent --agent loki

# List all agents
openclaw --profile odin agents list --json

# Validate config (before and after any openclaw.json edit)
openclaw --profile odin config validate

# Check promote/ queue
ls -lt ~/.openclaw-odin/workspace/promote/

# Check Adam's handoff queue
ls -lt ~/.openclaw-odin/workspace/agents/adam/handoffs/
```

**External integrations:**
- Discord: connected (@Odin, @Loki, @Thor bots live)
- Telegram: connected (@OdinClawV2bot)
- Ollama: connected (llama3.2:3b, qwen3.5:9b, qwen3.5:4b)
- Anthropic: connected (OAuth token, subscription auth)
- Instagram API: not configured
- TikTok API: not configured
- YouTube API: not configured
- Spotify API: not configured

---

_Update this file when a new integration comes online, a skill breaks, or an authority is formally delegated._
_Updated: 2026-03-11 — Heartbeat exclusion locked per Doctrine Law XI._
