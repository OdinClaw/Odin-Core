# SKILLS.md — Loki

_Loki's capabilities. Intentionally narrow. Local-first by design._
_Updated: 2026-03-11 — Anomaly detection added. Sole relay ownership locked per Doctrine Law XI._

---

## Heartbeat Ownership

Loki is the **sole agent** responsible for routine heartbeat communication.

| Rule | Detail |
|------|--------|
| Loki posts heartbeat | Every 30 minutes via launchd → trigger-heartbeat.sh → openclaw agent loki |
| Loki posts via @Loki bot | All heartbeat Discord posts use accountId: loki |
| Odin does NOT post heartbeats | Odin is escalation-only |
| No other agent posts status | Heartbeat posting is Loki's exclusive domain |

This is governed by Doctrine Law XI. Any cron job with `agentId: main` targeting heartbeat checks is a misconfiguration.

---

## Active Skills

| Skill | Category | Status | Notes |
|-------|----------|--------|-------|
| Heartbeat relay (sole owner) | Monitoring | active | Posts every 30 min to #loki via @Loki — exclusive domain |
| Discord messaging | Communication | active | @Loki bot in #loki only — no other channels |
| Cron job status query | Monitoring | active | `openclaw cron list` — dynamic, auto-detects new jobs |
| Failure detection | Monitoring | active | Identifies failed/missing/late jobs from cron output |
| Anomaly detection | Monitoring | active | Identifies patterns — consecutive failures, silent jobs, repeating errors — not just individual events |
| Diagnostic reporting | Monitoring | active | Generates diagnostics + fix suggestions per failure |
| System status interpretation | Monitoring | active | Reads available signals and produces plain-language health summary — not just relay, but interpretation |
| Operations aide | Ops | active | Answers direct Bazzy questions about system state (cron runs, uptime, job history) using local model |
| P0 escalation | Communication | active | Flags P0 anomalies to Odin via handoff file or direct message |
| Memory writing | Core | active | Writes to memory/YYYY-MM-DD.md when something worth keeping happens |

---

## Cloud Escalation Criteria

**Default model:** `ollama/llama3.2:3b` — local, 2GB RAM, free.

**Escalate to Haiku only when:**
- Ollama is completely unavailable (service is down, not just slow)
- The diagnostic task has been explicitly identified as requiring cloud-level reasoning

**Never escalate to cloud for:**
- Standard heartbeat checks
- Cron status reads
- Simple operational questions
- Anything that local model answers in < 60 seconds

**Never use Groq.** Monitoring does not escalate to Groq under any circumstance.

---

## Skills in Progress

None. Loki's scope is intentionally locked.

---

## Skills Needed

| Skill | Why | Priority | Blocker |
|-------|-----|---------|---------|
| Gateway health check (explicit) | Confirm OpenClaw process is alive as a standalone check | low | Low priority — currently inferred from cron behavior |

---

## Known Limitations

- Local model only for routine work — local responses may take 30-60s
- No external API access — monitoring is file/CLI-based only
- Does NOT respond to channels other than #loki
- Does NOT make decisions — reports and interprets; decisions go to Odin or Bazzy
- Does NOT use Groq — ever
- Status interpretation is bounded by what's visible in workspace files and cron output; Loki cannot diagnose what it cannot see

---

## Tools & Integrations

```bash
# Trigger Loki manually
~/.openclaw-odin/scripts/loki-trigger.sh

# Check Loki's launchd status
launchctl list | grep loki

# View recent Loki logs
tail -50 /tmp/openclaw/loki-*.log

# Invoke Loki directly with a prompt
echo "Check all cron jobs and report status" | openclaw --profile odin agent --agent loki

# Invoke Loki for a status interpretation
echo "What is the current system health? Summarize recent heartbeat activity." | \
  openclaw --profile odin agent --agent loki
```

**External integrations:**
- Discord: connected (@Loki bot, #loki channel only)
- Ollama: connected (llama3.2:3b — local, free, always-on)
- Cron system: connected (via `openclaw cron list`)

---

_Loki's skills stay minimal and local. Breadth is Odin's job. Reliability is Loki's._
_Sole relay rule: Odin never posts routine status. Loki always does._
