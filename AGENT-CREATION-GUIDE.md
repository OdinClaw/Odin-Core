# AGENT-CREATION-GUIDE.md — How to Build Real OpenClaw Agents

_For Odin: This is your playbook for creating real isolated agents without needing to go back to Claude Code. Follow it exactly._

---

## What Makes an Agent "Real"

A real agent is NOT just a folder with some markdown files. A real isolated agent requires **four things**:

1. **CLI Registration** — `openclaw agents add <id>` creates the agent directory and registers it
2. **Workspace Files** — Identity/memory stack in the agent's workspace folder
3. **Discord Routing** — Rules in `openclaw.json` that tell OpenClaw which channels route to which agent
4. **Model Config** — Set in `openclaw.json` per-agent (can override defaults)

Without all four, the agent either doesn't exist or just shadows the main agent.

---

## Step-by-Step: Creating a New Agent

### Step 1: Register the Agent via CLI

```bash
openclaw agents add <agent-id> --profile odin
```

- `<agent-id>` must be lowercase, no spaces (e.g., `loki`, `hermes`, `apollo`)
- This creates: `~/.openclaw-odin/agents/<agent-id>/`
- The agent directory will have: `agent/`, `sessions/`

**Verify it worked:**
```bash
openclaw agents list --profile odin
```

---

### Step 2: Create the Workspace Directory

OpenClaw doesn't auto-create the workspace. Do it manually:

```bash
mkdir -p ~/.openclaw-odin/workspace/agents/<agent-id>
mkdir -p ~/.openclaw-odin/workspace/agents/<agent-id>/memory
```

---

### Step 3: Write the Identity Stack (6 files)

Every agent needs these files. Adapt each one to the agent's personality and role.

#### File 1: SOUL.md (WHO they are)
```
# SOUL.md — [Agent Name]

## Core Identity

[2-3 sentences describing who this agent is, their personality, their way of being]

## Role

[What specific function do they serve in the system? What are they NOT responsible for?]

## Principles

- [3-5 bullet points defining how they operate]

## Boundaries

- [What they won't do / what falls outside their scope]

## Model Awareness

Primary model: [e.g., anthropic/claude-haiku-4-5-20251001]
Fallbacks: [list per escalation chain]
Sub-agents: [model for any sub-tasks they spin up]
```

#### File 2: IDENTITY.md (Context about their role in the system)
```
# IDENTITY.md — [Agent Name]

## Who I Am

Name: [Agent Name]
Role: [One-line role description]
System: Odin's agent network
Owner: [User's name]

## My Place in the Network

[How do I relate to Odin and other agents? Do I report to Odin? Am I independent?]

## Communication

Primary channel: Discord #[channel-name] (ID: [channel-id])
I do NOT respond to other channels unless explicitly routed there.

## Coordination

[How do I share information with other agents? (e.g., write to shared-context/, notify Odin)]
```

#### File 3: USER.md (Who they're serving)
```
# USER.md — [Agent Name]

## User Context

Name: [User's name]
Discord: [Discord handle + ID]
Primary language: English

## What This User Needs From Me

[2-3 sentences about what the user specifically wants from THIS agent]

## Preferences

- [How does the user like to communicate with this agent?]
- [Any specific output formats, styles, or constraints?]
```

#### File 4: AGENTS.md (Awareness of the multi-agent system)
```
# AGENTS.md — [Agent Name]

## The Network

I am part of a multi-agent system. Here are the key agents:

- **Odin** (main) — Orchestrator, handles general requests, Discord #odin-general
- **[This Agent]** — [This agent's role]
- [Add others as they are created]

## Coordination Rules

1. Do not duplicate work another agent is doing
2. If a task falls outside my scope, note it in shared-context/ for Odin to handle
3. Never speak AS other agents — stay in my own voice
4. Write outputs to workspace files when other agents might need them
```

#### File 5: HEARTBEAT.md (Periodic self-check template)
```
# HEARTBEAT.md — [Agent Name]

## Heartbeat Protocol

Every N hours (or when triggered), perform a self-check:

1. Review recent activity in my channel
2. Check shared-context/ for anything relevant to my role
3. Check memory/ for anything that needs follow-up
4. If no activity: confirm I am alive and listening

## Current Status

Last heartbeat: [Will be updated automatically]
Status: Active
Channel: #[channel-name]
```

#### File 6: MEMORY.md (Persistent memory — starts minimal)
```
# MEMORY.md — [Agent Name]

## Created

[Date]

## Purpose

[One sentence: what this agent does and why they exist]

## Key Knowledge

[Start empty — Odin will populate this as the agent learns things]

## Important Context

[Any critical setup notes, known issues, or configuration details]
```

---

### Step 4: Configure auth-profiles.json for the Agent

The new agent needs its own auth-profiles.json. Copy the main one:

```bash
cp ~/.openclaw-odin/agents/main/agent/auth-profiles.json \
   ~/.openclaw-odin/agents/<agent-id>/agent/auth-profiles.json
```

The file should contain:
```json
{
  "version": 1,
  "profiles": {
    "anthropic:default": {
      "type": "token",
      "provider": "anthropic",
      "token": "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"
    },
    "ollama:default": {
      "type": "api_key",
      "provider": "ollama",
      "key": "ollama-local"
    }
  },
  "lastGood": {
    "anthropic": "anthropic:default",
    "ollama": "ollama:default"
  }
}
```

**⚠️ CRITICAL:** The ollama entry MUST use `"key"` not `"token"`. OpenClaw reads `cred.key` for `type: "api_key"` entries. Wrong field = silent failure.

