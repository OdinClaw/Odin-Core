# DISCORD-MIRROR-PHASE1.md — Phase 1 Rollout Spec

_Three new channels. Clear owners. Minimal overhead._
_Created: 2026-03-08_

---

## Phase 1 Scope

Three channels to create and wire up. These are system-level channels for Pantheon state visibility.

| Channel | Purpose | Owner | Bot |
|---------|---------|-------|-----|
| #pantheon-registry | Live agent status board | Odin | @Odin |
| #system-status | Health summaries + heartbeat | Loki | @Loki |
| #alerts | P0 critical failures only | Odin (routes from Loki) | @Odin |

---

## Channel 1: #pantheon-registry

**Purpose:** Mirror of `kernel/PANTHEON-REGISTRY.md`. Bazzy can see agent status at a glance without reading files.

**Owner:** Odin

**Update triggers:**
- An agent goes live (status change: paused → live)
- An agent goes offline unexpectedly
- A new agent is added to the registry
- Major phase change for any agent

**Message format:**
```
[REGISTRY UPDATE] 2026-03-08

Agent: Adam
Status: paused → live
Bot: @Adam created, CLI registered
Channel: #docudigest
Notes: First activation. Processing queued handoffs.

Full registry: workspace/kernel/PANTHEON-REGISTRY.md
```

**Who posts:** Odin only. No other agent posts to this channel.

**Frequency:** Event-driven only. Not scheduled. No heartbeat spam.

**Bazzy action required:**
- [ ] Create #pantheon-registry channel in Discord server
- [ ] Invite @Odin bot (already live)
- [ ] Add channel ID to Odin's allowed channels in openclaw.json

---

## Channel 2: #system-status

**Purpose:** Loki's plain-language health summary. Not raw cron output — interpreted status.

**Owner:** Loki

**Update triggers:**
- Every scheduled heartbeat run (every 30 minutes or per Loki's cron)
- When a job failure is detected (immediate post, don't wait for next cycle)
- When system recovers from a failure
- When Bazzy asks Loki directly for status

**Message format (scheduled heartbeat):**
```
[SYSTEM STATUS] 2026-03-08 14:30

All cron jobs nominal.
Last check: 14:30 | Model: llama3.2:3b

Jobs checked: usage-monitor (✅ ran 14:00), loki-trigger (✅ ran 14:00)
Gateway: reachable
Notable: nothing to flag

Next check: 15:00
```

**Message format (failure detected):**
```
[STATUS ALERT] 2026-03-08 14:35

Failed job: usage-monitor
Last successful run: 14:00
Expected: 14:30 | Missed

Likely cause: LaunchAgent unloaded or script error
Check: launchctl list | grep usage-monitor
Log: /Users/odinclaw/.openclaw-odin/scripts/usage-monitor.log

Escalated to: Odin (handoff written)
```

**Who posts:** Loki only. Uses @Loki bot.

**Frequency:** Every 30 minutes (aligned with heartbeat cron). Plus event-driven on failures.

**Bazzy action required:**
- [ ] Create #system-status channel in Discord server
- [ ] Allow @Loki bot to post (Loki already has own bot + binding)
- [ ] Add channel ID to Loki's allowed channels list in openclaw.json

**openclaw.json change for Loki:**
Currently Loki is only allowed in #loki. Add #system-status as a write-only channel (Loki posts status; does NOT read commands from it):
```json
"channels": ["1478591775558996122", "<system-status-channel-id>"]
```
Note: Get channel ID from Discord after creation.

---

## Channel 3: #alerts

**Purpose:** P0 critical failures only. Not routine status. High signal, low noise.

**Owner:** Odin (acts as alert router; receives from Loki, posts here)

**What qualifies as a #alerts post:**
- Any job that has missed 2+ consecutive scheduled runs
- Gateway completely unreachable (not just slow)
- Authentication failure / cooldown triggered
- Subscription at 95%+ (either window)
- Any agent that has gone silent beyond 2x its scheduled interval with no incident report

**What does NOT belong in #alerts:**
- Routine status updates → #system-status
- Single missed run with auto-recovery → #system-status
- Usage at 50/75/90% → #usage-limits (Qin's territory)

**Message format:**
```
🚨 [P0 ALERT] 2026-03-08 14:45

ISSUE: Gateway unreachable for 15 minutes
IMPACT: All agent messaging blocked
LAST HEALTHY: 14:30

ACTION NEEDED: Check LaunchAgent / restart gateway

Commands:
launchctl list | grep openclaw
launchctl unload /Users/odinclaw/Library/LaunchAgents/ai.openclaw.odin.plist
launchctl load /Users/odinclaw/Library/LaunchAgents/ai.openclaw.odin.plist

Loki handoff: agents/odin/handoffs/2026-03-08-gateway-outage.md
```

**Who posts:** @Odin bot. Odin acts on Loki's escalation or detects directly.

**Frequency:** Event-driven only. If #alerts is quiet, that is a good sign.

**Bazzy action required:**
- [ ] Create #alerts channel in Discord server
- [ ] Allow @Odin bot to post
- [ ] Add channel ID to Odin's allowed channels in openclaw.json

---

## Bazzy's Full Action List (Phase 1)

**In Discord:**
1. Create #pantheon-registry channel
2. Create #system-status channel
3. Create #alerts channel
4. Note all three channel IDs

**In openclaw.json — add new channel IDs to @Odin's allowed channels:**
```json
"channels": [
  "1477047633251139617",   // #general (existing)
  "1477459669239861380",   // #odin-general (existing)
  "1477459670095499518",   // #projects (existing)
  "1477459670804205619",   // #agents (existing)
  "1477459671890526322",   // #usage-limits (existing)
  "1477459672851157074",   // #cron-jobs (existing)
  "1477459673996198079",   // #status-heartbeat (existing)
  "1477459675082522790",   // #workshop (existing)
  "1477459676026110075",   // #docudigest (existing)
  "<pantheon-registry-id>",  // NEW
  "<system-status-id>",      // NEW
  "<alerts-id>"              // NEW
]
```

**For Loki — add #system-status to Loki's allowed channels:**
```json
"channels": ["1478591775558996122", "<system-status-id>"]
```

**After adding IDs:** Restart gateway.
```bash
launchctl unload ~/Library/LaunchAgents/ai.openclaw.odin.plist
sleep 2
launchctl load ~/Library/LaunchAgents/ai.openclaw.odin.plist
```

---

## Phase 1 Success Criteria

- [ ] #pantheon-registry receives its first update when Adam goes live
- [ ] #system-status receives Loki's heartbeat every 30 minutes (no missed cycles)
- [ ] #alerts has received at least one test P0 (or stayed clean for 48 hours — both are acceptable)
- [ ] Odin and Loki do NOT post to each other's channels

---

## Phase 2 (Future — not in scope now)

- #pantheon-registry becomes a live dashboard (pinned message, updated in place)
- Apollo posts social metrics digest to a new #social-metrics channel
- Qin posts weekly cost summary to #usage-limits (already exists)
- Budget for per-agent channel expansion as agents go live

---

_Phase 1 is additive. Do not touch existing channel configs. Just add three new ones._
