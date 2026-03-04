#!/bin/bash

# Loki Heartbeat Trigger
# Invoke Loki's heartbeat monitoring routine
# Add to cron: */30 * * * * /Users/odinclaw/.openclaw-odin/workspace/agents/loki/trigger-heartbeat.sh

PROFILE="odin"
LOKI_CHANNEL="1478591775558996122"  # #loki

MESSAGE="Read HEARTBEAT.md. Check cron list. For each failed job: report name, error status, last error message, and specific fix. If all OK, post '✅ Heartbeat OK'. Post findings to #loki."

openclaw --profile "$PROFILE" agent \
  --agent loki \
  --message "$MESSAGE" \
  --channel discord \
  --deliver \
  --reply-channel discord \
  --reply-to "channel:$LOKI_CHANNEL"

# Optional: Log execution
# echo "[$(date)] Loki heartbeat triggered" >> ~/.openclaw-odin/workspace/agents/loki/memory/heartbeat.log
