# Discord Listener Skill

**Status**: Building  
**Version**: 1.0 (MVP)  
**Framework**: discord.py 2.0+  
**Purpose**: Proactive Discord message monitoring for agent response automation

---

## What It Does

Runs a Discord bot continuously in the background that:
1. **Listens to all configured channels** in real-time
2. **Detects new messages** immediately (on_message event)
3. **Identifies unresponded messages** (checks if message already has agent response)
4. **Routes to appropriate agent** (reads channel name → embody agent → respond)
5. **Keeps conversation in-channel** (agents respond in their own channels)

**Result**: You post in #apollo → Bot detects → Odin/Apollo responds as Apollo in #apollo (all automatically, no manual intervention)

---

## Architecture

```
Discord Server (13 agent channels)
         ↓
Discord.py Bot (Listener)
         ↓
on_message Event (Real-time detection)
         ↓
Message Router (Which agent should respond?)
         ↓
Agent Logic (Load SOUL.md, AGENTS.md, respond as agent)
         ↓
Discord Send (Post response in original channel)
```

---

## Requirements

- `discord.py >= 2.0`
- Discord bot token (with Message Content Intent enabled)
- Python 3.8+
- Bot must be added to server with appropriate permissions

---

## Setup Steps

### Step 1: Create Discord Bot (Developer Portal)

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Name it: "Odin Discord Listener"
4. Go to "Bot" tab → Click "Add Bot"
5. Copy token (save securely)
6. Enable "Message Content Intent" (required for on_message)
7. Go to OAuth2 → URL Generator
8. Select scopes: `bot`
9. Select permissions: `Read Messages`, `Send Messages`, `Manage Messages`
10. Copy generated URL, visit it to add bot to your server

### Step 2: Configure Skill

Create `.env` file in skill directory:

```
DISCORD_TOKEN=your_bot_token_here
DISCORD_GUILD_ID=your_server_id
AGENT_CHANNELS=apollo,buddha,hermes,chronus,hercules,zeus,tesla,beelzebub,adam,sasaki,hades,shiva,qin
WORKSPACE_PATH=/Users/odinclaw/.openclaw-odin/workspace
```

### Step 3: Run the Bot

```bash
python discord_listener_bot.py
```

The bot starts listening immediately.

---

## How It Works (Flow)

### When You Post in #apollo:

1. **Discord.py detects** new message in #apollo
2. **on_message fires** immediately
3. **Bot checks**: "Is this a user message? Is this in an agent channel? Has it been responded to?"
4. **Router determines**: "Channel is #apollo → Agent is Apollo"
5. **Load Apollo's files**:
   - `agents/apollo/SOUL.md`
   - `agents/apollo/AGENTS.md`
   - `shared-context/THESIS.md`
   - `shared-context/FEEDBACK-LOG.md`
   - `agents/apollo/memory/MEMORY.md`
6. **Embody Apollo**: Read your message + Apollo's personality
7. **Generate response**: Apollo thinks + responds
8. **Post in #apollo**: Response appears in same channel (looks like Apollo is talking)
9. **Update memory**: Any learnings → `agents/apollo/memory/YYYY-MM-DD.md`

---

## Files

- `discord_listener_bot.py` — Main bot script (runs continuously)
- `.env` — Configuration (Discord token, channels, paths)
- `agent_router.py` — Logic to determine which agent should respond
- `agent_embedder.py` — Logic to load agent files + embody them
- `config.py` — Configuration loader

---

## Key Features

### Real-Time Detection
- `on_message` fires immediately (no polling, no delay)
- Message appears in channel → Bot sees it instantly

### Smart Routing
- Reads channel name (#apollo) → Maps to agent (Apollo)
- Loads agent's SOUL.md + AGENTS.md
- Only responds if message is unresponded + from valid user

### Memory Integration
- Each agent's responses land in their memory file
- Odin tracks everything in `memory/YYYY-MM-DD.md`
- Next session, agents are smarter

### Error Handling
- If agent logic fails → Post error message instead of crashing
- Continue listening for next message
- Log errors for debugging

---

## Testing

Once running:

1. Go to #apollo
2. Post: "Test message"
3. Bot should respond as Apollo within seconds
4. Check `agents/apollo/memory/YYYY-MM-DD.md` for log entry

---

## Scaling to All Agents

Bot listens to all 13 agent channels:
- #apollo
- #buddha
- #hermes
- #chronus
- #hercules
- #zeus
- #tesla
- #beelzebub
- #adam
- #sasaki
- #hades
- #shiva
- #qin

Add new agents by updating `AGENT_CHANNELS` in `.env`

---

## Limitations

- Bot must have Message Content Intent enabled (Discord requirement)
- Bot needs appropriate Discord server permissions (Send Messages, etc.)
- Requires Python environment running continuously (consider systemd/launchd for persistence)
- Rate limits apply (Discord API limits requests)

---

## Troubleshooting

**Bot doesn't respond**:
- Check Message Content Intent is enabled
- Check bot has "Send Messages" permission
- Check token in .env is correct
- Check channel IDs are correct

**Bot crashes**:
- Check Python logs
- Verify all agent files exist
- Verify workspace path is correct

**Slow responses**:
- Agent logic loading files (takes 200-500ms)
- Discord API latency
- Expected: <1 second typical response time

---

## Next Steps

1. Configure Discord bot token
2. Create .env file
3. Run discord_listener_bot.py
4. Test in #apollo channel
5. Monitor logs + memory files

---

_Once live, Odin truly becomes proactive. Channels become agent conversations, not message archives._
