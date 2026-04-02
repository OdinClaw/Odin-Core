# QIN-ACTIVATION-CHECKLIST.md — Qin Shi Huang

_Next-pass readiness spec. Do not activate Qin until Adam is stable._
_Created: 2026-03-08_

---

## Activation Prerequisite

**Adam must be stable first.** Qin is Priority 2B — after Adam (2A).

Rationale: Cost visibility matters, but knowledge infrastructure matters more. If Adam is live and processing, Qin can be activated with full context on system costs as Adam documents the activation itself.

---

## Current State Audit (as of 2026-03-08)

### What Qin Has
| Item | Status | Notes |
|------|--------|-------|
| manifest.yaml | ✅ done | v1.0, all fields complete |
| mission.md | ✅ done | Three clear goals, phase structure defined |
| skills.md | ✅ done | Skills inventory ready |
| SPENDING-PROTOCOL.md | ✅ done | Alert thresholds defined |
| memory/ directory | ✅ done | Exists |

### What Qin Is Missing
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| SOUL.md | ❌ missing | high | Core identity and values |
| IDENTITY.md | ❌ missing | high | Who Qin is in the Pantheon |
| USER.md | ❌ missing | high | What Bazzy needs from Qin specifically |
| AGENTS.md | ❌ missing | medium | How Qin relates to other agents |
| HEARTBEAT.md | ❌ missing | high | Session start protocol |
| MEMORY.md | ❌ missing | medium | Persistent knowledge |
| @Qin Discord bot | ❌ not created | high | Bazzy must create in Developer Portal |
| CLI registration | ❌ not done | high | `openclaw agents add qin --profile odin` |
| openclaw.json entry | ❌ not done | high | Channel config + account + binding |
| auth-profiles.json | ❌ not done | high | Copy after CLI registration |
| Cron job | ❌ not configured | high | 30-minute usage check schedule |
| intel/USAGE-REPORT.md | ❌ not created | medium | Output file initialized |

---

## Activation Steps (in order)

### Step 0 — Prerequisites
- [ ] Adam is CLI-registered and processing handoffs
- [ ] Adam kb/ has at least one document (system is working end-to-end)

### Step 1 — Identity Stack (Odin builds during next pass)
- [ ] Create `agents/qin/SOUL.md` — Qin's identity, values, operating principles
- [ ] Create `agents/qin/IDENTITY.md` — role in Pantheon, memory destination, one-way flows
- [ ] Create `agents/qin/USER.md` — Bazzy's 5 specific needs from Qin
- [ ] Create `agents/qin/AGENTS.md` — network map, who Qin notifies (Odin for criticals)
- [ ] Create `agents/qin/HEARTBEAT.md` — session start protocol
- [ ] Create `agents/qin/MEMORY.md` — initial knowledge state

### Step 2 — Discord Bot (Bazzy action)
- [ ] Create @Qin bot in Discord Developer Portal
- [ ] Enable MESSAGE_CONTENT privileged intent
- [ ] Copy bot token — do not paste in chat (save to openclaw.json directly)
- [ ] Confirm channel: #usage-limits (ID: 1477459671890526322)

### Step 3 — openclaw.json Update (Odin + Bazzy)
```json
"accounts": {
  "qin": {
    "token": "<@Qin bot token>",
    "allowFrom": ["583319870511513611"],
    "guilds": ["1477047631950643244"],
    "channels": ["1477459671890526322"]
  }
}
```

Add binding:
```json
{
  "agentId": "qin",
  "match": {
    "channel": "discord",
    "accountId": "qin"
  }
}
```

### Step 4 — CLI Registration (Bazzy action)
```bash
openclaw agents add qin --profile odin
```

### Step 5 — Auth Configuration (Odin action after CLI registration)
```bash
# Copy main agent auth to Qin
cp ~/.openclaw-odin/agents/main/agent/auth-profiles.json \
   ~/.openclaw-odin/agents/qin/agent/auth-profiles.json
```

### Step 6 — usage-monitor.mjs Integration
- [ ] Evaluate whether Qin replaces or wraps `usage-monitor.mjs`
- [ ] Decision options:
  - **Option A (preferred):** Keep `usage-monitor.mjs` as standalone script; Qin reads its state file and adds interpretation/trend layer
  - **Option B:** Qin absorbs the script logic entirely (more complex, higher risk)
- [ ] If Option A: Qin reads `scripts/usage-monitor-state.json` and `scripts/usage-monitor.log`
- [ ] Create `intel/USAGE-REPORT.md` as initialized output file

### Step 7 — Cron Job Setup (Odin action)
```bash
# 30-minute usage check — aligned with existing monitor schedule
openclaw cron add --agent qin \
  --schedule "*/30 * * * *" \
  --prompt "Check current Anthropic subscription usage. Post status to #usage-limits if threshold crossed or if this is a summary window." \
  --profile odin
```

### Step 8 — Verification
- [ ] Trigger Qin manually: `echo "Check usage and report status" | openclaw --profile odin agent --agent qin`
- [ ] Confirm message appears in #usage-limits
- [ ] Confirm USAGE-REPORT.md is written
- [ ] Confirm no duplicate alerts with usage-monitor.mjs (coordinate or disable script if Qin absorbs it)
- [ ] Run for 24 hours before marking LIVE in PANTHEON-REGISTRY.md

---

## What Qin Should Do Once Activated

**Immediate (first run):**
1. Read `scripts/usage-monitor-state.json` for current threshold state
2. Read `scripts/usage-monitor.log` for recent history
3. Report current usage % to #usage-limits
4. Initialize `intel/USAGE-REPORT.md` with baseline snapshot

**Ongoing (every 30 minutes):**
1. Query usage via claude.ai (same mechanism as usage-monitor.mjs)
2. Compare against alert thresholds (50/75/90/95%)
3. If threshold crossed: post to #usage-limits + Telegram
4. Write update to USAGE-REPORT.md

**Weekly (every Monday 09:00):**
1. Generate 7-day spending summary
2. Break down by model tier if possible
3. Post to #usage-limits
4. Update USAGE-REPORT.md with weekly section

**On critical (95% either window):**
1. Alert #usage-limits + Telegram immediately
2. Write handoff to `agents/odin/handoffs/` — Odin needs to know
3. Include estimated reset time

---

## Qin's Integration with usage-monitor.mjs

Current script: `~/.openclaw-odin/scripts/usage-monitor.mjs`
State file: `~/.openclaw-odin/scripts/usage-monitor-state.json`
Schedule: Every 30 minutes via `ai.openclaw.odin.usage-monitor` LaunchAgent

**Recommended approach (Option A):**
- Keep the LaunchAgent and script running — it already works and has alerting logic
- Qin reads the state file to understand current threshold state without redundant API calls
- Qin adds value through: trend analysis, session context, on-demand status interpretation
- Disable script's direct Telegram alerts when Qin is live (Qin handles all notifications)
- Do NOT run both systems sending alerts simultaneously

---

## PANTHEON-REGISTRY.md Update (after activation)

Change Qin's status from `paused` → `live` and update the entry:
```
| qin | 💰 Qin Shi Huang | isolated | LIVE | haiku | #usage-limits | @Qin | 30min cron |
```

---

_Cost visibility before cost expansion. Activate Qin before Apollo._
