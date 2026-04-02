#!/bin/bash
# Loki Heartbeat Trigger — circuit breaker + degraded-mode handler
#
# Flow:
#   1. Circuit breaker gate — if previous run failed and backoff not expired, skip
#   2. Degraded mode check  — if all cloud providers unavailable, post deterministic
#                             response directly to Discord (no openclaw needed)
#   3. Run openclaw         — invoke Loki's heartbeat via Discord (normal path)
#   4. Record outcome       — success resets backoff; failure applies exponential backoff
#
# Backoff schedule (consecutive failures → wait before next attempt):
#   1 failure → 2 min
#   2 failures → 4 min
#   3 failures → 8 min
#   4 failures → 16 min
#   5 failures → 32 min  ← blocks one 30-min heartbeat window
#   6 failures → 64 min  ← blocks two windows
#   7+ failures → 60 min (cap)

PROFILE="odin"
BASE_DIR="$HOME/.openclaw-odin"
CB_SCRIPT="$BASE_DIR/scripts/request-circuit-breaker.mjs"
DM_SCRIPT="$BASE_DIR/scripts/degraded-mode.mjs"
THROTTLE_SCRIPT="$BASE_DIR/scripts/groq-throttle.mjs"
REGISTRY_FILE="$BASE_DIR/scripts/provider-registry.json"
HEARTBEAT_LOG="/tmp/loki-heartbeat.log"
CB_LOG="/tmp/loki-heartbeat-circuit.log"
CALLER_LABEL="loki-heartbeat"

MESSAGE="Read HEARTBEAT.md. Check cron list. For each failed job: report name, error status, last error message, and specific fix. If all OK, post '✅ Heartbeat OK'. Post findings to #loki."

