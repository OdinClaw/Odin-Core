"""Configuration loader for Discord Listener Skill"""

import os
from dotenv import load_dotenv
from pathlib import Path

# Load .env file from skill directory
SKILL_DIR = Path(__file__).parent
load_dotenv(SKILL_DIR / ".env")

# Discord Configuration
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
DISCORD_GUILD_ID = int(os.getenv("DISCORD_GUILD_ID", "0"))
AGENT_CHANNELS = os.getenv("AGENT_CHANNELS", "").split(",")

# Workspace Configuration
WORKSPACE_PATH = os.getenv("WORKSPACE_PATH", "/Users/odinclaw/.openclaw-odin/workspace")

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Validation
if not DISCORD_TOKEN:
    raise ValueError("DISCORD_TOKEN not set in .env file")

if not DISCORD_GUILD_ID:
    raise ValueError("DISCORD_GUILD_ID not set in .env file")

if not AGENT_CHANNELS or AGENT_CHANNELS == [""] :
    raise ValueError("AGENT_CHANNELS not set in .env file")

if not Path(WORKSPACE_PATH).exists():
    raise ValueError(f"WORKSPACE_PATH {WORKSPACE_PATH} does not exist")

print(f"✅ Configuration loaded")
print(f"   Guild ID: {DISCORD_GUILD_ID}")
print(f"   Agent Channels: {', '.join(AGENT_CHANNELS)}")
print(f"   Workspace: {WORKSPACE_PATH}")
