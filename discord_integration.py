#!/usr/bin/env python3
"""
Discord Integration for Odin
Listens to Discord messages and posts cron job results to appropriate channels.
"""

import os
import json
import asyncio
from pathlib import Path
from datetime import datetime

# Load environment
env_file = Path("/Users/odinclaw/.openclaw-odin/workspace/.env")
DISCORD_TOKEN = None

if env_file.exists():
    with open(env_file, 'r') as f:
        for line in f:
            if line.startswith('DISCORD_TOKEN='):
                DISCORD_TOKEN = line.split('=', 1)[1].strip()
                break

if not DISCORD_TOKEN:
    print("❌ DISCORD_TOKEN not found in .env")
    exit(1)

try:
    import discord
    from discord.ext import commands
except ImportError:
    print("❌ discord.py not installed. Installing...")
    os.system("pip install discord.py -q")
    import discord
    from discord.ext import commands

# Channel mapping
CHANNEL_MAP = {
    "heartbeat": "status-heartbeat",
    "cron": "cron-jobs",
    "agents": "agents",
    "projects": "projects",
    "usage": "usage-limits",
    "docs": "docudigest",
    "workshop": "workshop",
    "general": "odin-general",
}

class OdinBot(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.guild = None
        self.channels = {}

    async def cog_load(self):
        """Called when cog loads"""
        print("✅ Odin Discord integration loaded")
        # Get guild and channels on first ready event
        if not self.guild:
            await self._setup_channels()

    @commands.Cog.listener()
    async def on_ready(self):
        """Called when bot connects"""
        if not self.guild:
            await self._setup_channels()
        print(f"✅ Odin connected as {self.bot.user}")

    async def _setup_channels(self):
        """Cache guild and channel IDs"""
        if self.bot.guilds:
            self.guild = self.bot.guilds[0]
            print(f"📍 Guild: {self.guild.name}")
            
            # Cache channels
            for channel_type, channel_name in CHANNEL_MAP.items():
                ch = discord.utils.get(self.guild.text_channels, name=channel_name)
                if ch:
                    self.channels[channel_type] = ch
                    print(f"   ✅ #{channel_name}")
                else:
                    print(f"   ❌ #{channel_name} not found")

    async def post_message(self, channel_type, message, embed=None):
        """Post a message to a specific channel type"""
        ch = self.channels.get(channel_type)
        if not ch:
            print(f"⚠️  Channel '{channel_type}' not found")
            return
        
        try:
            if embed:
                await ch.send(embed=embed)
            else:
                await ch.send(message)
            return True
        except Exception as e:
            print(f"❌ Failed to post to #{ch.name}: {e}")
            return False

    async def post_heartbeat(self, status_text):
        """Post heartbeat status"""
        embed = discord.Embed(
            title="❤️ Heartbeat",
            description=status_text,
            color=discord.Color.green(),
            timestamp=datetime.now()
        )
        await self.post_message("heartbeat", embed=embed)

    async def post_cron_result(self, job_name, result, status="success"):
        """Post cron job result"""
        color = discord.Color.green() if status == "success" else discord.Color.red()
        embed = discord.Embed(
            title=f"⏰ {job_name}",
            description=f"```\n{result[:2000]}\n```",  # Truncate to Discord limit
            color=color,
            timestamp=datetime.now()
        )
        embed.set_footer(text=status.upper())
        await self.post_message("cron", embed=embed)

    @commands.Cog.listener()
    async def on_message(self, message):
        """Listen for messages in #odin-general"""
        if message.author == self.bot.user:
            return
        
        if message.channel.name == "odin-general":
            # User sent a message in odin-general
            # You can add command handling here
            print(f"📨 {message.author}: {message.content}")
            # For now, just acknowledge
            if message.content.lower() == "ping":
                await message.reply("pong! 🎯")


def main():
    """Start the Discord bot"""
    intents = discord.Intents.default()
    intents.message_content = True
    
    bot = commands.Bot(command_prefix="!", intents=intents)
    
    @bot.event
    async def on_ready():
        print(f"✅ {bot.user} is ready")
        # Add cog
        await bot.add_cog(OdinBot(bot))
    
    print("🚀 Starting Odin Discord bot...")
    try:
        bot.run(DISCORD_TOKEN)
    except Exception as e:
        print(f"❌ Bot error: {e}")


if __name__ == "__main__":
    main()
