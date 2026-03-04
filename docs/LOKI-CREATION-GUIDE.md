# LOKI — Complete Creation & Setup Guide

**Document Date:** March 4, 2026  
**Status:** ✅ LIVE & OPERATIONAL  
**Created by:** Odin (orchestrator), Claude Code (setup), Sonnet (debugging)

---

## Overview

Loki is the first **real isolated OpenClaw agent** — a permanent team member running 24/7 to monitor system health and report failures. This document details the complete creation process, architecture decisions, and operational setup.

---

## Why Loki Exists

**Problem:** Cron jobs fail silently. You don't know about failures until something breaks downstream.

**Solution:** Create a dedicated monitoring agent that:
1. Checks all cron jobs every 30 minutes (automatically)
2. Reports failures with diagnostics + fix suggestions
3. Has his own Discord presence (@Loki in #loki)
4. Learns and improves over time through memory files

**Key Design Principle:** All-things heartbeat. Not just cron monitoring eventually — system resource tracking, health checks, anomaly detection, the works.

---

## Architecture Decision: Isolated vs Sub-Agent

**Why Isolated?**
- Needs persistent presence (24/7 monitoring)
- Runs on schedule automatically (launchd, every 30 min)
- Feeds data to other agents (could become dependency)
- Continuous background operation
- Not episodic — runs whether asked or not

**Why NOT Sub-Agent?**
- Sub-agents are on-demand (you spawn them)
- Loki needs to watch the system always
- Can't rely on user to trigger heartbeats

---

## Step 1: CLI Registration

```bash
openclaw --profile odin agents add loki
```

This creates:
- `~/.openclaw-odin/agents/loki/agent/` — Agent runtime directory
- `~/.openclaw-odin/agents/loki/sessions/` — Session storage

**Output:** Agent registered, ready for workspace files.

---

## Step 2: Create Workspace Identity Stack

Created 6 files in `~/.openclaw-odin/workspace/agents/loki/`:

### SOUL.md — Who Loki Is

```
Core: Lightweight monitor, relay, listener
Vibe: Direct, low-key, wry humor when it fits
Role: Status reporting, anomaly flagging, relay
Model: Local-first (qwen3.5:4b → qwen3.5:9b → cloud fallback)
```

**Key principle:** Simple is the job. Status, relay, flag anomalies. That's it.

### IDENTITY.md — Role in Ecosystem

```
Name: Loki
Creature: Trickster god, strategic chaos agent
System: Odin's agent network (peer, not subordinate)
Channel: #loki (dedicated Discord channel)
Bot: @Loki (separate Discord bot token)
```

### USER.md — What Bazzy Needs

```
Concise. One sentence beats three.
Direct. No filler.
If something's off in a report, say so clearly.
Don't re-explain what's already obvious.
```

### AGENTS.md — Session Startup Protocol

Standard template for all agents:
- Read SOUL.md (who you are)
- Read USER.md (who you're helping)
- Read daily memory (context)
- Read MEMORY.md (long-term learnings)

### HEARTBEAT.md — Loki's Specific Protocol

```
Every 30 minutes:
  1. Query cron list (dynamic — picks up new jobs)
  2. Flag any with lastStatus: "error"
  3. For each failure: error + diagnosis + specific fix
  4. Post to #loki
  5. Log findings to memory/YYYY-MM-DD.md
```

**Critical:** Queries LIVE cron state. New jobs added? Loki detects them automatically at next heartbeat.

### MEMORY.md — Long-Term Memory

```
Purpose: Loki monitors + relays cron failures, learns from patterns
Origin: First real isolated agent (March 3, 2026)
Key Knowledge: [filled in as Loki learns]
```

### memory/YYYY-MM-DD.md — Daily Operational Logs

Raw logs of what Loki found, what he suggested, follow-ups. Distilled into MEMORY.md periodically.

---

## Step 3: Discord Bot Setup

**Two parts:**

### Part A: Separate Discord Bot Token

Created new Discord bot (@Loki) with its own token in Discord Developer Portal.
- Bot ID: 1478590584372461641
- Different from Odin's main bot
- Allows Loki to post under his own identity

### Part B: Gateway Routing Configuration

Added to `openclaw.json`:

```json
"accounts": {
  "loki": {
    "name": "Loki",
    "enabled": true,
    "token": "__OPENCLAW_REDACTED__",
    "groupPolicy": "allowlist",
    "streaming": "off",
    "allowFrom": ["583319870511513611"],  // Your Discord ID
    "guilds": {
      "1477047631950643244": {  // Odin guild
        "channels": {
          "1478591775558996122": {  // #loki channel
            "allow": true,
            "requireMention": false,
            "users": ["583319870511513611"]
          }
        }
      }
    }
  }
}
```

**Effect:** When Loki posts to Discord, it uses his bot (@Loki), not Odin's.

### Part C: Agent-to-Account Binding

```json
"bindings": [
  {
    "agentId": "loki",
    "match": {
      "channel": "discord",
      "accountId": "loki"  // Loki uses his own Discord account
    }
  }
]
```

**Effect:** Messages from Loki → Discord channel #loki via @Loki bot.

---

## Step 4: Auth Profiles

Copied `auth-profiles.json` from main agent to Loki's agent directory:

```bash
cp ~/.openclaw-odin/agents/main/agent/auth-profiles.json \
   ~/.openclaw-odin/agents/loki/agent/auth-profiles.json
```

Contains:
- Anthropic credentials (for cloud fallback)
- Ollama local credentials (primary: qwen3.5:4b)

---

## Step 5: Heartbeat Trigger Mechanism

**Problem:** OpenClaw 2026.3.2 can't invoke isolated agents directly from cron jobs.

**Solution:** Use system-level scheduler (launchd) + CLI invocation.

### trigger-heartbeat.sh

```bash
#!/bin/bash
PROFILE="odin"
MESSAGE="Read HEARTBEAT.md. Check cron list. Report failures. Post to #loki."

openclaw --profile "$PROFILE" agent \
  --agent loki \
  --message "$MESSAGE" \
  --channel discord \
  --deliver \
  --reply-account loki
```

**What it does:**
1. Invokes Loki's agent
2. Passes the heartbeat message
3. Delivers response to Discord
4. Uses Loki's Discord account for posting

### launchd Plist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.openclaw.loki-heartbeat</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/odinclaw/.openclaw-odin/workspace/agents/loki/trigger-heartbeat.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>1800</integer>  <!-- 30 minutes -->
  <key>StandardOutPath</key>
  <string>/tmp/loki-heartbeat.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/loki-heartbeat-error.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
```

**Loaded via:**
```bash
launchctl load ~/Library/LaunchAgents/ai.openclaw.loki-heartbeat.plist
```

**Status:**
```bash
launchctl list | grep loki
```

---

## Step 6: Model Configuration

**Loki's escalation chain:**

```
Primary: ollama/qwen3.5:4b (local, free, fast)
  ↓ (if rate limited or error)
Secondary: ollama/qwen3.5:9b (local, smarter reasoning)
  ↓ (if Ollama down)
Tertiary: anthropic/claude-haiku-4-5 (cloud, fast)
  ↓ (if subscription hit)
Quaternary: anthropic/claude-sonnet-4-5 (cloud, strong)
```

**Why qwen3.5:4b primary?**
- Status reporting doesn't need strong reasoning
- Local → zero subscription burn
- Fast → 30-min heartbeat cycles complete quickly
- Escalates automatically if needed

**Configured in openclaw.json:**
```json
{
  "id": "loki",
  "model": "ollama/qwen3.5:4b"
}
```

---

## Step 7: Test & Debug

### Initial Test Failures (Lessons Learned)

1. **Session Routing Issue**
   - Problem: Stale `agent:loki:main` session was blocking proper routing
   - Fix: Deleted stale session, cleaned up sessions.json
   - Lesson: Session state matters; old sessions can shadow new bindings

2. **Channel Not Specified**
   - Problem: `--deliver` without `--channel discord` failed
   - Fix: Added `--channel discord` to trigger script
   - Lesson: Multiple channels configured → must specify target

3. **Account Not Specified**
   - Problem: Reports posted via Odin's bot, not Loki's
   - Fix: Added `--reply-account loki` to trigger script
   - Lesson: Explicit routing required for separate bot tokens

### Success Indicators

✅ Trigger script executes without hanging  
✅ Reports post to #loki within 10-15 seconds  
✅ Reports come from @Loki bot, not @Odin  
✅ Reports include cron status + diagnostics  
✅ launchd job runs every 1800 seconds  

---

## Step 8: Current Status & Output

### Heartbeat Reports (Sample)

```
⚠️ Heartbeat Alert [Wed 10:07 EST]

❌ Daily Music Analytics Digest (2 consecutive errors)
Error: YouTube API key invalid or quota exceeded
Fix: Check auth-profiles.json. Get new key from Google Cloud Console.

❌ Artist Analytics Dashboard (2 consecutive errors)
Error: Same as above
Fix: Shared YouTube API dependency.

❌ Weekly LinkedIn Content Draft (1 failure)
Error: Ambiguous Discord recipient — use 'user:' or 'channel:' prefix
Fix: Update cron job payload to use proper Discord routing format.

✅ 4 other jobs: Running normally
```

### Key Files

**Workspace:**
```
~/.openclaw-odin/workspace/agents/loki/
├── SOUL.md                          # Identity
├── IDENTITY.md                      # Role in system
├── USER.md                          # User requirements
├── AGENTS.md                        # Startup protocol
├── HEARTBEAT.md                     # Heartbeat protocol (THE SPEC)
├── MEMORY.md                        # Long-term memory
├── memory/
│   └── 2026-03-04.md               # Daily logs
├── trigger-heartbeat.sh             # Invocation script
├── check-status.sh                  # Status check script
├── LOKI-ACTIVATION.md               # Setup documentation
└── .openclaw/
    └── workspace-state.json         # Session metadata
```

**System:**
```
~/.openclaw-odin/agents/loki/
├── agent/
│   ├── auth-profiles.json           # Credentials
│   └── openclaw.json                # Agent config
└── sessions/
    ├── 9c9e686a-...jsonl           # Discord session (live)
    └── sessions.json                # Session registry
```

**launchd:**
```
~/Library/LaunchAgents/ai.openclaw.loki-heartbeat.plist
```

---

## Management & Operations

### Check Status

```bash
/Users/odinclaw/.openclaw-odin/workspace/agents/loki/check-status.sh
```

Output:
```
=== Loki Heartbeat System Status ===

✓ launchd Job:
-	0	ai.openclaw.loki-heartbeat

✓ Next Run (approx):
  Every 1800 seconds (30 minutes)

✓ Recent Logs:
  Stdout: tail /tmp/loki-heartbeat.log
  Stderr: tail /tmp/loki-heartbeat-error.log
```

### View Recent Reports

```bash
tail /tmp/loki-heartbeat.log
```

### Trigger Manually (Testing)

```bash
bash ~/.openclaw-odin/workspace/agents/loki/trigger-heartbeat.sh
```

### Stop Heartbeat

```bash
launchctl unload ~/Library/LaunchAgents/ai.openclaw.loki-heartbeat.plist
```

### Restart Heartbeat

```bash
launchctl load ~/Library/LaunchAgents/ai.openclaw.loki-heartbeat.plist
```

### Change Frequency

Edit plist `StartInterval`:
- 1800 = 30 minutes (current)
- 900 = 15 minutes
- 3600 = 1 hour

Then reload.

---

## Architecture Principles (Applied to Loki)

### 1. Isolation

- Separate Discord bot (not Odin's voice)
- Dedicated channel (#loki)
- Own workspace directory
- Own session storage

### 2. Dynamic Detection

- Queries `cron list` every heartbeat (not hardcoded)
- Automatically detects new/deleted jobs
- Zero reconfig needed as system evolves

### 3. Transparent Operations

- All findings logged to memory files
- Discord posts visible to you
- Status checkable via CLI
- Logs accessible at /tmp/

### 4. Escalating Availability

- Local models first (zero cost)
- Cloud fallback if needed
- Never blocks heartbeat (timeout handling)

### 5. Learning System

- Daily memory logs (memory/YYYY-MM-DD.md)
- Long-term pattern recognition (MEMORY.md)
- Improves suggestions over time
- Maintains operational history

---

## Known Limitations & Workarounds

### Limitation 1: OpenClaw 2026.3.2 Can't Invoke Isolated Agents from Cron

**Why:** cron jobs run in the main agent context; there's no direct way to spawn an isolated agent from a cron job.

**Workaround:** Use system-level scheduler (launchd) + CLI invocation instead of OpenClaw's cron system.

**Future:** When OpenClaw supports `cron` → `agentId` targeting, this becomes simpler.

### Limitation 2: Channel IDs Must Be Strings in JSON

**Why:** JSON number precision loss (64-bit integers become 54-bit in JavaScript).

**Workaround:** Always quote Discord IDs in JSON: `"583319870511513611"` not `583319870511513611`.

### Limitation 3: Sessions Persist After Deletion

**Why:** Session metadata cached in gateway.

**Workaround:** Manually delete old sessions from both the directory and sessions.json registry.

---

## Integration Points

### Data Consumed

- `cron list` — All cron jobs, their status, recent runs, error messages
- OpenClaw system state — Process status, gateway connectivity

### Data Produced

- #loki Discord messages — Heartbeat reports, failure diagnostics
- memory/YYYY-MM-DD.md — Daily operational logs
- MEMORY.md — Distilled learnings, patterns, recurring issues

### Agents That Read Loki's Output

(Future) Other agents may consume Loki's findings:
- Tesla (portfolio): "Is the system healthy to deploy?"
- Hercules (community): "Are alerts happening? Should I notify users?"
- Qin Shi Huang (spending): "Are failures related to quota limits?"

---

## Lessons Learned

1. **Session state matters.** Old sessions can shadow new bindings. Clean sessions.json when routing changes.

2. **Explicit is better than implicit.** Don't rely on defaults for channel/account routing. Always specify.

3. **Separate bot tokens isolate identity.** Using Loki's own Discord bot makes his voice distinct from Odin's. Worth the setup complexity.

4. **System-level schedulers are reliable.** launchd is more reliable than OpenClaw cron for isolated agents (in this version).

5. **Dynamic queries > hardcoded lists.** Loki querying `cron list` every time is better than maintaining a hardcoded job list. Zero maintenance as system evolves.

6. **Memory is the moat.** Same model + richer memory = exponential quality improvement. Loki gets smarter by logging findings to MEMORY.md.

---

## Files Changed (Git Commit)

```
agents/loki/
├── SOUL.md
├── IDENTITY.md
├── USER.md
├── AGENTS.md
├── HEARTBEAT.md
├── MEMORY.md
├── memory/2026-03-04.md
├── trigger-heartbeat.sh
├── check-status.sh
└── LOKI-ACTIVATION.md

Library/LaunchAgents/
└── ai.openclaw.loki-heartbeat.plist

openclaw.json
├── agents.list[] +loki
├── agents.loki.model = "ollama/qwen3.5:4b"
├── accounts.loki (new)
└── bindings[] +loki

MEMORY.md
└── Updated: Loki agent section
```

---

## Timeline

- **2026-03-03 21:41** — Loki registered via `openclaw agents add loki`
- **2026-03-03 22:40** — SOUL.md + IDENTITY.md created
- **2026-03-04 03:18** — openclaw.json configured with Discord routing
- **2026-03-04 09:16** — HEARTBEAT.md finalized, launchd plist created
- **2026-03-04 10:07** — First test run (failed due to routing issues)
- **2026-03-04 10:13** — Session routing fixed, trigger script corrected
- **2026-03-04 10:50** — System confirmed working ✅
- **2026-03-04 13:06** — Complete documentation created

---

## Next Steps

This template and process will be used for all future agents:

1. **Sub-agents** (5): Beelzebub, Zeus, Hades, Shiva, Sasaki
2. **Isolated agents** (9): Apollo, Buddha, Hermes, Chronus, Hercules, Tesla, Qin Shi Huang, Adam, and any others

Each gets:
- Full CLI registration
- Identity stack (6 files)
- Discord bot + channel
- Model selection (Odin recommends, you approve)
- Documentation (like this)

---

**Document Status:** ✅ COMPLETE  
**Last Updated:** 2026-03-04 13:06 EST  
**Audience:** Bazzy (primary), future team members, knowledge base
