#!/bin/bash

echo "=== Loki Heartbeat System Status ==="
echo ""

echo "✓ launchd Job:"
launchctl list | grep loki || echo "  ⚠️ Not loaded"

echo ""
echo "✓ Next Run (approx):"
nextrun=$(cat ~/Library/LaunchAgents/ai.openclaw.loki-heartbeat.plist 2>/dev/null | grep -A1 StartInterval | tail -1 | sed 's/[^0-9]//g')
if [ -n "$nextrun" ]; then
  echo "  Every $nextrun seconds ($(( nextrun / 60 )) minutes)"
else
  echo "  ⚠️ Could not determine"
fi

echo ""
echo "✓ Recent Logs:"
echo "  Stdout: tail /tmp/loki-heartbeat.log"
echo "  Stderr: tail /tmp/loki-heartbeat-error.log"

echo ""
echo "✓ Manual Trigger:"
echo "  bash ~/.openclaw-odin/workspace/agents/loki/trigger-heartbeat.sh"

echo ""
echo "✓ View Loki's Memory:"
echo "  cat ~/.openclaw-odin/workspace/agents/loki/memory/2026-03-04.md"

echo ""
echo "=== System is LIVE ==="
