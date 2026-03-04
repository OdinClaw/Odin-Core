#!/bin/bash

# Loki Heartbeat Trigger
# Invoke Loki's heartbeat monitoring routine (uses Discord binding from openclaw.json)
# Add to launchd: */30 * * * * /Users/odinclaw/.openclaw-odin/workspace/agents/loki/trigger-heartbeat.sh

PROFILE="odin"

MESSAGE="Read HEARTBEAT.md. Check cron list. For each failed job: report name, error status, last error message, and specific fix. If all OK, post '✅ Heartbeat OK'. Post findings to #loki."

openclaw --profile "$PROFILE" agent \
  --agent loki \
  --message "$MESSAGE" \
  --channel discord \
  --deliver \
  --reply-account loki

# Optional: Log execution
# echo "[$(date)] Loki heartbeat triggered" >> ~/.openclaw-odin/workspace/agents/loki/memory/heartbeat.log
