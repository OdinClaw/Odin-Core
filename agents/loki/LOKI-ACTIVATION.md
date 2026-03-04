# LOKI ACTIVATION GUIDE

Loki is registered, configured, and ready. But he needs a **heartbeat trigger** to run his monitoring routine.

## Current Status

✅ **Loki is registered** as an isolated agent
✅ **Discord account configured** (@Loki in #loki)
✅ **Identity stack complete** (SOUL.md, IDENTITY.md, HEARTBEAT.md, etc.)
✅ **HEARTBEAT TRIGGER ACTIVATED** — launchd running, every 30 minutes

## Architecture

**How Loki monitors:**

1. launchd plist triggers every 30 minutes (system scheduler)
2. Calls `trigger-heartbeat.sh` (wrapper script)
3. Script invokes: `openclaw --profile odin agent --agent loki`
4. Loki reads HEARTBEAT.md, executes protocol
5. Loki queries `cron list` (dynamic — picks up new jobs automatically)
6. Loki posts findings to #loki via his own Discord bot

**Why this design matters:**
- Zero hardcoded job lists — Loki queries live state every time
- New cron jobs? Automatically detected next heartbeat.
- Removed jobs? Automatically forgotten.
- Config changed? Loki sees it immediately.
- No configuration needed as your system evolves.

## Management

### Check Status

```bash
/Users/odinclaw/.openclaw-odin/workspace/agents/loki/check-status.sh
```

Output shows: launchd status, next run time, log locations, manual trigger command.

### View Recent Reports

```bash
tail /tmp/loki-heartbeat.log           # What Loki found
tail /tmp/loki-heartbeat-error.log     # Any execution errors
```

### View Loki's Memory

```bash
cat ~/.openclaw-odin/workspace/agents/loki/memory/2026-03-04.md   # Today's raw log
cat ~/.openclaw-odin/workspace/agents/loki/MEMORY.md              # Long-term learnings
```

### Trigger Loki Manually (Testing)

```bash
/Users/odinclaw/.openclaw-odin/workspace/agents/loki/trigger-heartbeat.sh
```

Loki posts to #loki within ~10 seconds.

### Stop/Restart Loki's Heartbeat

```bash
# Stop
launchctl unload ~/Library/LaunchAgents/ai.openclaw.loki-heartbeat.plist

# Restart
launchctl load ~/Library/LaunchAgents/ai.openclaw.loki-heartbeat.plist

# Check status
launchctl list | grep loki
```

### Change Heartbeat Frequency

Edit the plist to change `StartInterval` (in seconds):

```bash
# Current: 1800 seconds = 30 minutes

# To change to 15 minutes (900 seconds):
sed -i '' 's/<integer>1800<\/integer>/<integer>900<\/integer>/' \
  ~/Library/LaunchAgents/ai.openclaw.loki-heartbeat.plist

# Reload
launchctl unload ~/Library/LaunchAgents/ai.openclaw.loki-heartbeat.plist
launchctl load ~/Library/LaunchAgents/ai.openclaw.loki-heartbeat.plist
```

## What Loki Reports

**When all jobs are healthy:**
```
✅ Heartbeat OK — [Wed 09:16 EST]
System: ✅ All 7 cron jobs running smoothly. No errors detected.
```

**When failures detected:**
```
⚠️ Heartbeat Alert — [Wed 09:16 EST]

❌ Job: Daily Music Analytics Digest
Status: ERROR (2 consecutive failures)
Last Error: "YouTube API key invalid or quota exceeded"
Fix: Check auth-profiles.json. Verify YouTube API credentials. Get new key from Google Cloud Console if needed.

❌ Job: Artist Analytics Dashboard  
Status: ERROR (2 consecutive failures)
Last Error: "YouTube API key invalid"
Fix: Same as above. Both jobs share the same YouTube API dependency.

⚠️ Job: Weekly LinkedIn Content Draft
Status: ERROR (1 failure)
Last Error: "Ambiguous Discord recipient — use 'user:' or 'channel:' prefix"
Fix: Edit cron job payload to use proper Discord routing format. Change to "channel:1477765006811598921"

✅ Other 4 jobs: Running normally.
```

## Loki's Learning System

After each heartbeat:
- Logs findings to `memory/YYYY-MM-DD.md` (raw, daily)
- Distills patterns into `MEMORY.md` (curated, long-term)
- Tracks recurring failures (e.g., "YouTube API issues every Tuesday?")
- Improves remediation suggestions based on what actually worked

## What's Under Your Control

✅ **Everything**

- **Heartbeat frequency** — Change StartInterval in the plist
- **When Loki runs** — load/unload launchd, or trigger manually
- **What he reports to** — Only #loki (isolated channel)
- **Action on failures** — You decide if/when to fix them
- **Loki's scope** — He reports, he doesn't execute

---

## You're All Set

Loki is now watching your system 24/7. Every 30 minutes:
- He checks cron status
- He detects new/removed/changed jobs automatically
- He surfaces failures with remediation steps
- He logs findings for pattern analysis

**Nothing more to do.** Just check #loki periodically or when you need a status update.

If you add new cron jobs tomorrow, add the day after, next month — Loki automatically detects them. No reconfiguration needed. That's the design.
