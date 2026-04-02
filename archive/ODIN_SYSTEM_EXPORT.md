# ODIN_SYSTEM_EXPORT.md
> **Generated:** 2026-03-08 | **OpenClaw version:** 2026.3.2 | **Status at export:** `normal` mode, all providers healthy

This document is the complete technical and architectural record of the Odin AI system. It is written for an AI with zero prior context who must understand this system fully enough to make informed system design decisions and act as Odin's system architect.

---

# TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Hardware + Environment](#2-hardware--environment)
3. [Core Infrastructure](#3-core-infrastructure)
4. [LLM Routing Architecture](#4-llm-routing-architecture)
5. [Model Providers](#5-model-providers)
6. [Agents](#6-agents)
7. [Tools + Integrations](#7-tools--integrations)
8. [Memory Systems](#8-memory-systems)
9. [Safety + Deterministic Controls](#9-safety--deterministic-controls)
10. [Known Limitations](#10-known-limitations)
11. [Planned Features](#11-planned-features)
12. [Directory Structure](#12-directory-structure)

---

## APPENDIX DOCUMENTS

- [ODIN_BOOT_SEQUENCE](#odin_boot_sequencemd)
- [ODIN_RUNTIME_FLOW](#odin_runtime_flowmd)
- [ODIN_DESIGN_PHILOSOPHY](#odin_design_philosophymd)
- [ODIN_LIMITS](#odin_limitsmd)

---

# 1. System Overview

## Purpose

Odin is a **personal AI operating system** — an always-on, autonomous agent network running on a home Mac Mini. It serves Bazzy (mixedbybazzy), a music artist and IT professional based in Brooklyn, as a 24/7 AI infrastructure for two primary use cases:

1. **Music career growth** — social analytics, artist discovery, content scheduling, fan community engagement
2. **IT/AI professional development** — insurance AI tooling, portfolio building, thought leadership content

Odin is not a single chatbot. It is a network of specialized autonomous agents, each with a defined role, running on a cost-optimized, fault-tolerant LLM routing stack with Discord as its primary user interface.

## Design Philosophy

**"Always on, never broken, nearly free."**

- **Cost efficiency first** — Anthropic subscription covers unlimited usage within session/weekly windows. Groq is essentially free at current volumes. Ollama is $0. Every design decision prefers the cheapest capable option.
- **Always-on reliability** — The system must never crash silently or leave the user with no response. A degraded-mode handler guarantees a meaningful reply even when all cloud providers fail.
- **Deterministic before probabilistic** — If a task can be handled without an LLM (config reads, routing decisions, health checks), it must be handled without one. Zero wasted tokens.
- **Escalation only when justified** — Never route to a more capable (expensive) model unless the task genuinely requires it.
- **External architecture, not internal hooks** — OpenClaw has no plugin API into its LLM call chain. All safety, routing, and budget logic is implemented as external scripts that gate and control the trigger layer.
- **File-based coordination** — Agents share state through markdown files and JSON state files, not APIs. One writer per file. Others read. No race conditions.

## Core Goals

| Goal | Implementation |
|------|----------------|
| Always-on reliability | 4 LaunchAgents auto-restart on failure; degraded-mode handler covers all-cloud-down state |
| Cost optimization | Task classifier routes cheapest capable model; budget caps prevent runaway spend |
| Self-healing routing | Health monitor updates routing mode every 60 seconds; automatic fallback chain |
| Zero silent failures | Circuit breaker gates every trigger; degraded mode posts to Discord before any LLM call |
| Autonomous agent network | OpenClaw multi-agent setup with isolated workspaces and Discord routing |

## High-Level Architecture

```
User (Discord / Telegram)
         │
         ▼
OpenClaw Gateway (port 18789, localhost)
         │
         ├─ Agent: main (Odin) ─── Cron scheduler → trigger-heartbeat.sh
         ├─ Agent: loki ────────── launchd trigger → trigger-heartbeat.sh
         └─ Agent: thor ────────── direct Discord messages
                   │
                   ▼
         External Control Layer (custom scripts)
         ├─ Task Classifier (scripts/task-classifier.mjs)
         ├─ Prompt Cache (scripts/prompt-cache.mjs)
         ├─ Request Circuit Breaker (scripts/request-circuit-breaker.mjs)
         ├─ Groq Throttle (scripts/groq-throttle.mjs)
         ├─ Budget Controller (scripts/budget-controller.mjs)
         └─ Degraded-Mode Handler (scripts/degraded-mode.mjs)
                   │
                   ▼
         Provider Health Monitor (every 60s)
         └─ Writes: provider-registry.json (routing mode, scores, recommendations)
                   │
                   ▼
         LLM Providers
         ├─ Anthropic (primary)  — Claude Haiku/Sonnet/Opus via OAuth subscription
         ├─ Groq (fallback)      — Llama 3.1/3.3 + GPT-OSS 120b via API key
         └─ Ollama (infra-only)  — llama3.2:3b local, free, 2GB RAM
```

## Why OpenClaw

OpenClaw is a self-hosted AI agent platform (similar to Claude.ai projects but locally controlled). It was chosen for:

- **Multi-agent support** — isolated agent instances with separate workspaces, sessions, and Discord bots
- **Subscription auth support** — can use Claude.ai OAuth token instead of API key, bypassing Tier 1 rate limits (50 RPM)
- **Cron scheduler built-in** — native scheduled task execution without custom orchestration
- **Discord + Telegram channels** — native integration with no custom bot code needed for basic I/O
- **LaunchAgent compatible** — runs as a persistent macOS daemon with auto-restart
- **Config-driven routing** — `openclaw.json` primary + fallback chain is updated by external scripts to change routing mode dynamically

---

# 2. Hardware + Environment

## Hardware

| Component | Specification |
|-----------|---------------|
| Machine | Apple Mac Mini (Apple Silicon) |
| CPU | Apple M4 |
| Architecture | ARM64 (arm64) |
| RAM | 16 GB unified memory |
| Storage | 228 GB SSD (117 GB available at export) |
| OS | macOS 15.6 (Build 24G84) |
| Network | Residential internet; local services on 127.0.0.1 |

## Key Runtimes

| Runtime | Version | Used For |
|---------|---------|----------|
| Node.js | v25.6.1 | All custom scripts (.mjs), OpenClaw runtime |
| Ollama | 0.17.5 | Local LLM serving (llama3.2:3b, qwen3.5 stored but excluded from routing) |
| Homebrew | Current | Package management |

> **Note on Ollama version:** Ollama 0.17.5 is required. Version 0.16.x returns 412 errors when loading Qwen3.5. Do not downgrade.

## Installed Local Models (Ollama)

| Model | Size | Status |
|-------|------|--------|
| `llama3.2:3b` | 2.0 GB | **Active** — infra-only (heartbeat, sub-agents) |
| `qwen3.5:9b` | 6.6 GB | Downloaded but **EXCLUDED from all routing** |
| `qwen3.5:4b` | 3.4 GB | Downloaded but **EXCLUDED from all routing** |

> **Why Qwen is excluded:** Qwen3.5 was originally planned as a free local fallback but was removed from all routing because 1-minute response times are unacceptable for live agent tasks. Models remain on disk in case of future re-evaluation.

## Auth Configuration

| Provider | Auth Type | Profile | Location |
|----------|-----------|---------|----------|
| Anthropic | OAuth (subscription token) | `anthropic:default` | `agents/main/agent/auth-profiles.json` |
| Groq | API key | `groq:default` | `agents/main/agent/auth-profiles.json` |
| Ollama | API key (`ollama-local`) | `ollama:default` | `agents/main/agent/auth-profiles.json` |

> **Why OAuth for Anthropic:** API Tier 1 limits (50 RPM) were too restrictive. The subscription OAuth token uses the claude.ai session, which has 5-hour and 7-day usage windows instead of per-request rate limits. This allows burst usage at the cost of monitoring window consumption.

## Environment Variables (Gateway LaunchAgent)

```
OPENCLAW_CONFIG_PATH     = /Users/odinclaw/.openclaw-odin/openclaw.json
OPENCLAW_GATEWAY_PORT    = 18789
OPENCLAW_GATEWAY_TOKEN   = 1b10607665b5a745cd27b22a77fa7957a2e5b297452c8e39
OPENCLAW_PROFILE         = odin
OPENCLAW_STATE_DIR       = /Users/odinclaw/.openclaw-odin
PATH                     = /opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
TELEGRAM_BOT_TOKEN       = (set in plist)
TELEGRAM_CHAT_ID         = 1153171309
```

---

# 3. Core Infrastructure

## Process Architecture

Odin runs as a collection of macOS LaunchAgent daemons, all managed by `launchctl`. There is no Docker, no container orchestration, no systemd. Everything is native macOS process management.

### LaunchAgent Inventory

| Plist Label | Process | Interval | Auto-Restart |
|-------------|---------|----------|--------------|
| `ai.openclaw.odin` | OpenClaw gateway (port 18789) | Persistent (`KeepAlive: true`) | Yes |
| `ai.openclaw.odin.provider-monitor` | `provider-health-monitor.mjs` | Every 60 seconds | Yes |
| `ai.openclaw.odin.usage-monitor` | `usage-monitor.mjs` | Every 30 minutes | Yes |
| `ai.openclaw.loki-heartbeat` | `trigger-heartbeat.sh` (Loki) | Every 30 minutes | Yes |
| `ai.openclaw.gateway.plist` | Gateway variant | Persistent | Yes |

All plists located at: `~/Library/LaunchAgents/`

### Gateway

The OpenClaw gateway is the central hub:
- **Port:** `ws://127.0.0.1:18789`
- **Auth:** Bearer token (`1b10607665b5a745cd27b22a77fa7957a2e5b297452c8e39`)
- **Config:** `/Users/odinclaw/.openclaw-odin/openclaw.json`
- **Function:** Receives messages from Discord/Telegram, routes to the correct agent, executes cron jobs, manages sessions

Health check: `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer <token>" http://127.0.0.1:18789/health`

### OpenClaw Internal Components

```
openclaw.json
  ├── agents.defaults        → default model chain, workspace, heartbeat, subagent models
  ├── agents.list            → registered agents (main, loki, thor)
  ├── bindings               → channel → agent routing rules
  ├── channels.discord       → bot tokens, guild config, channel allowlists
  ├── channels.telegram      → bot config
  ├── gateway                → port, auth token
  └── auth.order             → which auth profiles to use per provider
```

## Cron Job Scheduler

OpenClaw has a built-in cron scheduler. Jobs are defined in `~/.openclaw-odin/cron/jobs.json`.

### Active Cron Jobs

| Job Name | Agent | Schedule | Model | Purpose |
|----------|-------|----------|-------|---------|
| Odin Heartbeat | main | Every 30 min | `ollama/llama3.2:3b` | Read HEARTBEAT.md, run checks, post status to Discord |
| Update #memory channel | main | Daily 8 AM EST | (default chain) | Read MEMORY.md, extract key sections, post as .txt to #memory |
| Update #skills channel | main | Daily 8 AM EST | (default chain) | Read available skills, update pinned message in #skills |

### Disabled Cron Jobs (Pending APIs/Dependencies)

| Job Name | Schedule | Blocked By |
|----------|----------|-----------|
| Daily Music Analytics Digest | Daily 8 AM | YouTube + Spotify API keys |
| Weekly LinkedIn Content Draft | Mon 9 AM | LinkedIn integration |
| Weekly Trending Artists Report | Wed 10 AM | Platform APIs |
| Artist Analytics Dashboard | Daily 8 AM | Platform APIs |

### Cron Job Payload Format

```json
{
  "kind": "agentTurn",
  "message": "...",
  "model": "ollama/llama3.2:3b"
}
```

`sessionTarget: "isolated"` — each cron run gets a fresh isolated session (no cross-contamination between runs).

## Loki Heartbeat Trigger Pipeline

Loki's heartbeat does NOT go through OpenClaw's cron scheduler. It uses an external `trigger-heartbeat.sh` script invoked directly by launchd every 30 minutes. This gives full control over the pre-flight safety chain:

```
launchd (every 1800s)
    │
    ▼
trigger-heartbeat.sh
    │
    ├─ Step 1: Circuit breaker gate
    │    └─ node request-circuit-breaker.mjs gate loki-heartbeat utility_local
    │    └─ If BLOCKED → log + exit 0 (launchd does not retry)
    │
    ├─ Step 2: Degraded mode check
    │    └─ node degraded-mode.mjs check
    │    └─ If DEGRADED → node degraded-mode.mjs handle-heartbeat → exit 0
    │
    ├─ Step 3a: Groq throttle check (groq_fallback mode only)
    │    └─ node groq-throttle.mjs process-queue
    │    └─ node groq-throttle.mjs acquire loki-heartbeat heartbeat-trigger
    │    └─ If THROTTLED → enqueue + circuit SUCCESS + exit 0
    │
    ├─ Step 4: openclaw invocation
    │    └─ openclaw --profile odin ... (Loki's heartbeat task)
    │
    └─ Step 5: Outcome recording
         └─ node request-circuit-breaker.mjs complete <requestId> success|failure
```

## Provider Health Monitor

The health monitor (`provider-health-monitor.mjs`) runs every 60 seconds and is the "brain" of the routing system. It:

1. Scans recent log output for Anthropic errors (429, 5xx, overloaded, rate_limit)
2. HTTP-probes Groq (`GET /openai/v1/models`) — never an inference call
3. Checks RAM availability
4. Computes provider scores
5. Determines current routing mode (`normal`, `groq_fallback`, `safe_mode`)
6. Writes `provider-registry.json` with scores, recommendations, state snapshots
7. Updates `openclaw.json` model chain if routing mode changed
8. Debounced gateway restart if mode changed (max once per 3 min)
9. Sends Telegram + Discord alerts on mode transitions

## Usage Monitor

The usage monitor (`usage-monitor.mjs`) runs every 30 minutes and:

1. Fetches both 5-hour (session) and 7-day (weekly) usage windows from claude.ai
2. Calculates percentage consumed for each window
3. Sends Telegram alerts at 50%, 75%, 90%, 95% thresholds
4. At 95% session usage: includes estimated time until reset
5. At 95% weekly usage: includes reset datetime
6. Alert deduplication via `scripts/usage-monitor-state.json` (prevents duplicate alerts)

---

# 4. LLM Routing Architecture

Routing happens across two orthogonal dimensions: **capability tier** (what complexity of task) and **provider** (which cloud is available). These dimensions are independent and controlled by separate systems.

## Dimension 1: Capability Tier (Task Classifier)

The task classifier (`scripts/task-classifier.mjs`) runs before every LLM invocation and assigns one of five routing buckets:

| Bucket | Model (Anthropic healthy) | Model (Anthropic down) | Cache TTL | Cost |
|--------|--------------------------|----------------------|-----------|------|
| `no_llm` | None — handle deterministically | None | Bypass | $0 |
| `utility_local` | `ollama/llama3.2:3b` | `ollama/llama3.2:3b` | 5 min | $0 |
| `cheap_routine` | `claude-haiku-4-5` | `groq/llama-3.1-8b-instant` | 4 hours | Lowest |
| `standard_agent` | `claude-sonnet-4-5` | `groq/llama-3.3-70b-versatile` | 1 hour | Medium |
| `premium` | `claude-opus-4-6` | `groq/openai/gpt-oss-120b` | Bypass | Highest |

**Classification factors:** complexity, stakes, multi-step reasoning, tool usage, repeat frequency, prompt size, downstream impact.

**Confidence rule:** If confidence < 70%, promote to the next tier. Never under-route ambiguous tasks.

**`no_llm` examples:** health checks, config reads, routing decisions, cron scheduling, simple aggregation, file I/O.

### Reading Current Recommendations

The health monitor writes live model recommendations into `provider-registry.json → recommendations{}` every 60 seconds. Always read this file before spawning a sub-agent — do not guess.

```bash
node ~/.openclaw-odin/scripts/task-classifier.mjs "your task description"
node ~/.openclaw-odin/scripts/task-classifier.mjs validate
```

## Dimension 2: Provider Router (Health Monitor)

Three routing modes, auto-switched by the health monitor:

```
Mode: normal
  ├─ Anthropic: healthy (score ≥ 80)
  └─ Chain: haiku → sonnet → opus → groq-8b → groq-70b → groq-120b

Mode: groq_fallback
  ├─ Anthropic: in cooldown (score < 40 or consecutive failures)
  └─ Chain: groq-8b → groq-70b → groq-120b → llama3.2:3b

Mode: safe_mode
  ├─ Both Anthropic AND Groq: failed/budget-disabled
  └─ Chain: llama3.2:3b only
  └─ Degraded-mode handler activates for heartbeat/status tasks
```

### Provider Score Mechanics

| Event | Score Change |
|-------|-------------|
| Clean operation (per minute) | +5 (max +25 per monitor run) |
| Anthropic 429/5xx/overloaded log event | −20 per event |
| Anthropic timeout | −10 |
| Groq probe success | +15 |
| Groq probe failure | −30 |

Provider states: `healthy` (≥80) → `degraded` (40–79) → `cooldown` (circuit open) → `recovering` → `healthy`

### Model Escalation Logic

Escalation is capability-based, not provider-based. Within Anthropic:

```
Haiku → (task too complex?) → Sonnet → (task too complex?) → Opus
```

Escalation triggers:
- Task classifier assigns `standard_agent` or `premium` bucket
- Budget pressure demotes (does not escalate)
- Provider failure triggers provider swap (not capability escalation)

### Budget Pressure on Model Selection

Budget pressure adjusts capability tier but never changes the provider priority:

| Budget Pressure | Effect |
|----------------|--------|
| `none` | No change |
| `soft` ($1.00/day, $20/mo) | Log; prefer cheaper within tier |
| `hard` ($1.50/day, $30/mo) | Block `premium`; demote `standard_agent` → `cheap_routine` |
| `critical` ($2.00/day, $40/mo) | Telegram alert; minimum service maintained |

`no_llm` and `utility_local` are never demoted — they are always free.

### The Absolute Routing Rules (Immutable)

These rules must never be violated regardless of budget, mode, or pressure:

1. **Anthropic is always primary** — if healthy, it gets the request
2. **Groq activates on provider failure ONLY** — not on budget pressure, not on user preference
3. **Ollama is infra-only** — `utility_local` bucket and heartbeat only; never for reasoning tasks
4. **Qwen is excluded from all routing** — permanently, regardless of availability or mode
5. **Single-pass enforcement** — each provider is tried AT MOST ONCE per request; no retry storms
6. **No Qwen fallback even in degraded mode** — degraded mode uses deterministic replies, not Qwen

---

# 5. Model Providers

## Anthropic

| Property | Value |
|----------|-------|
| **Role** | Primary inference provider |
| **Auth** | OAuth subscription token (claude.ai session) |
| **Models** | `claude-haiku-4-5-20251001`, `claude-sonnet-4-5`, `claude-opus-4-6` |
| **Tasks** | All `cheap_routine`, `standard_agent`, `premium` tasks when healthy |
| **Rate limits** | 5-hour session window + 7-day weekly window (subscription) |
| **Failure conditions** | 429, 5xx, overloaded errors; window exhaustion |
| **Fallback to** | Groq (automatic via health monitor mode change) |
| **Cost rates** | Haiku: $0.80/$4.00 per 1M tokens in/out; Sonnet: $3/$15; Opus: $15/$75 |

**Why OAuth not API key:** Tier 1 API key limits (50 RPM) caused constant 429 errors. Subscription OAuth provides unlimited requests within usage windows, making burst-heavy agent workloads viable.

**Usage monitoring:** `usage-monitor.mjs` polls claude.ai every 30 minutes and alerts at 50/75/90/95% of each window.

## Groq

| Property | Value |
|----------|-------|
| **Role** | Cloud fallback when Anthropic is in cooldown |
| **Auth** | API key (`groq:default`) |
| **Models** | `llama-3.1-8b-instant`, `llama-3.3-70b-versatile`, `openai/gpt-oss-120b` |
| **Tasks** | Same bucket mapping as Anthropic but only when Anthropic fails |
| **Health probe** | `GET /openai/v1/models` — NOT an inference call, not throttled |
| **Activation** | Automatic when Anthropic score drops below threshold |
| **Throttle limits** | Max 1 request/2 seconds; max 20 requests/60s sliding window |
| **Budget cap (daily)** | $1.50 — disables Groq until midnight UTC on hit |
| **Budget cap (monthly)** | $30 — disables Groq for rest of month on hit |
| **Cost rates** | ~$0.05/$0.08 per 1M tokens in/out (essentially free at current volumes) |

**Throttling:** A persistent FIFO queue (`groq-throttle-state.json`) holds deferred requests when the rate window is exceeded. The next trigger run drains the queue first. Throttle events are marked circuit SUCCESS (not failure) — rate limiting is not a provider failure.

**Budget cap behavior:**
- Daily cap hit + Anthropic healthy → `normal` mode continues unaffected (Groq is irrelevant when not active)
- Daily cap hit + Anthropic in cooldown → `safe_mode` activates → degraded-mode handler takes over
- Monthly cap → same behavior but persists until end of calendar month

## Ollama

| Property | Value |
|----------|-------|
| **Role** | Infrastructure-only local model |
| **Version** | 0.17.5 |
| **Models in use** | `llama3.2:3b` (2GB RAM) |
| **Tasks** | `utility_local` bucket only: heartbeat, relay, status monitoring, simple sub-agents |
| **Never used for** | Agent reasoning, `cheap_routine` and above tasks |
| **Health probe** | Not probed by health monitor (always assumed available if RAM permits) |
| **RAM gate** | Disabled if free RAM < 512 MB |
| **Cost** | $0 — always |

**Why llama3.2:3b specifically:** 2GB RAM footprint leaves enough headroom on the 16GB M4 for other processes. Fast inference on Apple Silicon. Adequate for status summaries and relay tasks.

## Qwen3.5 (Excluded)

| Property | Value |
|----------|-------|
| **Status** | Downloaded but **fully excluded from all routing** |
| **Models on disk** | `qwen3.5:9b` (6.6GB), `qwen3.5:4b` (3.4GB) |
| **Reason for exclusion** | ~60-second response times unacceptable for live agent use |
| **Former role** | Planned free local fallback below Groq |
| **Current role** | None. Not in any fallback chain. |
| **Re-evaluation** | May be reconsidered if batch/async offline tasks are implemented |

---

# 6. Agents

Agents are named after figures from Norse mythology and the manga/anime "Record of Ragnarok." The naming convention reflects each agent's character archetype.

## Real Isolated OpenClaw Agents (Fully Registered)

These agents have their own OpenClaw CLI registration, their own workspace directories, their own model configs, and their own Discord bots.

---

### Odin (main)
| Property | Value |
|----------|-------|
| **ID** | `main` |
| **Name** | Odin |
| **Role** | Environment Orchestrator — overseer of the entire operation |
| **Emoji** | 🐺 |
| **Discord bot** | @Odin (ID: 1477069841738371173), token in `openclaw.json → channels.discord.accounts.default` |
| **Discord channels** | 9 channels (see §7), all allowlist mode, no @mention required |
| **Default model** | `anthropic/claude-haiku-4-5-20251001` |
| **Fallback chain** | haiku → sonnet → opus → groq-8b → groq-70b → groq-120b |
| **Heartbeat model** | `ollama/llama3.2:3b` |
| **Sub-agent model** | `ollama/llama3.2:3b` (override for heavy tasks: specify Haiku+) |
| **Workspace** | `~/.openclaw-odin/workspace/` |
| **Agent dir** | `~/.openclaw-odin/agents/main/` |
| **Trigger** | OpenClaw cron scheduler + Discord messages |
| **Cron jobs** | Odin Heartbeat (30min), Update #memory (daily 8AM), Update #skills (daily 8AM) |
| **Identity** | Strategic authority. Sees the whole board. Executes without drama. |

**Outputs:** Discord messages to 9 channels, Telegram alerts, file writes to workspace

---

### Loki
| Property | Value |
|----------|-------|
| **ID** | `loki` |
| **Name** | Loki |
| **Role** | 24/7 heartbeat monitor and status relay |
| **Emoji** | (not set) |
| **Discord bot** | @Loki (ID: 1478590584372461641), accountId: `loki` |
| **Discord channel** | #loki only (ID: 1478591775558996122) |
| **Model** | `ollama/llama3.2:3b` (local, free, no subscription usage) |
| **Workspace** | `~/.openclaw-odin/workspace/agents/loki/` |
| **Agent dir** | `~/.openclaw-odin/agents/loki/` |
| **Trigger** | launchd plist (`ai.openclaw.loki-heartbeat`) every 1800 seconds via `trigger-heartbeat.sh` |
| **Binding** | `{agentId: "loki", match: {channel: "discord", accountId: "loki"}}` |
| **Identity** | Monitor and relay. Watch heartbeat reports. Respond to direct user questions. Keep it simple. |

**What Loki does:**
1. Trigger script fires → runs 4-step safety pipeline → invokes openclaw
2. Reads HEARTBEAT.md in its workspace
3. Queries `cron list` dynamically — detects all current jobs automatically
4. Checks job status, consecutive errors, last run times
5. Posts structured status report to #loki

**Key feature:** Loki's job detection is fully dynamic. Adding new cron jobs requires zero Loki reconfiguration.

**Outputs:** Status reports in #loki; directly managed by trigger-heartbeat.sh safety pipeline

---

### Thor
| Property | Value |
|----------|-------|
| **ID** | `thor` |
| **Name** | Thor |
| **Role** | Production systems refinement + Artist Toolkit development tracking |
| **Emoji** | ⚒️ |
| **Discord bot** | @Thor (ID in openclaw.json), accountId: `thor` |
| **Discord channel** | #thor (ID: 1478133177687212062) |
| **Model** | `anthropic/claude-sonnet-4-5` (more capable — refinement requires reasoning) |
| **Workspace** | `~/.openclaw-odin/workspace/agents/thor/` |
| **Agent dir** | `~/.openclaw-odin/agents/thor/` |
| **Binding** | `{agentId: "thor", match: {channel: "discord", accountId: "thor"}}` |
| **Identity** | Refiner. Optimizer. The architect of working systems. Iteration beats perfection. |

**What Thor does:**
1. Understands workflows across all agents (reads their workspace files)
2. Identifies optimization opportunities — redundancy, waste, inefficiency
3. Tracks Artist Toolkit development pipeline (Apollo → Chronus → Hercules → Hermes integration)
4. Manages workshop curriculum (music production, AI agents, content strategy)
5. Documents what works, flags what doesn't

**Outputs:** Workshop documentation as .txt files to Adam's #docudigest channel; refinement reports; toolkit tracking

---

## Workspace-Only Agents (Defined but NOT Registered as OpenClaw Agents)

These agents exist as workspace folders with identity files but have NOT been registered via `openclaw agents add`. They are concepts waiting to be activated.

| Agent | Role | Status |
|-------|------|--------|
| **Apollo** | Social Media Analytics (Instagram, TikTok, YouTube, Spotify daily) | Queued — awaiting API keys |
| **Buddha** | Thought Leadership — LinkedIn 3x/week, industry insights | Queued |
| **Hermes** | Collab Leads — weekly artist discovery + outreach templates | Queued |
| **Chronus** | Content Scheduler — optimal posting time recommendations | Queued (after Apollo) |
| **Hercules** | Fan Community Bot — Discord engagement, listening parties | Queued (after Apollo) |
| **Tesla** | Portfolio AI Agent — GitHub repos, case studies, live demos | Queued |
| **Beelzebub** | R&D Lab — LLM optimization, architecture evolution | Queued |
| **Zeus** | Insurance Analyzer — legacy system AI wrapper (AIM/Imageright/Titan) | Research phase only |
| **Hades** | Security Audit Agent | After core pantheon stable |
| **Shiva** | Trading Bot | Foundation only — no capital yet |
| **Qin Shi Huang** | Spending Tracker — cost monitoring across all agents | Planned |
| **Adam** | DocuDigest — knowledge capture, memory indexing to #docudigest | Planned |

**To activate any workspace agent:** Run `openclaw agents add <id> --profile odin`, add Discord bot token and binding to `openclaw.json`.

---

# 7. Tools + Integrations

## Discord (Primary Interface)

Discord is Odin's primary user interface. Odin, Loki, and Thor each have their own bot token and appear as separate Discord users.

### Discord Configuration

| Bot | Account ID | Channels | Policy |
|-----|-----------|----------|--------|
| @Odin | `default` | 9 channels | `allowlist`, no @mention required |
| @Loki | `loki` | #loki only | `allowlist`, no @mention required |
| @Thor | `thor` | #thor only | `allowlist`, no @mention required |

### Odin's Discord Channels

| Channel | ID | Purpose |
|---------|----|---------|
| #general | 1477047633251139617 | General chat |
| #odin-general | 1477459669239861380 | Primary Odin interaction |
| #projects | 1477459670095499518 | Project updates |
| #agents | 1477459670804205619 | Sub-agent activity logs |
| #usage-limits | 1477459671890526322 | Token + cost tracking |
| #cron-jobs | 1477459672851157074 | Cron execution logs |
| #status-heartbeat | 1477459673996198079 | Periodic heartbeat checks + alerts |
| #workshop | 1477459675082522790 | Experimental work |
| #docudigest | 1477459676026110075 | Knowledge capture |

### Critical Discord Technical Notes

- **Message Content Intent (privileged)** must be enabled in Discord Developer Portal → Bot → Privileged Gateway Intents
- **Discord IDs as strings:** IDs exceed JS safe integer range. Always use strings: `"583319870511513611"` not `583319870511513611` (integer loses precision to `...600`)
- **No per-channel routing to different agents** — OpenClaw 2026.3.2 bindings only match on `channel` (platform) + `accountId`, not individual channel IDs. To route to a different agent, use a different bot account.
- **Streaming:** Off for all Discord bots (`streaming: "off"`)
- **Direct Discord API posting (degraded mode):** `degraded-mode.mjs` bypasses OpenClaw entirely and posts to Discord via direct REST API using tokens extracted from `openclaw.json` at runtime

### Discord User

- **Bazzy (owner):** User ID `"583319870511513611"` — the only user in the `allowFrom` list for all bots
- **Guild:** `1477047631950643244` (slug: "odin")

## Telegram (Secondary Interface)

Telegram is used for critical alerts only — not for general conversation.

| Property | Value |
|----------|-------|
| Bot | @OdinClawV2bot |
| Bot token | `8138359481:AAFZO_dq71wwntBA79Bpe4yqJS3TnMv4MhI` |
| Chat ID | `1153171309` |
| Use cases | Usage window alerts (50/75/90/95%), mode transition alerts, budget cap alerts, critical errors |
| Policy | `pairing` DM, `allowlist` group |

## OpenClaw Browser

OpenClaw maintains a managed Chromium browser profile at `~/.openclaw-odin/browser/openclaw/user-data/`. This browser is available for web browsing tasks by agents. Not currently used by any active cron job or scheduled task.

## Cron/Task Scheduler

OpenClaw's built-in cron scheduler manages scheduled agent tasks. State at `~/.openclaw-odin/cron/jobs.json`. Jobs support:
- `every` (interval in ms)
- `cron` expression with timezone
- `sessionTarget: "isolated"` for fresh sessions per run

## File System Access

All agents have read/write access to their workspace directory. The filesystem IS the coordination layer between agents:
- One writer per file (no race conditions)
- Agents read each other's output files
- No inter-agent APIs

## External Scripts (Custom Layer)

| Script | Purpose | State File | Log File |
|--------|---------|-----------|---------|
| `task-classifier.mjs` | Routes tasks to capability buckets | None (in-memory + registry) | `classifier.log` |
| `prompt-cache.mjs` | LLM response caching with TTL | `prompt-cache.json` | `cache.log` |
| `request-circuit-breaker.mjs` | Per-caller and per-provider backoff | `request-state.json` | `request-circuit-breaker.log` |
| `groq-throttle.mjs` | Groq rate limiting + FIFO queue | `groq-throttle-state.json` | `groq-throttle.log` |
| `budget-controller.mjs` | Spend tracking, budget enforcement | `budget-state.json` | `budget.log` |
| `degraded-mode.mjs` | All-providers-down response handler | None (reads registry) | `degraded-mode.log` |
| `provider-health-monitor.mjs` | Routing mode manager, runs every 60s | `provider-registry.json` | `routing.log`, `provider-monitor.log` |
| `usage-monitor.mjs` | Claude.ai subscription usage tracking | `usage-monitor-state.json` | `usage-monitor.log` |

---

# 8. Memory Systems

Odin uses a **file-based memory architecture** — no vector stores, no embedding databases. Memory persists as structured Markdown files that agents read at session start.

## Memory Layers

### Layer 1: Identity Stack (per-agent, loaded every session)

Each agent reads these files at the start of every session:

| File | Purpose | Who Writes |
|------|---------|-----------|
| `SOUL.md` | Core personality, principles, routing rules, architecture | DevOps (Claude Code); Odin may evolve |
| `IDENTITY.md` | Quick reference: name, role, emoji, vibe | Created at agent setup |
| `USER.md` | Who Bazzy is, preferences, communication style | Odin + DevOps |
| `AGENTS.md` | Session startup instructions, memory loading protocol | DevOps + Odin |

### Layer 2: Long-Term Memory

| File | Purpose | Security |
|------|---------|---------|
| `workspace/MEMORY.md` | Curated long-term memory — projects, lessons, context | **Main session only** — never loaded in shared contexts |
| `workspace/agents/<name>/memory/YYYY-MM-DD.md` | Daily operational logs per agent | Agent-specific |
| `workspace/agents/<name>/MEMORY.md` | Agent-specific long-term memory | Agent reads in its own sessions |

### Layer 3: Shared Knowledge Files

| File | Writer | Readers |
|------|--------|--------|
| `workspace/shared-context/FEEDBACK-LOG.md` | Bazzy + Odin | All agents (universal corrections) |
| `workspace/shared-context/SIGNALS.md` | Odin | All agents (project status + trends) |
| `workspace/shared-context/THESIS.md` | Odin | All agents (Bazzy's worldview) |
| `workspace/intel/SOCIAL-METRICS.md` | Apollo | Chronus, Buddha, Hermes |
| `workspace/intel/THOUGHT-LEADERSHIP.md` | Buddha | Others |
| `workspace/intel/COLLAB-LEADS.md` | Hermes | Others |

**Coordination rule:** One writer per file. Other agents read. No conflict.

### Layer 4: Cached Responses

| File | Purpose |
|------|---------|
| `scripts/prompt-cache.json` | Persistent prompt-response cache, max 500 entries, 24hr hard cap |

Cache policy by bucket:
- `no_llm` → BYPASS
- `utility_local` → 5 min TTL
- `cheap_routine` → 4 hour TTL
- `standard_agent` → 1 hour TTL (high-repetition prompts only)
- `premium` → BYPASS (unless `[cacheable]` marker present)

Always bypass: debug tasks, realtime requests, health probes, `[no-cache]` / `[force-refresh]` markers.

### Layer 5: Operational State Files

These are not "memory" in the human sense, but they persist state across daemon restarts:

| File | Contents |
|------|---------|
| `scripts/provider-registry.json` | Live provider scores, routing mode, recommendations, embedded snapshots |
| `scripts/request-state.json` | Circuit breaker backoff state per caller and per provider |
| `scripts/budget-state.json` | Daily/monthly spend per bucket/model + Groq-specific caps |
| `scripts/groq-throttle-state.json` | Inference timestamps, queue, cumulative throttle stats |
| `scripts/usage-monitor-state.json` | Last alerted threshold per window (prevents duplicate alerts) |
| `~/.openclaw-odin/cron/jobs.json` | Cron job definitions + run history + consecutive error counts |

### Memory Retrieval

Agents do not do semantic search. They read files at session start with `Read` tool calls. MEMORY.md is the authoritative source of truth that gets manually curated over time.

The `usage-monitor.mjs` script reads live usage data from claude.ai (web scraping or API) every 30 minutes.

### Memory Writing

- Agents write daily session logs to `memory/YYYY-MM-DD.md`
- MEMORY.md is updated by Odin when significant context changes (projects, lessons, architecture)
- SOUL.md can be updated by Odin when its understanding of the system evolves (Odin notifies Bazzy when it does)
- State files are written atomically by scripts to avoid daemon conflicts

---

# 9. Safety + Deterministic Controls

## Defense-in-Depth Architecture

Every request passes through multiple independent safety layers before reaching a provider:

```
Request
  │
  ▼ [1] Circuit Breaker Gate
  │     Block if caller in backoff? → YES: exit 0, no provider call
  │     NO: continue
  │
  ▼ [2] Degraded-Mode Check
  │     All cloud providers failed? → YES: deterministic response, no LLM
  │     NO: continue
  │
  ▼ [3] Groq Throttle (groq_fallback mode only)
  │     Rate window exceeded? → YES: queue + circuit SUCCESS + exit 0
  │     NO: continue
  │
  ▼ [4] Task Classification
  │     Classify to bucket → no_llm? handle deterministically
  │     Other bucket: continue
  │
  ▼ [5] Cache Check
  │     Cache hit? → YES: return cached result, skip LLM
  │     NO: continue
  │
  ▼ [6] Budget Check
  │     Over hard limit? → demote tier, not provider
  │     Groq budget exceeded? → groqUp = false
  │     Continue
  │
  ▼ [7] Provider Selection (via provider-registry.json recommendations)
  │     Pick model per bucket and current mode
  │
  ▼ [8] Single-pass provider chain (Anthropic → Groq → Ollama)
  │     Each provider tried AT MOST ONCE
  │     All fail? → exit 1, circuit FAILURE
  │
  ▼ [9] Outcome Recording
        node request-circuit-breaker.mjs complete <id> success|failure
```

## Circuit Breaker

**Problem solved:** Without the circuit breaker, a single failing request traverses the entire provider chain (Groq 8b → 70b → 120b → Ollama), burning rate limits. The next cron run (30 min later) repeats this, creating a rate-limit storm.

**Backoff schedule (per caller):**

| Consecutive failures | Backoff |
|---------------------|---------|
| 1 | 2 min |
| 2 | 4 min |
| 3 | 8 min |
| 4 | 16 min |
| 5 | 32 min ← blocks one heartbeat window |
| 6 | 64 min ← blocks two windows |
| 7+ | 60 min cap |

**Per-provider backoff (independent):** Base 30s; max 5 min; formula: `30s × 2^(n-1)`. Updated by health monitor log scans.

## Degraded-Mode Handler

**What it prevents:** The user ever seeing "All models failed" or getting no response.

**Detection:**
- Hard: `provider-registry.json mode = safe_mode` (both Anthropic + Groq in cooldown)
- Soft: `cron/jobs.json` Odin Heartbeat `consecutiveErrors ≥ 3` with "All models failed" in `lastError`

**Response priority (stops at first match):**
1. **Deterministic reply** — reads live data from `provider-registry.json` + `cron/jobs.json`, builds structured Discord message. Zero LLM calls.
2. **Cache hit** — `prompt-cache.json` entry ≤ 30 min old with ≥ 70% prompt similarity
3. **Fallback notice** — structured message: "providers temporarily rate-limited, Odin still online, retry shortly"

**Deterministic patterns handled without LLM:**
- Heartbeat checks: "heartbeat", "Read HEARTBEAT.md"
- Health queries: "health check", "are you online", "status", "uptime"
- Provider state: "what provider", "which model", "groq", "anthropic", "check cron"
- Cron queries: "cron list", "cron status", "job status"

**Posts directly to Discord via REST API** — bypasses OpenClaw entirely. No LLM, no gateway needed.

## Cost Protection

| Layer | Protection |
|-------|-----------|
| Task classifier `no_llm` bucket | Zero LLM calls for deterministic tasks |
| Prompt cache | Avoids redundant LLM calls (4hr cache for routines) |
| Budget soft limit ($1/day, $20/mo) | Prefer cheaper model within tier |
| Budget hard limit ($1.50/day, $30/mo) | Block premium; demote standard → cheap |
| Budget critical ($2/day, $40/mo) | Telegram alert |
| Groq daily cap ($1.50) | Disable Groq until midnight |
| Groq monthly cap ($30) | Disable Groq for rest of month |
| Qwen exclusion | Prevents slow, high-resource local model waste |
| Single-pass enforcement | Prevents multi-provider retry storms |

## Alerting Systems

| Trigger | Alert Channel | Deduplication |
|---------|--------------|---------------|
| Anthropic usage at 50/75/90/95% | Telegram | `usage-monitor-state.json` per threshold |
| Routing mode changes | Telegram + Discord #status-heartbeat | Immediate |
| `safe_mode` activation | Telegram + Discord #status-heartbeat | Per event |
| Groq budget cap hit | Telegram + Discord #status-heartbeat | 30 min (`reg.groqBudgetAlertedAt`) |
| Budget hard/critical threshold | Telegram | Once per day |
| Soft-degraded detection | Discord #status-heartbeat | 30 min (`reg.softDegradedAlertedAt`) |

## Provider Outage Handling

1. Health monitor detects Anthropic errors in logs → score drops
2. At threshold → mode switches to `groq_fallback` → `openclaw.json` updated
3. Gateway restarts (debounced, max 1/3 min) to pick up new config
4. Groq becomes primary provider
5. If Groq also fails/quota-hit → `safe_mode` → degraded-mode handler activates
6. On Anthropic recovery → score climbs back → mode switches back to `normal`
7. Full self-healing cycle without any manual intervention

---

# 10. Known Limitations

## RAM Constraints

| Resource | Value | Implication |
|----------|-------|-------------|
| Total RAM | 16 GB | Adequate for current workload |
| Ollama (llama3.2:3b) | ~2 GB | Safe headroom |
| RAM gate | 512 MB free threshold | Ollama disabled below this |
| Qwen3.5:9b | 6.6 GB | Would consume 40% of RAM — excluded from routing |
| Growth risk | Medium | Activating multiple heavy agents simultaneously could pressure RAM |

## Model Latency

| Provider | Typical latency | Notes |
|----------|----------------|-------|
| Anthropic Haiku | ~1-3s | Fastest for routine tasks |
| Groq 8b | ~0.5-2s | Very fast, free tier |
| Groq 70b | ~2-5s | Slightly slower |
| Ollama llama3.2:3b | ~3-10s on M4 | Local, no network latency |
| Qwen3.5:9b | ~45-90s | Excluded — too slow for live use |

## OpenClaw Architectural Constraints

- **No plugin hooks into LLM call chain** — all safety/routing logic is external script-based; cannot intercept at the model call level
- **No per-channel routing to different agents** — OpenClaw 2026.3.2 bindings only match on `channel + accountId`, not individual channel IDs. Multi-agent routing requires multiple bot accounts.
- **Session context limits** — OpenClaw sessions have a context window; compaction mode set to `safeguard`
- **Gateway restart required on routing mode changes** — `openclaw.json` changes need a gateway restart to take effect; debounced at max 1/3 min

## Subscription Window Constraints

- **5-hour window:** Heavy usage can exhaust a session window, triggering Groq fallback mid-day
- **7-day window:** Very heavy week could approach weekly limit
- **Recovery:** Automatic — windows reset on schedule; usage monitor tracks and alerts

## Reliability Concerns

- **All three enabled cron jobs currently failing** (as of validation 2026-03-08) — Anthropic window exhaustion cascaded to Groq rate limits during recovery. Circuit breakers have expired; self-healing in progress.
- **Ollama `rate_limit` errors** — Ollama returned rate_limit errors during the outage. This is unexpected for a local model and may indicate the OpenClaw gateway was passing Ollama through a rate-limited proxy path.
- **Single machine** — No redundancy. Mac Mini goes down = Odin goes offline.
- **Residential internet** — Outage = Odin offline.
- **No HTTPS on gateway** — Gateway is localhost-only; acceptable for single-machine use.

## Cost Bottlenecks

- Current Anthropic spend: ~$0.0009/month (essentially nothing)
- Budget caps are very conservative ($1.50/day, $30/month for Groq) — highly unlikely to be hit at current volumes
- Primary cost risk: future agents making high-volume expensive calls (Opus, premium bucket)

## Scaling Limits

- Vertical scaling limit: 16 GB RAM, M4 CPU. Adding many local models simultaneously will compete for RAM.
- Horizontal scaling: Not implemented. OpenClaw runs on one machine.
- Agent count: Currently 3 real agents. Pantheon has 14 planned. Each adds Discord bot + workspace overhead but minimal compute unless actively triggered.

---

# 11. Planned Features

## Near-Term Agent Activations (Queued — Waiting for APIs)

| Agent | Blocking Dependency | What It Provides |
|-------|-------------------|-----------------|
| **Apollo** | YouTube + Spotify + Instagram + TikTok API keys | Daily social analytics dashboard |
| **Buddha** | LinkedIn API or manual posting workflow | 3x/week thought leadership posts |
| **Hermes** | Platform APIs | Weekly trending artist discovery + collab templates |
| **Chronus** | After Apollo MVP | Optimal content posting time recommendations |
| **Hercules** | After Apollo MVP | Discord fan community engagement bot |
| **Adam** | Architecture decision | DocuDigest: knowledge capture → #docudigest channel |

## Infrastructure Improvements

- **Agent self-creation** — Odin has `AGENT-CREATION-GUIDE.md` and should be capable of registering new agents himself without Claude Code intervention. Not yet demonstrated in production.
- **Shared context pipeline** — Apollo publishes to `intel/SOCIAL-METRICS.md`; Chronus, Buddha, Hermes read it. Pipeline is designed but no writers are active yet.
- **Per-agent budget tracking** — Current budget controller tracks by bucket/model. Future: per-agent attribution.
- **Prompt fingerprinting for Anthropic cache_control** — `fingerprintPromptBlocks()` is implemented in task-classifier.mjs but not yet wired to actual Anthropic API prompt caching.
- **Async queue for Qwen** — If batch/offline use case emerges, Qwen3.5:9b could be re-introduced for non-latency-sensitive tasks only.
- **Groq burst recovery** — Current queue is FIFO with 5-min max age. Future: priority queue that preserves most recent heartbeat over stale ones.

## Application-Level Features

- **Artist Toolkit SaaS** — Analytics dashboard for music artists. Planned revenue model: freemium ($10-20/mo), white-label for studios.
- **Insurance Legacy Wrapper** — AI layer over AIM/Imageright/Titan. Natural language policy search. Status: research phase, security vetting pending.
- **AI Agent Portfolio Site** — GitHub repos, case studies, live demos. After insurance + toolkit reach beta.
- **Workshop Curriculum** — Music production + AI agent building workshops (Thor's domain).
- **Trading Bot (Shiva)** — Foundation only. No capital. On hold indefinitely.
- **Security Audit Agent (Hades)** — Activated after core pantheon is stable.

---

# 12. Directory Structure

```
~/.openclaw-odin/
├── openclaw.json                    # Master config: agents, channels, auth, bindings, gateway
│
├── agents/                          # OpenClaw agent runtime directories (registered agents only)
│   ├── main/                        # Odin (main agent)
│   │   ├── agent/
│   │   │   ├── auth-profiles.json   # Provider auth tokens (anthropic, groq, ollama)
│   │   │   └── models.json          # Allowed model definitions for this agent
│   │   └── sessions/                # Session JSONL files (compacted/archived regularly)
│   │       └── sessions.json        # Active session registry
│   ├── loki/                        # Loki (heartbeat monitor)
│   │   ├── agent/
│   │   │   ├── auth-profiles.json
│   │   │   └── models.json          # ollama:llama3.2:3b only
│   │   └── sessions/
│   └── thor/                        # Thor (production systems agent)
│       ├── agent/
│       │   ├── auth-profiles.json
│       │   └── models.json
│       └── sessions/
│
├── workspace/                       # Odin's primary workspace (memory, identity, docs)
│   ├── SOUL.md                      # Who Odin is + full routing/architecture reference
│   ├── IDENTITY.md                  # Quick reference: name, role, vibe
│   ├── USER.md                      # Who Bazzy is
│   ├── AGENTS.md                    # Session startup protocol
│   ├── MEMORY.md                    # Long-term curated memory (main session only)
│   ├── TOOLS.md                     # Environment-specific tool notes
│   ├── HEARTBEAT.md                 # Heartbeat check instructions (Odin's cron)
│   ├── BOOTSTRAP.md                 # (deleted after first run)
│   ├── ONTOLOGY.md                  # Conceptual map of the system
│   ├── AGENT-CREATION-GUIDE.md      # Odin's playbook for creating new agents
│   ├── AGENTS.md                    # Agent roster and coordination rules
│   │
│   ├── memory/                      # Odin's daily session logs
│   │   └── YYYY-MM-DD.md
│   │
│   ├── shared-context/              # Cross-agent shared knowledge
│   │   ├── FEEDBACK-LOG.md          # Universal corrections (read by all agents)
│   │   ├── SIGNALS.md               # Project status + trends
│   │   └── THESIS.md                # Bazzy's worldview
│   │
│   ├── intel/                       # Agent output files (one writer each)
│   │   ├── SOCIAL-METRICS.md        # Apollo's daily output
│   │   ├── THOUGHT-LEADERSHIP.md    # Buddha's posts
│   │   └── COLLAB-LEADS.md          # Hermes's opportunities
│   │
│   └── agents/                      # Per-agent workspace directories
│       ├── loki/
│       │   ├── SOUL.md              # Loki's identity
│       │   ├── IDENTITY.md
│       │   ├── USER.md
│       │   ├── AGENTS.md            # Loki's session protocol
│       │   ├── MEMORY.md
│       │   ├── TOOLS.md
│       │   ├── HEARTBEAT.md         # Loki's heartbeat instructions
│       │   ├── LOKI-ACTIVATION.md   # How Loki was created
│       │   ├── trigger-heartbeat.sh # Main safety trigger script
│       │   ├── check-status.sh      # launchd + log status checker
│       │   ├── cron/
│       │   │   └── jobs.json        # (if Loki had its own cron jobs)
│       │   └── memory/
│       │       └── YYYY-MM-DD.md
│       ├── thor/
│       │   ├── SOUL.md
│       │   ├── IDENTITY.md
│       │   ├── USER.md
│       │   ├── AGENTS.md
│       │   ├── MEMORY.md
│       │   ├── TOOLS.md
│       │   ├── HEARTBEAT.md
│       │   ├── WORKSHOP-PROTOCOL.md # Thor's workflow guide
│       │   ├── THOR-SYSTEM-REVIEW.md
│       │   └── memory/
│       │       └── YYYY-MM-DD.md
│       ├── adam/                    # Workspace only — not registered
│       ├── apollo/                  # Workspace only — not registered
│       ├── beelzebub/               # Workspace only
│       ├── buddha/                  # Workspace only
│       ├── chronus/                 # Workspace only
│       ├── hades/                   # Workspace only
│       ├── hercules/                # Workspace only
│       ├── hermes/                  # Workspace only
│       ├── qin/                     # Workspace only
│       ├── sasaki/                  # Workspace only (absorbed into Thor)
│       ├── shiva/                   # Workspace only
│       ├── tesla/                   # Workspace only
│       └── zeus/                    # Workspace only
│
├── scripts/                         # Custom control layer (all external to OpenClaw)
│   ├── task-classifier.mjs          # Routes tasks to capability buckets
│   ├── prompt-cache.mjs             # LLM response caching with TTL per bucket
│   ├── request-circuit-breaker.mjs  # Per-caller + per-provider backoff/gating
│   ├── groq-throttle.mjs            # Groq sliding window rate limiter + FIFO queue
│   ├── budget-controller.mjs        # Cost tracking, soft/hard limits, Groq caps
│   ├── degraded-mode.mjs            # All-cloud-down handler (deterministic responses)
│   ├── provider-health-monitor.mjs  # 60s routing mode manager (LaunchAgent)
│   ├── usage-monitor.mjs            # claude.ai subscription window tracker (30min)
│   │
│   ├── provider-registry.json       # Live state: scores, mode, recommendations
│   ├── request-state.json           # Circuit breaker backoff state
│   ├── budget-state.json            # Daily/monthly spend + Groq caps
│   ├── groq-throttle-state.json     # Inference timestamps, queue, stats
│   ├── prompt-cache.json            # Cached prompt-response pairs (max 500)
│   ├── usage-monitor-state.json     # Alert dedup state (per threshold)
│   │
│   ├── routing.log                  # Mode transitions, provider changes
│   ├── provider-monitor.log         # Health monitor run log
│   ├── classifier.log               # Task classification decisions
│   ├── cache.log                    # Cache hits/misses/stores
│   ├── budget.log                   # Budget checks, demotions, alerts
│   ├── request-circuit-breaker.log  # Gate checks, backoffs, failures
│   ├── groq-throttle.log            # Throttle events, queue operations
│   └── degraded-mode.log            # Degraded activations, response methods
│
├── cron/
│   └── jobs.json                    # Cron job definitions + run state
│
└── browser/
    └── openclaw/
        └── user-data/               # Managed Chromium profile (for browser tasks)

~/Library/LaunchAgents/
├── ai.openclaw.odin.plist           # OpenClaw gateway (persistent, KeepAlive)
├── ai.openclaw.odin.provider-monitor.plist  # Health monitor (every 60s)
├── ai.openclaw.odin.usage-monitor.plist     # Usage monitor (every 30min)
├── ai.openclaw.loki-heartbeat.plist         # Loki trigger (every 30min)
└── ai.openclaw.gateway.plist                # Gateway variant plist
```

---

---

# ODIN_BOOT_SEQUENCE.md

_What happens when the Mac Mini starts up or after a reboot._

## Boot Order

### Phase 1: macOS Startup
macOS loads LaunchAgents from `~/Library/LaunchAgents/` automatically for the logged-in user session. No manual intervention required.

### Phase 2: OpenClaw Gateway (first to start)
**Plist:** `ai.openclaw.odin.plist` (KeepAlive: true)

1. LaunchAgent loads `openclaw.json` from `OPENCLAW_CONFIG_PATH`
2. OpenClaw gateway starts on port 18789
3. Reads agent list (`main`, `loki`, `thor`)
4. Connects Discord bots (@Odin, @Loki, @Thor) to Discord gateway
5. Connects Telegram bot
6. Loads cron scheduler — reads `cron/jobs.json`, schedules pending jobs
7. Gateway is now live — messages can be received, cron jobs will fire on schedule

**Startup complete signal:** `curl -H "Authorization: Bearer <token>" http://127.0.0.1:18789/health` returns 200

**If gateway fails to start:** LaunchAgent retries automatically (KeepAlive). Check logs at `/tmp/openclaw/openclaw-*.log`.

### Phase 3: Provider Health Monitor (starts within seconds)
**Plist:** `ai.openclaw.odin.provider-monitor.plist` (StartInterval: 60)

First run on boot:
1. Reads `provider-registry.json` to get last known state
2. Scans recent log files for Anthropic errors
3. HTTP-probes Groq (`GET /openai/v1/models`)
4. Computes initial provider scores
5. Determines routing mode (`normal` / `groq_fallback` / `safe_mode`)
6. Writes updated `provider-registry.json` with current recommendations
7. If mode changed from last known → updates `openclaw.json` → triggers gateway restart

**On first boot after extended downtime:** Provider scores may be stale. Health monitor starts fresh with healthy baseline and adjusts based on actual probe results within first 60 seconds.

### Phase 4: Usage Monitor (starts within seconds)
**Plist:** `ai.openclaw.odin.usage-monitor.plist` (StartInterval: 1800)

First run on boot:
1. Reads `usage-monitor-state.json` (previous alert thresholds)
2. Fetches usage data from claude.ai
3. If usage > any threshold not yet alerted → sends Telegram alert
4. Saves updated state

### Phase 5: Loki Heartbeat Trigger (first run at boot, then every 30 min)
**Plist:** `ai.openclaw.loki-heartbeat.plist` (StartInterval: 1800)

First run on boot:
1. Executes `trigger-heartbeat.sh`
2. Step 1: Checks circuit breaker state — if fresh boot, no backoff, passes
3. Step 2: Checks degraded mode — if `provider-registry.json` shows safe_mode, handle deterministically
4. Step 3a: If `groq_fallback` mode, process throttle queue (likely empty on fresh boot)
5. Step 4: Invokes openclaw → routes to Loki agent
6. Loki reads HEARTBEAT.md, checks cron job states, posts status to #loki
7. Step 5: Records outcome in circuit breaker state

### Phase 6: Cron Jobs Fire On Schedule
OpenClaw's internal scheduler fires cron jobs per their configured times. The gateway must be fully started (Phase 2) before any cron job can execute.

## Failure Recovery During Startup

| Failure | Recovery Mechanism |
|---------|-------------------|
| Gateway fails to start | KeepAlive in plist — launchd restarts automatically |
| Health monitor crashes | LaunchAgent restarts on next 60s interval |
| Usage monitor crashes | LaunchAgent restarts on next 30min interval |
| Loki trigger crashes | LaunchAgent restarts on next 30min interval |
| Anthropic unreachable at boot | Health monitor detects → groq_fallback mode activated |
| Groq unreachable at boot | Health monitor probe fails → score drops; if both down → safe_mode |
| All providers down at boot | safe_mode → degraded-mode handler serves all heartbeat requests |

## Manual Restart Commands

```bash
# Restart gateway
launchctl unload ~/Library/LaunchAgents/ai.openclaw.odin.plist
sleep 2
launchctl load ~/Library/LaunchAgents/ai.openclaw.odin.plist

# Restart health monitor
launchctl unload ~/Library/LaunchAgents/ai.openclaw.odin.provider-monitor.plist
launchctl load ~/Library/LaunchAgents/ai.openclaw.odin.provider-monitor.plist

# Force Loki heartbeat now
launchctl unload ~/Library/LaunchAgents/ai.openclaw.loki-heartbeat.plist
launchctl load ~/Library/LaunchAgents/ai.openclaw.loki-heartbeat.plist

# Check gateway health
curl -s -H "Authorization: Bearer 1b10607665b5a745cd27b22a77fa7957a2e5b297452c8e39" http://127.0.0.1:18789/health
```

---

---

# ODIN_RUNTIME_FLOW.md

_The complete lifecycle of a request from input to output._

## Flow A: Discord Message to Odin

```
Bazzy types in #odin-general
         │
         ▼
Discord gateway → OpenClaw gateway (port 18789)
         │  [auth: allowFrom check — user must be "583319870511513611"]
         │  [policy: allowlist mode — channel must be in allowed list]
         ▼
OpenClaw routes to "main" agent (default account → main binding)
         │
         ▼
OpenClaw loads session (or creates new isolated one)
         │  [reads workspace/SOUL.md, workspace/IDENTITY.md, workspace/USER.md]
         │  [reads workspace/AGENTS.md for startup protocol]
         │  [reads workspace/MEMORY.md if main session]
         ▼
Odin processes the message
         │
         ├─ [no_llm task?] → Odin handles deterministically (file reads, tool calls, config queries)
         │                   → Writes response to session, OpenClaw posts to Discord
         │
         └─ [LLM task?] → Task classifier determines bucket
                          → Cache check (prompt-cache.mjs)
                          │  [cache hit? → return cached result]
                          │  [cache miss? → continue]
                          → Budget check (budget-controller.mjs)
                          │  [adjust tier if pressure?]
                          → Provider selection (from provider-registry.json recommendations)
                          → OpenClaw calls provider API (Anthropic, Groq, or Ollama)
                          → If provider fails → single-pass fallback → next in chain
                          → Response returned to Odin
                          → Cache store (if eligible bucket + not realtime)
                          → Odin writes response
                          → OpenClaw posts to Discord
```

## Flow B: Loki Scheduled Heartbeat (every 30 min)

```
launchd fires at T+1800s
         │
         ▼
trigger-heartbeat.sh executes
         │
         ├─ [Step 1] node request-circuit-breaker.mjs gate loki-heartbeat utility_local
         │    └─ BLOCKED? → log + exit 0 ─────────────────────────────────────── END
         │    └─ OPEN? → requestId captured, continue
         │
         ├─ [Step 2] node degraded-mode.mjs check
         │    └─ DEGRADED? → node degraded-mode.mjs handle-heartbeat
         │         ├─ Is it a deterministic query? → build live status from registry/jobs.json
         │         ├─ Cache hit? → return cached response
         │         └─ Fallback notice → post to #loki via Discord REST API
         │         → exit 0 ──────────────────────────────────────────────────── END
         │    └─ NOT DEGRADED? → continue
         │
         ├─ [Step 3a, if groq_fallback mode]
         │    node groq-throttle.mjs process-queue → drain any deferred items
         │    node groq-throttle.mjs acquire loki-heartbeat heartbeat-trigger
         │    └─ THROTTLED? → enqueue + circuit SUCCESS + exit 0 ──────────────── END
         │    └─ ACQUIRED? → continue
         │
         ├─ [Step 4] openclaw --profile odin [loki heartbeat payload]
         │    └─ OpenClaw routes to loki agent
         │    └─ Loki reads HEARTBEAT.md
         │    └─ Queries cron list (dynamic, auto-discovers all jobs)
         │    └─ Checks job statuses, consecutive errors, last run times
         │    └─ Posts status report to #loki via OpenClaw → Discord
         │    └─ exit 0 (success) or exit 1 (failure)
         │
         └─ [Step 5] node request-circuit-breaker.mjs complete <requestId> success|failure
              └─ SUCCESS → provider backoff reset if applicable
              └─ FAILURE → caller backoff applied, consecutive failure count incremented
```

## Flow C: Health Monitor Cycle (every 60s)

```
launchd fires provider-health-monitor.mjs
         │
         ▼
Read current provider-registry.json
         │
         ▼
Scan log files for Anthropic errors (429, 5xx, overloaded, rate_limit)
         │
         ▼
HTTP probe Groq: GET /openai/v1/models (NOT an inference call)
         │
         ▼
Check RAM availability (sysctl or /proc/meminfo equivalent)
         │
         ▼
Check Groq budget: checkGroqBudget() → disabled?
         │
         ▼
Compute provider scores (score adjustment per log event, probe result)
         │
         ▼
determineMode(registry, ram, groqBudgetState)
  anthropicUp = state ≠ 'cooldown' && score > SCORE_DEGRADED
  groqProbeUp = state ≠ 'cooldown' && score > SCORE_DEGRADED
  groqBudgetOk = !groqBudgetState?.disabled
  groqUp = groqProbeUp && groqBudgetOk
  ─────────────────────────────
  normal        = anthropicUp
  groq_fallback = !anthropicUp && groqUp
  safe_mode     = !anthropicUp && !groqUp
         │
         ▼
Build task recommendations per bucket per mode
         │
         ▼
Process Groq throttle queue: processGroqQueue()
         │
         ▼
Embed snapshots into registry (groqThrottle, groqBudget, budget, requestCircuitBreaker)
         │
         ▼
Write provider-registry.json (atomic)
         │
         ▼
If mode changed:
  ├─ Update openclaw.json model chain
  ├─ Restart gateway (debounced, max 1/3 min)
  ├─ Send Telegram alert
  └─ Post Discord alert to #status-heartbeat
         │
         ▼
Check for soft-degraded conditions:
  cron jobs consecutiveErrors ≥ 3 with "All models failed"?
  └─ Post Discord alert (deduped 30 min)
         │
         ▼
Check groq budget cap → alert if just disabled (deduped 30 min)
         │
         ▼
Log run summary (mode, scores, budget, throttle state)
```

## Flow D: Cron Job Execution (Odin's scheduled jobs)

```
OpenClaw cron scheduler fires at scheduled time
         │
         ▼
Creates isolated session for the agent (main/loki/thor)
         │
         ▼
Injects job payload message (e.g., "Read HEARTBEAT.md. Perform all checks...")
         │
         ▼
Model selection: uses job-level model override if set; else default chain
         │
         ▼
Agent executes task:
  ├─ Reads workspace files (identity stack)
  ├─ Executes instructions (file reads, tool calls, LLM reasoning)
  ├─ Produces output
  └─ If delivery.mode = "announce": posts to specified Discord channel
         │
         ▼
Job state updated in cron/jobs.json:
  ├─ lastRunAtMs, lastStatus, lastDurationMs
  ├─ consecutiveErrors (incremented on failure, reset on success)
  └─ nextRunAtMs (computed from schedule)
```

---

---

# ODIN_DESIGN_PHILOSOPHY.md

_The guiding principles behind every architectural decision in Odin._

## Principle 1: Cost Efficiency First

**Statement:** Every decision should minimize cost without sacrificing reliability.

**Why it exists:** Bazzy is an individual running this on a personal machine with a personal budget. There is no enterprise cloud budget. Every dollar spent on AI inference must deliver real value.

**How it's implemented:**
- Task classifier routes cheapest capable model — Haiku handles 80%+ of tasks
- `no_llm` bucket eliminates LLM calls entirely for deterministic tasks
- Prompt cache (4-hour TTL for routines) avoids paying for the same response twice
- Ollama (local, $0) handles heartbeat/relay tasks
- Groq ($0.05/1M tokens) handles burst fallback
- Budget caps prevent runaway spend even during outages
- Qwen excluded not because it's bad — because slow response time has a cost too (user waiting)

**Tradeoff accepted:** Occasional under-routing risk (task is slightly too complex for assigned model). Mitigated by the 70% confidence threshold rule (ambiguous tasks get promoted, not demoted).

---

## Principle 2: Always-On Availability

**Statement:** Odin must always respond to the user — even when every cloud provider is down.

**Why it exists:** If Odin simply crashes with "All models failed" every time Anthropic hits a rate limit, it's unreliable. An unreliable system that needs constant babysitting is worse than no system at all.

**How it's implemented:**
- Degraded-mode handler guarantees a response even when all providers fail
- Deterministic replies for status/health/heartbeat queries need zero LLM calls
- Cache layer provides recent responses when providers are unavailable
- Loki uses Ollama (local, always available) for heartbeat — never dependent on cloud
- 4 LaunchAgents with KeepAlive: true — processes restart automatically
- Circuit breaker prevents failure storms that make outages worse

**Tradeoff accepted:** In true safe_mode, responses are canned/cached. Quality degrades but presence is maintained.

---

## Principle 3: Deterministic Before Probabilistic

**Statement:** If a task can be completed without an LLM, it must be.

**Why it exists:** LLMs are expensive, slow, and non-deterministic. For tasks with known correct answers (routing decisions, config reads, health checks), using an LLM is wasteful and introduces unnecessary variance.

**How it's implemented:**
- `no_llm` bucket routes ~20-30% of tasks to zero-LLM handlers
- Health monitor is a pure Node.js script — never calls an LLM to decide routing
- Budget controller, circuit breaker, throttle, cache — all deterministic scripts
- Degraded-mode handler builds status reports from live JSON data, not LLM synthesis

**Tradeoff accepted:** More upfront engineering to build deterministic handlers. Pays off in reliability and cost.

---

## Principle 4: External Architecture, Not Internal Hooks

**Statement:** Safety and routing logic lives outside OpenClaw, not inside it.

**Why it exists:** OpenClaw has no plugin API into its LLM call chain. We cannot intercept at the model-call level. Rather than fight the platform, we build an external control layer (shell scripts + Node.js) that gates, modifies, and monitors everything before OpenClaw touches it.

**How it's implemented:**
- `trigger-heartbeat.sh` is a standalone bash script that controls the entire heartbeat pipeline
- Health monitor modifies `openclaw.json` to change routing — OpenClaw reads the config, doesn't own the routing logic
- All custom scripts are self-contained `.mjs` modules with their own state files
- No modifications to OpenClaw source code — upgrades don't break the custom layer

**Tradeoff accepted:** Slightly more complex architecture. The custom layer and OpenClaw are loosely coupled, which is a feature: either can be replaced independently.

---

## Principle 5: Escalation Only When Justified

**Statement:** Never use a more capable model unless the task genuinely requires it.

**Why it exists:** Opus costs 19× more than Haiku. Using Opus for a status check is wasteful. But using Haiku for architectural design produces low-quality output. The classifier exists to find the right level automatically.

**How it's implemented:**
- Five capability tiers: no_llm → utility_local → cheap_routine → standard_agent → premium
- Classification factors: complexity, stakes, multi-step reasoning, tool usage, prompt size, downstream impact
- 70% confidence rule: ambiguous tasks are promoted (never demoted)
- Budget pressure demotes capability tier — but the demotion is bounded. `cheap_routine` is never demoted. Premium and standard may route to cheaper equivalents.
- Provider fallback ≠ capability escalation: when Anthropic goes down, Groq provides equivalent capability at the same tier (8b → low, 70b → medium, 120b → high)

**Tradeoff accepted:** Classification is imperfect. Some tasks will be over- or under-routed. The 70% threshold reduces the risk of systematic under-routing.

---

## Principle 6: File-Based Coordination

**Statement:** Agents coordinate through the filesystem, not APIs.

**Why it exists:** Direct agent-to-agent API calls create tight coupling, require both agents to be online simultaneously, and add orchestration complexity. File-based coordination is simpler, more resilient, and naturally serialized.

**How it's implemented:**
- One writer per file — Apollo writes `intel/SOCIAL-METRICS.md`, others read it
- Scheduling creates natural data flow: Apollo at 8AM → feeds Chronus, Buddha, Hermes later
- No inter-agent network calls
- Failures are isolated: if Apollo fails, other agents can still run with last known data

**Tradeoff accepted:** Eventual consistency (agents read data from the last writer's run, not real-time). Acceptable for all current use cases.

---

## Principle 7: Self-Healing Over Manual Intervention

**Statement:** The system should detect and recover from failures without requiring human action.

**Why it exists:** Bazzy can't babysit the system 24/7. Odin runs overnight, on weekends, whenever. If every Anthropic hiccup required manual `launchctl` intervention, the system would be a burden, not an asset.

**How it's implemented:**
- Health monitor detects provider failures and switches routing mode automatically
- Gateway restarts automatically when mode changes
- LaunchAgents restart daemons when they crash
- Circuit breaker backoff expires automatically — no manual reset needed for normal recovery
- Groq daily budget cap resets automatically at midnight UTC
- Usage windows reset automatically (Anthropic subscription cycle)

**Manual intervention** is only needed for: actual code bugs, new agent registration, API key rotation, config changes.

---

# ODIN_LIMITS.md

_Hard constraints and resource budgets that govern all architecture decisions._

## RAM Budget

| Allocation | Size | Notes |
|-----------|------|-------|
| Total RAM | 16 GB | Apple M4 unified memory |
| macOS baseline | ~3-4 GB | System, Finder, basic processes |
| OpenClaw gateway | ~200-400 MB | Node.js process |
| Ollama service | ~500 MB | Base; +model RAM when active |
| Ollama llama3.2:3b (active) | ~2 GB | When loaded for inference |
| Custom scripts (node) | ~50-100 MB each | Short-lived |
| **Available headroom** | ~8-9 GB | Under normal operation |
| **RAM gate threshold** | 512 MB free | Ollama disabled below this |

**Scaling risk:** Activating multiple large local models simultaneously would consume headroom. Qwen3.5:9b (6.6GB) + llama3.2:3b (2GB) = 8.6GB just for models, leaving little for everything else. This is why Qwen is excluded.

## CPU Considerations

| Task | CPU Impact |
|------|-----------|
| Ollama inference (llama3.2:3b) | Moderate — M4 Neural Engine handles well |
| Ollama inference (qwen3.5:9b) | High — 60-90s per inference; excluded |
| Node.js scripts | Negligible — fast, short-lived |
| OpenClaw gateway | Low — event-driven, mostly I/O wait |
| Multiple simultaneous agents | Low-moderate — agents are mostly waiting on I/O/LLM |

M4's Neural Engine provides significant acceleration for local model inference. The system is not CPU-bound at current workloads.

## Network Dependencies

| Dependency | Failure Impact |
|-----------|---------------|
| Anthropic API (cloud) | Triggers groq_fallback mode |
| Groq API (cloud) | If also down with Anthropic → safe_mode |
| Discord gateway (cloud) | Bot goes offline — no messages received or sent |
| Telegram API (cloud) | Alerts stop — no other functional impact |
| claude.ai (usage monitor) | Usage alerts stop — no routing impact |
| Residential internet | Full Odin outage (cloud providers unreachable) |
| Local Ollama | Heartbeat/utility tasks fail; cloud routes still work |

**Single point of failure:** Internet connection. No CDN caching, no edge deployment, no failover ISP.

## Model Usage Constraints

### Anthropic Subscription Windows

| Window | Duration | Reset |
|--------|----------|-------|
| Session | 5 hours | Rolling |
| Weekly | 7 days | Rolling |

At current workloads (~3 enabled cron jobs, occasional Discord messages), session window typically consumed < 30% per 5-hour period. Weekly window rarely exceeds 50%.

### Groq Rate Limits

| Limit | Value | Enforcement |
|-------|-------|-------------|
| Requests per second | 0.5 (1 req/2s minimum spacing) | groq-throttle.mjs |
| Requests per minute | 20 | groq-throttle.mjs sliding window |
| Daily spend cap | $1.50 | budget-controller.mjs hard disable |
| Monthly spend cap | $30.00 | budget-controller.mjs hard disable |

These are Odin-internal limits, not necessarily Groq's actual API limits. They are intentionally conservative to prevent quota exhaustion storms.

### Ollama Capacity

| Limit | Value |
|-------|-------|
| Concurrent models | 1 (sequential loading) |
| RAM gate | 512 MB free minimum |
| Maximum context | 131,072 tokens (llama3.2:3b) |
| Max output | 8,192 tokens |

## Operational Scaling Limits

| Metric | Current | Safe Maximum | Hard Limit |
|--------|---------|-------------|-----------|
| Real OpenClaw agents | 3 | ~10 | Unknown (process/RAM bound) |
| Cron jobs | 7 (3 active) | ~20-30 | Scheduler-bound |
| Discord bots | 3 | ~10 | Discord API limits |
| Daily Anthropic spend | ~$0.001 | $1.50 (hard) | Subscription window |
| Daily Groq spend | ~$0 | $1.50 (hard cap) | Hard capped |
| Daily Ollama calls | ~48 (heartbeat) | Unlimited | RAM/CPU bound |

## Cost Hard Caps Summary

| Provider | Daily Hard Cap | Monthly Hard Cap | Effect |
|----------|---------------|-----------------|--------|
| Groq | $1.50 | $30.00 | Provider disabled; degraded mode if Anthropic also down |
| Anthropic (general budget) | $2.00 (critical alert) | $40.00 (critical alert) | Alert only; service maintained |
| Anthropic (hard budget) | $1.50 | $30.00 | Block premium; demote standard |

## Context Window Constraints

| Model | Context | Max Output |
|-------|---------|-----------|
| claude-haiku-4-5 | 200K tokens | 8K tokens |
| claude-sonnet-4-5 | 200K tokens | 8K tokens |
| claude-opus-4-6 | 200K tokens | 8K tokens |
| groq/llama-3.3-70b-versatile | 128K tokens | 32K tokens |
| groq/llama-3.1-8b-instant | 128K tokens | 8K tokens |
| ollama/llama3.2:3b | 131K tokens | 8K tokens |

Session compaction mode (`safeguard`) handles long-running sessions that approach context limits.

---

_End of ODIN_SYSTEM_EXPORT.md_

---
**Document generated by:** Claude Code (DevOps engineer)
**For:** The Odin System Architect AI
**Date:** 2026-03-08
**OpenClaw version:** 2026.3.2
**System state at export:** Mode `normal`, Anthropic healthy (score=100), Groq healthy (score=100), Budget pressure `none`
