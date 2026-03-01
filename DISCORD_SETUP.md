# Discord Integration Setup

## Overview

Odin uses Discord as the primary interface. All communication, cron job outputs, agent logs, and status updates flow through Discord channels instead of the OpenClaw gateway.

## Architecture

```
OpenClaw (main system)
    ↓
  Cron Jobs / Agents
    ↓
post_to_discord.py (helper script)
    ↓
Discord API
    ↓
Discord Bot (Odin)
    ↓
Discord Channels (organized by function)
```

## Files

- **`.env`** — Stores `DISCORD_TOKEN` (DO NOT COMMIT)
- **`post_to_discord.py`** — Helper script to post messages from cron jobs
- **`discord_integration.py`** — Full Discord bot (listener + poster, for future)
- **`HEARTBEAT.md`** — Periodic health check configuration

## Channel Map

| Channel | Use | Automated Output |
|---------|-----|------------------|
| #odin-general | Direct chat with user | None (manual only) |
| #cron-jobs | Cron job execution logs | All cron jobs by default |
| #status-heartbeat | Periodic heartbeat/status | Heartbeat job (30 min) |
| #agents | Sub-agent activity, spawns | Agent lifecycle events |
| #projects | Project updates, progress | Project-related jobs |
| #usage-limits | Token usage, costs | Usage tracking job |
| #docudigest | Docs summaries, learning | Doc jobs |
| #workshop | Experimental work | Experimental cron jobs |

## Usage

### Posting from Cron Jobs

In a cron job's payload, use:

```bash
python3 /Users/odinclaw/.openclaw-odin/workspace/post_to_discord.py <channel_type> "Your message"
```

Examples:

```bash
# Post to #status-heartbeat
post_to_discord.py heartbeat "✅ System check: All good"

# Post to #cron-jobs
post_to_discord.py cron "Job completed successfully"

# Post to #agents
post_to_discord.py agents "Spawned new agent: social-media-bot"
```

### Token Management

Token is stored in `.env`:

```
DISCORD_TOKEN=YOUR_BOT_TOKEN_HERE
```

**Security:**
- `.env` is in `.gitignore` (never committed)
- If token is compromised, regenerate it in Discord Developer Portal → Bot → "Reset Token"
- Send new token and we'll update `.env`

## Setting Up New Cron Jobs

When creating a cron job that should post to Discord:

1. Create the job in OpenClaw (via `cron` tool)
2. Have the job's payload include the post_to_discord call
3. Test by running the job immediately

Example cron job (agentTurn payload):

```json
{
  "name": "My Task",
  "schedule": {"kind": "every", "everyMs": 3600000},
  "payload": {
    "kind": "agentTurn",
    "message": "Do work... then run: post_to_discord.py cron 'Task complete!'"
  },
  "sessionTarget": "isolated"
}
```

## Listening Mode (Future)

The `discord_integration.py` is a full Discord bot that can:
- Listen for messages in #odin-general
- React to commands
- Post status embeds

Currently not used, but ready for expansion if needed.

## Troubleshooting

**"Channel not found"** — Make sure the channel name exactly matches the map above (with hyphens, lowercase).

**"Bot missing permissions"** — Check Discord server → Roles → Odin role has Administrator (or at least Manage Channels + Send Messages).

**"Token error"** — Verify `.env` exists and token is correct. If recently regenerated, ensure you copied the full string.

**No message appears** — Check:
1. Bot is in the Discord server (#members)
2. Bot has permission to send messages in that channel
3. No typos in channel type name
4. Discord API isn't rate-limiting

---

**Last Updated:** Feb 28, 2026
