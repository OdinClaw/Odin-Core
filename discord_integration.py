#!/usr/bin/env python3
"""
Odin Discord Bot - Simple listener and responder
Listens to #odin-general and responds to messages.
"""

import os
from pathlib import Path
from datetime import datetime

# Load token
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
    print("Installing discord.py...")
    os.system("pip install discord.py -q")
    import discord
    from discord.ext import commands

# Create bot with all intents
intents = discord.Intents.all()
bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    """Bot is ready"""
    import sys
    msg = f"✅ {bot.user} is connected to Discord\n"
    msg += f"   Watching for messages in #odin-general...\n"
    print(msg, flush=True)
    
    # Get guild and channels
    if bot.guilds:
        guild = bot.guilds[0]
        print(f"   Guild: {guild.name}\n", flush=True)
        
        # Find odin-general channel
        for channel in guild.text_channels:
            if channel.name == "odin-general":
                print(f"   ✅ Found #{channel.name} (ID: {channel.id})\n", flush=True)
                break

@bot.event
async def on_message(message):
    """Listen for messages"""
    import sys
    # Log everything
    print(f"📨 MESSAGE RECEIVED: {message.author.name} in #{message.channel.name}: {message.content}\n", flush=True)
    
    # Ignore bot's own messages
    if message.author == bot.user:
        print(f"   (ignoring own message)\n", flush=True)
        return
    
    # Only respond in #odin-general
    if message.channel.name != "odin-general":
        print(f"   (ignoring message from #{message.channel.name})\n", flush=True)
        return
    
    # Log the message
    print(f"📨 {message.author.name}: {message.content}\n", flush=True)
    
    # Simple responses
    if message.content.lower() == "ping":
        await message.reply("pong! 🎯")
    elif message.content.lower() == "hello":
        await message.reply("Hey there! 👋 How can I help?")
    elif message.content.lower().startswith("status"):
        await message.reply("✅ System is running normally")
    else:
        # For now, acknowledge any other message
        await message.reply(f"Got it: `{message.content[:50]}`")

def main():
    print("🚀 Starting Odin Discord Bot...")
    print(f"Token: {DISCORD_TOKEN[:20]}...")
    
    try:
        bot.run(DISCORD_TOKEN)
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()
