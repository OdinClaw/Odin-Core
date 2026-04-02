# HEARTBEAT.md - LEGACY (Odin root workspace)

> ⚠️ LEGACY FILE — Do not create new cron jobs pointing here.
> Routine heartbeat is Loki's responsibility. See: workspace/agents/loki/HEARTBEAT.md
> The "Odin Heartbeat" cron job that read this file has been disabled (2026-03-11).
> Odin is invoked only for escalation, coordination, and scheduled knowledge-mirror tasks.

---

Every 30 minutes, perform these checks and post results to Discord (#status-heartbeat).

## Checks to Perform

Rotate through these (do 2-3 per heartbeat):

1. **Email** — Any urgent unread messages?
   - Check Gmail/mail summary
   - Post if something critical arrived

2. **Calendar** — Upcoming events in next 24-48h?
   - Check for important meetings/deadlines
   - Post if < 2 hours away

3. **Projects** — Any active projects need attention?
   - Check git status, outstanding PRs
   - Note blockers or urgent items

4. **System Status** — Hardware/resource health?
   - Check CPU, memory, disk
   - Report if anything concerning

5. **Message Queue** — Any pending Discord messages?
   - Check #odin-general for new commands
   - Respond if action needed

## Posting to Discord

After checks, create a brief status update:

```
✅ Heartbeat [Sat 10:38 EST]
- Email: 3 new messages (none urgent)
- Calendar: Team meeting in 4h
- Projects: No blockers
- System: Normal
```

Use: `python3 /Users/odinclaw/.openclaw-odin/workspace/post_to_discord.py heartbeat "YOUR_MESSAGE"`

## When to Escalate

Post to Discord if:
- Urgent email arrived (CEO, billing, etc.)
- Meeting in < 2 hours
- System issue detected
- Blocked project needs immediate attention
- Otherwise, just post a brief "all clear" status

## When to Stay Silent

It's OK to post "all clear" — that's useful. But don't spam.

---

**Last updated:** Feb 28, 2026  
**Frequency:** Every 30 minutes  
**Channel:** #status-heartbeat
