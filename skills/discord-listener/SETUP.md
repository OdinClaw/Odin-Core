# Discord Listener Skill - Setup Guide

Follow these steps to get the Discord Listener running.

---

## Step 1: Create Discord Bot

### 1a. Create Application

1. Go to https://discord.com/developers/applications
2. Log in with your Discord account
3. Click "New Application" (top right)
4. Name it: "Odin Discord Listener"
5. Click "Create"

### 1b. Create Bot

1. Left sidebar → Click "Bot"
2. Click "Add Bot"
3. Under TOKEN, click "Copy"
4. **Save this token securely** (you'll need it)

### 1c. Enable Message Content Intent

1. In Bot section, scroll to "GATEWAY INTENTS"
2. Toggle ON: "Message Content Intent"
3. Click "Save Changes"

**Why?** Discord requires this to let your bot read message text (not just metadata).

### 1d. Get Invite URL

1. Left sidebar → "OAuth2" → "URL Generator"
2. Check "bot" under Scopes
3. Under Permissions, check:
   - Read Messages/View Channels
   - Send Messages
   - Read Message History
4. Copy the generated URL
5. Open that URL in browser to **invite bot to your server**

---

## Step 2: Configure Skill

### 2a. Copy Environment File

```bash
cd /Users/odinclaw/.openclaw-odin/workspace/skills/discord-listener
cp .env.example .env
```

### 2b. Edit .env

```bash
nano .env
```

Update these values:

```
DISCORD_TOKEN=paste_your_bot_token_here
DISCORD_GUILD_ID=1477047631950643244
AGENT_CHANNELS=apollo,buddha,hermes,chronus,hercules,zeus,tesla,beelzebub,adam,sasaki,hades,shiva,qin
WORKSPACE_PATH=/Users/odinclaw/.openclaw-odin/workspace
LOG_LEVEL=INFO
```

**How to find DISCORD_GUILD_ID**:
- Right-click your Discord server name
- "Copy Server ID"
- Paste into .env

Save and exit (`Ctrl+X`, then `Y`, then `Enter`)

---

## Step 3: Install Dependencies

```bash
cd /Users/odinclaw/.openclaw-odin/workspace/skills/discord-listener

# Create virtual environment (optional but recommended)
python3 -m venv venv
source venv/bin/activate

# Install required packages
pip install -r requirements.txt
```

---

## Step 4: Run the Bot

```bash
cd /Users/odinclaw/.openclaw-odin/workspace/skills/discord-listener
python discord_listener_bot.py
```

You should see:

```
✅ Bot logged in as Odin#1234
   Guild ID: 1477047631950643244
   Listening to channels: apollo, buddha, hermes, ...
```

The bot is now running and listening to all agent channels.

---

## Step 5: Test It

1. Go to Discord server
2. Go to #apollo channel
3. Send a message: "Test, do you hear me?"
4. Bot should respond within 1-2 seconds

In the terminal, you should see:

```
[apollo] MixedbyBazzy: Test, do you hear me?
Loading agent files for Apollo...
✅ Response sent to Apollo
```

---

## Step 6: Keep Bot Running 24/7

### Option A: Terminal Window (Development)

Keep terminal open while developing:

```bash
python discord_listener_bot.py
```

Press `Ctrl+C` to stop.

### Option B: Background Service (Production - macOS)

Create launchd service:

```bash
# Create plist file
cat > ~/Library/LaunchAgents/com.odin.discord-listener.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.odin.discord-listener</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>/Users/odinclaw/.openclaw-odin/workspace/skills/discord-listener/discord_listener_bot.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/odinclaw/.openclaw-odin/workspace/skills/discord-listener</string>
    <key>StandardOutPath</key>
    <string>/tmp/odin-discord-listener.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/odin-discord-listener-error.log</string>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF

# Load service
launchctl load ~/Library/LaunchAgents/com.odin.discord-listener.plist

# Check status
launchctl list | grep discord-listener

# Stop service
launchctl unload ~/Library/LaunchAgents/com.odin.discord-listener.plist
```

---

## Troubleshooting

### Bot doesn't respond

**Check 1: Is bot online?**
- Look in Discord server member list
- Should show as "online" in green

**Check 2: Does bot have permissions?**
- Right-click channel → Edit Channel
- Check Odin bot has "Send Messages" permission
- Check bot has "Read Messages" permission

**Check 3: Is Message Content Intent enabled?**
- Go to Discord Developer Portal → Bot → GATEWAY INTENTS
- Toggle ON "Message Content Intent"

**Check 4: Is token correct?**
- Check .env has correct DISCORD_TOKEN
- Token should start with "OTc..." or "MT..."

**Check 5: Check logs**
- Terminal output should show errors
- Check `/tmp/odin-discord-listener.log` if running as service

### Bot crashes immediately

```
discord.errors.LoginFailure: Improper token has been passed.
```

**Solution**: Token is wrong. Get new one from Discord Developer Portal.

### "Channel not found" errors

**Solution**: Check channel names in AGENT_CHANNELS match your Discord channels exactly (case-sensitive).

---

## What's Next

Once the bot is running:

1. **Test in #apollo**: Post a message, bot should respond
2. **Monitor logs**: Watch terminal for activity
3. **Update agent logic**: The `generate_agent_response()` function in `discord_listener_bot.py` currently returns a basic response. Replace this with actual Claude-based agent logic.

---

## Full Agent Response Implementation (TODO)

Currently, bot responds with a placeholder. To make agents actually embody their personality:

1. Call Claude API with:
   - User message
   - Agent's SOUL.md (personality)
   - Agent's AGENTS.md (workflow)
   - Agent's memory files (learnings)

2. Claude generates response as that agent

3. Response lands in agent's memory file

4. Next time agent is invoked, they read updated memory → smarter response

This is the compounding learning system.

---

## Architecture Diagram

```
Discord Server
    ↓
User posts in #apollo: "Test message"
    ↓
discord.py on_message event fires
    ↓
Bot sees: author=user, channel=apollo, unprocessed
    ↓
Router: channel "apollo" → agent "Apollo"
    ↓
Load Apollo's files:
  - agents/apollo/SOUL.md
  - agents/apollo/AGENTS.md
  - shared-context/THESIS.md
  - shared-context/FEEDBACK-LOG.md
    ↓
Generate response (call Claude with context)
    ↓
Apollo responds in #apollo (mentions user)
    ↓
Log to agents/apollo/memory/YYYY-MM-DD.md
    ↓
Next time Apollo is invoked, they read updated memory → smarter
```

---

## Questions?

Check `SKILL.md` for full documentation.
Check `discord_listener_bot.py` comments for code walkthrough.

Good luck!