---

### Step 5: Discord Routing — IMPORTANT LIMITATION

**OpenClaw 2026.3.2 does NOT support routing different Discord channels to different agents through JSON config.**

Specifically:
- Adding `"agent": "<id>"` or `"agentId": "<id>"` to a channel config is **rejected** by schema validation
- The `bindings` system only matches on `channel` (platform) + `accountId` — NOT on specific Discord channel IDs
- There is no way to say "route #agents to Loki and #odin-general to Odin" using the same Discord bot token

**Available routing approaches (choose one):**

#### Option A: Separate Discord Bot Token (Recommended for full isolation)
Give the new agent its own Discord bot with its own token:
1. Create a new bot in Discord Developer Portal
2. Add the new token to the agent's `channels.discord.token` config (or a new profile)
3. Now messages @Loki → Loki's bot, messages to Odin → Odin's bot
4. Invite both bots to the server; users ping the right one

#### Option B: Direct CLI Invocation (Useful for scheduled/cron tasks)
Invoke the agent directly without Discord routing:
```bash
echo "Your prompt here" | openclaw --profile odin agent --agent loki
```
Good for: cron jobs, heartbeat tasks, manual invocation from terminal

#### Option C: Binding to Entire Platform (One agent owns all Discord)
Bind the new agent to take ALL Discord messages:
```json
"bindings": [
  {
    "agentId": "loki",
    "match": {
      "channel": "discord",
      "accountId": "default"
    }
  }
]
```
⚠️ This makes the new agent respond to EVERY Discord message — Odin would no longer handle Discord at all. Only use if this agent is meant to replace Odin on Discord.

#### Option D: Keyword/Mention Routing via Odin
Configure Odin to detect `@Loki` prefixes and explicitly route to Loki's session. This requires Odin to be programmed with a routing rule in its HEARTBEAT.md or AGENTS.md. Not natively supported — would need to be implemented as a skill.

**⚠️ CRITICAL (still applies):** Discord channel and user IDs MUST be strings in JSON (quoted). `583319870511513611` as a number → `583319870511513600` (precision loss).

---

### Step 6: Verify Agent Registration

After running `openclaw agents add`, verify the agent is properly registered:

```bash
openclaw --profile odin agents list --json
```

The output should show your new agent with its workspace and agentDir paths. If it shows, the registration worked. The model comes from the `--model` flag you passed to `agents add`.

You can also validate config is clean:
```bash
openclaw --profile odin config validate
```

---

### Step 7: Restart the Gateway

```bash
launchctl unload /Users/odinclaw/Library/LaunchAgents/ai.openclaw.odin.plist
sleep 3
launchctl load /Users/odinclaw/Library/LaunchAgents/ai.openclaw.odin.plist
```

**Verify the new agent loaded:**
```bash
# Check logs for agent model line
ls -t /tmp/openclaw/openclaw-*.log | head -1 | xargs grep "agent model"
```

---

### Step 8: Test in Discord

Send a message in the channel routed to the new agent. If routing works correctly, the new agent responds (not Odin). You can verify by asking: "What agent are you? What's your name?"

---

## Quick Reference Checklist

```
[ ] openclaw agents add <id> --profile odin
[ ] mkdir workspace/agents/<id> + memory/
[ ] Write SOUL.md, IDENTITY.md, USER.md, AGENTS.md, HEARTBEAT.md, MEMORY.md
[ ] Copy auth-profiles.json to agents/<id>/agent/ (verify "key" field for ollama)
[ ] Add agents.agents.<id> block to openclaw.json
[ ] Add channel routing with "agent": "<id>" to openclaw.json channels
[ ] Restart gateway
[ ] Test in Discord channel
```

---

## Example: Loki Agent Creation

For reference, Loki was created as the first real isolated agent:

- **Agent ID:** `loki`
- **Personality:** Mischievous, strategic trickster. Good at lateral thinking, finding creative solutions, and poking holes in plans.
- **Role:** Devil's advocate, red-teaming, creative problem-solving, counter-intelligence to Odin's plans
- **Discord Channel:** #agents (1477459670804205619) — but can be reconfigured
- **Model:** Haiku primary (same escalation chain as Odin)
- **Workspace:** `~/.openclaw-odin/workspace/agents/loki/`

---

## Known Issues & Gotchas

### "No API key found for provider ollama"
- `auth-profiles.json` uses `"token"` instead of `"key"` for the ollama entry
- Fix: Change `"token": "ollama-local"` → `"key": "ollama-local"` (type: api_key reads `cred.key`)
- Also ensure `auth.order` in `openclaw.json` has `"ollama": ["ollama:default"]`

### Agent uses wrong model / falls back to old model
- Sessions bake the model at creation time
- Fix: Delete the session entry from `agents/<id>/sessions/sessions.json` AND archive the JSONL file
- Then restart gateway so a fresh session is created on next message

### Discord messages route to Odin instead of new agent
- The `"agent": "<id>"` key is missing from the channel config in `openclaw.json`
- Or the channel ID is wrong (verify it's a string, not number)
- Gateway may need restart after JSON changes

### Discord channel IDs lose precision
- 64-bit integers like `583319870511513611` lose 11 when stored as JSON numbers
- ALWAYS use string format: `"583319870511513611"` — quote everything

### Agent directory not found on startup
- `openclaw agents add` must be run before the workspace files are created
- The CLI creates the directory structure; manual folder creation alone isn't enough

---

_This guide was created so Odin can build future agents autonomously. Update this file as you discover new patterns._