ts()            { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
log_heartbeat() { echo "[$(ts)] $1" >> "$HEARTBEAT_LOG"; }
log_circuit()   { echo "[$(ts)] [circuit] $1" >> "$CB_LOG"; }

# ── 1. Circuit breaker gate check ────────────────────────────────────────────
GATE_JSON=$(node "$CB_SCRIPT" gate "$CALLER_LABEL" "utility_local" 2>/dev/null)
GATE_EXIT=$?

if [ $GATE_EXIT -ne 0 ]; then
  REMAINING_S=$(echo "$GATE_JSON" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(round(d.get('backoffMs',0)/1000))" 2>/dev/null || echo "?")
  REASON=$(echo "$GATE_JSON" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('reason','unknown'))" 2>/dev/null || echo "unknown")

  log_circuit "BLOCKED — backoff active. Remaining: ${REMAINING_S}s. Reason: $REASON"
  log_heartbeat "SKIPPED — circuit breaker in backoff (${REMAINING_S}s remaining, $REASON)"
  exit 0
fi

# Extract requestId from gate JSON
REQUEST_ID=$(echo "$GATE_JSON" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d.get('requestId',''))" 2>/dev/null || echo "")

log_circuit "OPEN — request $REQUEST_ID created"

# ── 2. Degraded mode check ────────────────────────────────────────────────────
# If all cloud providers are unavailable (Anthropic + Groq both down or
# inference-rate-limited), serve a deterministic heartbeat response directly
# to Discord without invoking openclaw.
node "$DM_SCRIPT" check 2>/dev/null
DEGRADED_EXIT=$?

if [ $DEGRADED_EXIT -ne 0 ]; then
  log_heartbeat "DEGRADED MODE — posting deterministic response (skipping openclaw)"
  log_circuit "Degraded mode active — invoking handle-heartbeat"

  DM_RESULT=$(node "$DM_SCRIPT" handle-heartbeat 2>/dev/null)
  DM_EXIT=$?
  DM_METHOD=$(echo "$DM_RESULT" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('method','unknown'))" 2>/dev/null || echo "unknown")
  DM_POSTED=$(echo "$DM_RESULT" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('posted',False))" 2>/dev/null || echo "False")

  log_heartbeat "Degraded response dispatched: method=$DM_METHOD posted=$DM_POSTED"
  log_circuit "Degraded handler done (exit $DM_EXIT, method=$DM_METHOD, posted=$DM_POSTED)"

  # Record as success if the degraded response posted OK (satisfies the monitoring cycle)
  # Record as failure if even the fallback couldn't post (allows backoff to kick in)
  if [ -n "$REQUEST_ID" ]; then
    if [ "$DM_POSTED" = "True" ]; then
      node "$CB_SCRIPT" complete "$REQUEST_ID" success 2>/dev/null
      log_circuit "Degraded cycle marked SUCCESS (Discord post confirmed)"
    else
      node "$CB_SCRIPT" complete "$REQUEST_ID" failure 2>/dev/null
      log_circuit "Degraded cycle marked FAILURE (Discord post failed)"
    fi
  fi

  exit 0
fi

# ── 3a. Groq throttle check (only when Groq is the active provider) ───────────
# When Anthropic is in cooldown (mode=groq_fallback), all openclaw inference
# requests route through Groq. Enforce rate limits before invoking openclaw:
#   - Max 1 request every 2 seconds (inter-request spacing)
#   - Max 20 requests per 60s sliding window
#
# Health probes (GET /models) bypass this check entirely — only inference is
# throttled. The probeGroq() in provider-health-monitor.mjs uses GET /models.
#
# Throttle events are marked as circuit SUCCESS (not failure) — the circuit
# breaker must not apply exponential backoff for infrastructure rate management.
PROVIDER_MODE=$(node -e "try{const r=JSON.parse(require('fs').readFileSync('$REGISTRY_FILE','utf8'));process.stdout.write(r.mode)}catch(e){process.stdout.write('normal')}" 2>/dev/null || echo "normal")

if [ "$PROVIDER_MODE" = "groq_fallback" ]; then
  log_heartbeat "Mode: groq_fallback — checking Groq throttle"

  # Drain the queue first: dispatch any deferred requests whose window has cleared
  QUEUE_RESULT=$(node "$THROTTLE_SCRIPT" process-queue 2>/dev/null)
  QUEUE_DISPATCHED=$(echo "$QUEUE_RESULT" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(len(d.get('dispatched',[])))" 2>/dev/null || echo "0")
  QUEUE_DROPPED=$(echo "$QUEUE_RESULT" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('dropped',0))" 2>/dev/null || echo "0")

  if [ "$QUEUE_DISPATCHED" -gt 0 ] 2>/dev/null; then
    log_heartbeat "Throttle queue: dispatched ${QUEUE_DISPATCHED} deferred request(s)"
  fi
  if [ "$QUEUE_DROPPED" -gt 0 ] 2>/dev/null; then
    log_heartbeat "Throttle queue: dropped ${QUEUE_DROPPED} stale entry(s) (>5 min old)"
  fi

  # Try to acquire a Groq inference slot for this request
  THROTTLE_JSON=$(node "$THROTTLE_SCRIPT" acquire "$CALLER_LABEL" "heartbeat-trigger" 2>/dev/null)
  THROTTLE_EXIT=$?

  if [ $THROTTLE_EXIT -ne 0 ]; then
    WAIT_S=$(echo "$THROTTLE_JSON" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(round(d.get('waitMs',2000)/1000,1))" 2>/dev/null || echo "?")
    READY_AT=$(echo "$THROTTLE_JSON" | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print(d.get('readyAt',''))" 2>/dev/null || echo "")

    log_heartbeat "THROTTLED — Groq rate limit active (wait ${WAIT_S}s, ready: $READY_AT)"
    log_circuit "THROTTLED by Groq throttle — queuing request (wait ${WAIT_S}s)"

    # Queue this run so the next scheduled trigger can pick it up
    node "$THROTTLE_SCRIPT" enqueue "$CALLER_LABEL" "heartbeat-trigger" 2>/dev/null

    # Mark circuit SUCCESS — throttling is not a provider failure; no backoff should apply
    if [ -n "$REQUEST_ID" ]; then
      node "$CB_SCRIPT" complete "$REQUEST_ID" success 2>/dev/null
      log_circuit "Circuit breaker: marked SUCCESS (Groq throttle ≠ provider failure)"
    fi

    exit 0
  fi

  log_heartbeat "Groq throttle — slot acquired (proceeding with openclaw)"
fi

# ── 3a. Gateway pre-check — abort if gateway is unreachable ───────────────────
# If the gateway is down, openclaw falls back to embedded mode which has no
# Discord channel context. This causes "Discord recipient is required" errors
# that loop indefinitely. Skip the heartbeat entirely; the gateway watchdog
# will restore the service. This is NOT recorded as a circuit-breaker failure.
GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
GATEWAY_TOKEN="1b10607665b5a745cd27b22a77fa7957a2e5b297452c8e39"
GATEWAY_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 4 \
  -H "Authorization: Bearer $GATEWAY_TOKEN" \
  "http://127.0.0.1:${GATEWAY_PORT}/health" 2>/dev/null)

if [ "$GATEWAY_CODE" != "200" ]; then
  log_heartbeat "SKIP — gateway not reachable (HTTP ${GATEWAY_CODE:-000}); watchdog will restore it"
  log_circuit "Gateway unreachable — heartbeat skipped (not a provider failure)"
  # Mark circuit SUCCESS: gateway down is infrastructure state, not heartbeat failure
  if [ -n "$REQUEST_ID" ]; then
    node "$CB_SCRIPT" complete "$REQUEST_ID" success 2>/dev/null
    log_circuit "Circuit breaker: marked SUCCESS (gateway-down skip)"
  fi
  exit 0
fi

# ── 3. Invoke Loki via openclaw (normal path) ─────────────────────────────────
# Hard timeout: 60 seconds. If openclaw does not return within this window,
# the process is killed. Max 2 retries (RETRY_CAP) before giving up.
log_heartbeat "Starting heartbeat (requestId=$REQUEST_ID)"

HEARTBEAT_TIMEOUT=60
RETRY_CAP=2
OPENCLAW_EXIT=1
ATTEMPT=0

while [ $ATTEMPT -le $RETRY_CAP ]; do
  ATTEMPT=$(( ATTEMPT + 1 ))

  # Run openclaw with a hard timeout (background + timer, macOS-compatible)
  openclaw --profile "$PROFILE" agent \
    --agent loki \
    --message "$MESSAGE" \
    --channel discord \
    --deliver \
    --reply-account loki \
    --timeout "$HEARTBEAT_TIMEOUT" &
  OC_PID=$!

  # Watchdog timer: kill if the process outlives the timeout
  ( sleep $(( HEARTBEAT_TIMEOUT + 5 )); \
    kill -TERM $OC_PID 2>/dev/null; \
    sleep 3; \
    kill -9   $OC_PID 2>/dev/null ) &
  TIMER_PID=$!

  wait $OC_PID
  OPENCLAW_EXIT=$?

  # Cancel the timer
  kill $TIMER_PID 2>/dev/null
  wait $TIMER_PID 2>/dev/null

  if [ $OPENCLAW_EXIT -eq 0 ]; then
    break   # Success — stop retrying
  fi

  if [ $ATTEMPT -le $RETRY_CAP ]; then
    log_heartbeat "Attempt $ATTEMPT failed (exit $OPENCLAW_EXIT) — retrying ($ATTEMPT/$RETRY_CAP)"
    sleep 3
  fi
done

# ── 4. Record outcome ─────────────────────────────────────────────────────────
if [ -n "$REQUEST_ID" ]; then
  if [ $OPENCLAW_EXIT -eq 0 ]; then
    node "$CB_SCRIPT" complete "$REQUEST_ID" success 2>/dev/null
    log_circuit "SUCCESS — request $REQUEST_ID completed OK"
    log_heartbeat "Heartbeat completed OK"
  else
    node "$CB_SCRIPT" complete "$REQUEST_ID" failure 2>/dev/null
    log_circuit "FAILURE — request $REQUEST_ID failed (exit $OPENCLAW_EXIT) — backoff applied"
    log_heartbeat "Heartbeat FAILED (exit $OPENCLAW_EXIT) — circuit breaker backoff applied"
  fi
else
  log_circuit "WARNING — no requestId captured; outcome not recorded"
fi

exit 0
