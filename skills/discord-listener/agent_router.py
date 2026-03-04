"""Agent routing logic - maps Discord channels to agents"""

from pathlib import Path
from typing import Optional, Dict
from config import WORKSPACE_PATH

# Channel name to agent name mapping
CHANNEL_TO_AGENT = {
    "apollo": "Apollo",
    "buddha": "Buddha",
    "hermes": "Hermes",
    "chronus": "Chronus",
    "hercules": "Hercules",
    "zeus": "Zeus",
    "tesla": "Tesla",
    "beelzebub": "Beelzebub",
    "adam": "Adam",
    "sasaki": "Sasaki",
    "hades": "Hades",
    "shiva": "Shiva",
    "qin": "Qin",
}

def get_agent_for_channel(channel_name: str) -> Optional[Dict]:
    """
    Get agent info for a channel
    
    Args:
        channel_name: Discord channel name (e.g., "apollo")
    
    Returns:
        Dict with agent info or None if not an agent channel
        {
            "name": "Apollo",
            "folder": "apollo",
            "channel_name": "apollo"
        }
    """
    if channel_name not in CHANNEL_TO_AGENT:
        return None
    
    agent_name = CHANNEL_TO_AGENT[channel_name]
    agent_folder = channel_name
    
    # Verify agent folder exists
    agent_path = Path(WORKSPACE_PATH) / "agents" / agent_folder
    if not agent_path.exists():
        print(f"⚠️  Agent folder not found: {agent_path}")
        return None
    
    return {
        "name": agent_name,
        "folder": agent_folder,
        "channel_name": channel_name,
        "path": agent_path
    }

def load_agent_files(agent: dict) -> dict:
    """
    Load all required files for an agent
    
    Args:
        agent: Agent info dict from get_agent_for_channel
    
    Returns:
        Dict with loaded file contents:
        {
            "soul": "...",
            "identity": "...",
            "agents": "...",
            "thesis": "...",
            "feedback_log": "...",
            "memory": "..."
        }
    """
    files = {}
    
    agent_path = agent["path"]
    workspace_path = Path(WORKSPACE_PATH)
    
    # Agent-specific files
    files["soul"] = _read_file(agent_path / "SOUL.md")
    files["identity"] = _read_file(agent_path / "IDENTITY.md")
    files["agents"] = _read_file(agent_path / "AGENTS.md")
    
    # Shared context files
    files["thesis"] = _read_file(workspace_path / "shared-context" / "THESIS.md")
    files["feedback_log"] = _read_file(workspace_path / "shared-context" / "FEEDBACK-LOG.md")
    
    # Agent memory
    memory_file = agent_path / "memory" / "MEMORY.md"
    files["memory"] = _read_file(memory_file) if memory_file.exists() else ""
    
    return files

def _read_file(path: Path) -> str:
    """Safely read file contents"""
    try:
        if path.exists():
            return path.read_text()
        return ""
    except Exception as e:
        print(f"⚠️  Error reading {path}: {e}")
        return ""

def should_respond(message_obj, agent_info: dict) -> bool:
    """
    Determine if bot should respond to this message
    
    Rules:
    - Don't respond to bot's own messages
    - Don't respond if message already has replies
    - Only respond to user messages (not system messages)
    """
    # Skip bot's own messages
    if message_obj.author.bot:
        return False
    
    # Skip if message already has replies from Odin bot
    # (This prevents duplicate responses)
    # We'd check message_obj.replies here if available
    
    return True
