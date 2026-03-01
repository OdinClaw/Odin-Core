#!/usr/bin/env python3
"""
Helper to post messages to Discord from cron jobs or shell scripts.
Usage: python post_to_discord.py <channel_type> <message>
       python post_to_discord.py heartbeat "System is running"
       python post_to_discord.py cron "Job completed successfully"
"""

import sys
import json
import asyncio
import subprocess
import urllib.request
from pathlib import Path

def get_token():
    """Load Discord token from .env"""
    env_file = Path("/Users/odinclaw/.openclaw-odin/workspace/.env")
    if not env_file.exists():
        print("❌ .env file not found")
        return None
    
    with open(env_file, 'r') as f:
        for line in f:
            if line.startswith('DISCORD_TOKEN='):
                return line.split('=', 1)[1].strip()
    return None

def get_guild_id():
    """Cache guild ID"""
    cache_file = Path("/Users/odinclaw/.openclaw-odin/workspace/.discord_cache.json")
    
    if cache_file.exists():
        try:
            with open(cache_file, 'r') as f:
                data = json.load(f)
                return data.get("guild_id")
        except:
            pass
    return None

def post_message_sync(channel_type, message, token):
    """Post message via Discord REST API using curl"""
    
    channel_map = {
        "heartbeat": "status-heartbeat",
        "cron": "cron-jobs",
        "agents": "agents",
        "projects": "projects",
        "usage": "usage-limits",
        "docs": "docudigest",
        "workshop": "workshop",
        "general": "odin-general",
    }
    
    channel_name = channel_map.get(channel_type, channel_type)
    
    # Get guild ID via curl
    try:
        result = subprocess.run([
            "curl", "-s",
            "-H", f"Authorization: Bot {token}",
            "https://discord.com/api/v10/users/@me/guilds"
        ], capture_output=True, text=True, timeout=10)
        
        guilds = json.loads(result.stdout)
        if not guilds:
            print("❌ Bot not in any guilds")
            return False
        guild_id = guilds[0]["id"]
    except Exception as e:
        print(f"❌ Failed to get guild: {e}")
        return False
    
    # Get channel ID
    try:
        result = subprocess.run([
            "curl", "-s",
            "-H", f"Authorization: Bot {token}",
            f"https://discord.com/api/v10/guilds/{guild_id}/channels"
        ], capture_output=True, text=True, timeout=10)
        
        channels = json.loads(result.stdout)
        channel_id = None
        for ch in channels:
            if ch["name"] == channel_name:
                channel_id = ch["id"]
                break
        if not channel_id:
            print(f"❌ Channel #{channel_name} not found")
            return False
    except Exception as e:
        print(f"❌ Failed to get channels: {e}")
        return False
    
    # Post message via curl
    try:
        result = subprocess.run([
            "curl", "-s", "-X", "POST",
            "-H", f"Authorization: Bot {token}",
            "-H", "Content-Type: application/json",
            "-d", json.dumps({"content": message}),
            f"https://discord.com/api/v10/channels/{channel_id}/messages"
        ], capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            print(f"✅ Posted to #{channel_name}")
            return True
        else:
            print(f"❌ Curl error: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ Failed to post message: {e}")
        return False

def main():
    if len(sys.argv) < 3:
        print("Usage: post_to_discord.py <channel_type> <message>")
        print("\nChannel types: heartbeat, cron, agents, projects, usage, docs, workshop, general")
        sys.exit(1)
    
    channel_type = sys.argv[1]
    message = sys.argv[2]
    
    token = get_token()
    if not token:
        print("❌ DISCORD_TOKEN not configured")
        sys.exit(1)
    
    success = post_message_sync(channel_type, message, token)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
