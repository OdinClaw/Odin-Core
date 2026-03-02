"""
Discord Listener Bot - Proactive Agent Response System
Listens to Discord channels in real-time and routes messages to appropriate agents
"""

import discord
from discord.ext import commands
import logging
from datetime import datetime
from pathlib import Path

# Import local modules
from config import DISCORD_TOKEN, DISCORD_GUILD_ID, AGENT_CHANNELS, WORKSPACE_PATH, LOG_LEVEL
from agent_router import get_agent_for_channel, load_agent_files, should_respond

# Configure logging
logging.basicConfig(
    level=LOG_LEVEL,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create bot with intents
intents = discord.Intents.default()
intents.message_content = True  # Required for on_message
intents.guild_messages = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Track processed messages to avoid duplicates
processed_message_ids = set()

@bot.event
async def on_ready():
    """Bot initialization"""
    logger.info(f"✅ Bot logged in as {bot.user}")
    logger.info(f"   Guild ID: {DISCORD_GUILD_ID}")
    logger.info(f"   Listening to channels: {', '.join(AGENT_CHANNELS)}")
    
    # Set bot status
    activity = discord.Activity(
        type=discord.ActivityType.watching,
        name="all agent channels"
    )
    await bot.change_presence(activity=activity, status=discord.Status.online)

@bot.event
async def on_message(message):
    """
    Main event handler - fires when ANY message is sent in Discord server
    This is where agent response logic is triggered
    """
    
    # Skip if message ID already processed (prevents duplicate responses)
    if message.id in processed_message_ids:
        return
    
    # Get channel name
    channel_name = message.channel.name if hasattr(message.channel, 'name') else None
    
    if not channel_name:
        return
    
    # Check if this is an agent channel
    agent_info = get_agent_for_channel(channel_name)
    
    if not agent_info:
        # Not an agent channel, process as normal command
        await bot.process_commands(message)
        return
    
    # Check if we should respond to this message
    if not should_respond(message, agent_info):
        await bot.process_commands(message)
        return
    
    # Mark as processed
    processed_message_ids.add(message.id)
    
    # Log the incoming message
    logger.info(f"[{channel_name}] {message.author}: {message.content[:100]}")
    
    try:
        # Load agent files
        logger.debug(f"Loading agent files for {agent_info['name']}...")
        agent_files = load_agent_files(agent_info)
        
        # Show typing indicator
        async with message.channel.typing():
            # Generate response (this is where agent logic happens)
            response = await generate_agent_response(
                agent_info=agent_info,
                agent_files=agent_files,
                user_message=message.content,
                author=message.author
            )
            
            # Send response in same channel
            if response:
                # Split long responses if needed (Discord 2000 char limit)
                if len(response) > 1900:
                    for chunk in [response[i:i+1900] for i in range(0, len(response), 1900)]:
                        await message.reply(chunk, mention_author=False)
                else:
                    await message.reply(response, mention_author=False)
                
                logger.info(f"✅ Response sent to {agent_info['name']}")
                
                # Log to agent's daily memory
                await log_to_agent_memory(
                    agent_info=agent_info,
                    user_message=message.content,
                    agent_response=response,
                    author=message.author
                )
            
    except Exception as e:
        logger.error(f"❌ Error processing message: {e}", exc_info=True)
        await message.reply(f"Error: {str(e)[:100]}", mention_author=False)
    
    # Continue processing commands
    await bot.process_commands(message)

async def generate_agent_response(
    agent_info: dict,
    agent_files: dict,
    user_message: str,
    author: discord.User
) -> str:
    """
    Generate response as the agent
    
    This is where agent personality + logic happens.
    For MVP, this returns a simple acknowledgment.
    In full version, this would call Claude to generate response as agent.
    """
    
    agent_name = agent_info["name"]
    
    # MVP: Simple acknowledgment
    # In full implementation: Pass user_message + agent_files to Claude
    # Claude generates response as agent, lands in agent's memory
    
    response = f"**{agent_name}** received your message. Real implementation would respond as {agent_name} here with personality from SOUL.md."
    
    return response

async def log_to_agent_memory(
    agent_info: dict,
    user_message: str,
    agent_response: str,
    author: discord.User
):
    """
    Log interaction to agent's daily memory file
    agents/[name]/memory/YYYY-MM-DD.md
    """
    
    try:
        memory_dir = agent_info["path"] / "memory"
        memory_dir.mkdir(parents=True, exist_ok=True)
        
        # Today's date
        today = datetime.now().strftime("%Y-%m-%d")
        memory_file = memory_dir / f"{today}.md"
        
        # Entry format
        timestamp = datetime.now().strftime("%H:%M:%S")
        entry = f"""
### {timestamp} — Message from {author.name}
**User**: {user_message}
**Agent**: {agent_response}

---
"""
        
        # Append to memory file
        with open(memory_file, "a") as f:
            f.write(entry)
        
        logger.debug(f"Logged to {memory_file}")
        
    except Exception as e:
        logger.error(f"Error logging to memory: {e}")

def run():
    """Start the bot"""
    logger.info("Starting Discord Listener Bot...")
    logger.info(f"Token: {DISCORD_TOKEN[:20]}...")
    
    try:
        bot.run(DISCORD_TOKEN)
    except discord.errors.LoginFailure:
        logger.error("❌ Invalid Discord token. Check DISCORD_TOKEN in .env")
    except Exception as e:
        logger.error(f"❌ Bot error: {e}", exc_info=True)

if __name__ == "__main__":
    run()
