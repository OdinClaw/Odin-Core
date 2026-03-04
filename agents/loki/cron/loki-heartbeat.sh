#!/bin/bash

# Loki Heartbeat Monitor
# Runs every 30 min to check cron job status and report to #loki

openclaw --profile odin agent --agent loki << 'PROMPT'
Read your HEARTBEAT.md protocol. Then:

1. Query cron status: cron list
2. Check for ANY jobs with lastStatus: "error"
3. For each failed job:
   - Job name
   - Error status (count of consecutive errors)
   - Last error message
   - Specific fix recommendation
4. If all jobs OK: report "✅ Heartbeat OK"
5. Post findings to #loki

Go.
PROMPT
