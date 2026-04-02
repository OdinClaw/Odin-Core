# SKILLS.md — Tesla V4

_Tesla's capabilities. Template generation layer + Agent layer._
_Updated: 2026-03-27 — V4 template generator alignment._

---

## Template Layer Skills (V4 — active)

These are the deterministic template-generation capabilities Tesla relies on. They do not require LLM involvement.

| Skill | Entry point | Status | Notes |
|-------|--------|--------|-------|
| Template generation | `tesla_v4/generate_template.js` | active | Builds sanitized portable `tesla_template/` output |
| File collection | `tesla_v4/generate_template.js` | active | Scans approved source directories only |
| Secret sanitization | `tesla_v4/generate_template.js` | active | Excludes secrets, runtime state, machine-specific data |
| Config normalization | `tesla_v4/generate_template.js` | active | Converts hardcoded values to env-driven placeholders |
| `.env.example` generation | `tesla_v4/generate_template.js` | active | Writes installer-ready environment template |
| Installer packaging | `tesla_v4/generate_template.js` | active | Keeps `install.sh`, `INSTALL.md`, and manifest in sync |
| Weekly scheduler | `tesla_v4/generate_template.js` | active | Entry point for launchd automation |

---

## Agent Layer Skills (V2 — Tesla's LLM capabilities)

These require the conversational agent and run through the tool bridge.

| Skill | Category | Status | Notes |
|-------|----------|--------|-------|
| Report reading + explanation | Communication | active | Reads latest.json / history, explains in plain language |
| Failure analysis | Diagnosis | active | Reads failureReason, suggests corrective action |
| Export intent routing | Decision | active | Determines which tool_bridge function to invoke |
| Dry-run mode | Export | active | `runSystemDryRun()` via tool bridge |
| Template generation | Export | active | Runs the Tesla V4 generator on demand |
| On-demand validation | Validation | active | Validates template readiness and generated output |
| Status summary | Status | active | Current template state + last generation summary |
| Intent confirmation | UX | active | Confirms ambiguous export requests before executing |
| Memory writing | Core | active | Writes to `memory/YYYY-MM-DD.md` when worth keeping |

---

## Template Access

Tesla accesses the active template-based export system through the current Tesla V4 generation layer. The execution path:
- Runs a single approved generator entry point
- Produces sanitized output only
- Returns structured results — never raw secrets
- Keeps resource usage bounded for scheduled runs

---

## Recognized User Intents + Mappings

| User says | Tesla invokes | Notes |
|-----------|--------------|-------|
| "what was the last export?" | `getLatestReport()` | Read-only |
| "why did the last run fail?" | `getLatestReport()` | Read failureReason |
| "show me the report history" | `getReportHistory(5)` | Default 5 reports |
| "Tesla status" / "are you healthy?" | current template status | Config + last generation summary |
| "validate the config" | template readiness check | Config check only |
| "dry run" / "preview export" | template preview request | No live-system mutation |
| "export the system" | Tesla V4 template generation | Produces portable template output |
| "export system no push" | Tesla V4 template generation | Optional git push remains separate |
| "export [agent_id]" | Tesla V4 template generation | Scoped by current generator rules |
| "export [agent_id] no push" | Tesla V4 template generation | Optional git push remains separate |
| "what files were redacted?" | `getLatestReport()` → redactionCount | Count only — never paths |

---

## Cloud Escalation Criteria

**Default model:** `anthropic/claude-haiku-4-5-20251001` — sufficient for export management.

**Escalate to Sonnet when:**
- Failure analysis requires complex multi-step reasoning
- User asks for architectural recommendations about the template-based export system (Tesla V4)
- Debug scenario involves multiple interacting failures

**Fallback to Qwen (local):**
- Haiku is unavailable due to subscription limits
- Simple status queries that local model can handle

**Never escalate just for:**
- Reading and summarizing a report
- Running a validation check
- Standard export or dry-run operations

---

## Known Limitations

- Cannot push to GitHub without `GITHUB_TOKEN` and `GITHUB_USERNAME` in `.env`
- Cannot talk via @Tesla Discord bot until bot token is configured in `openclaw.json`
- Cannot export files that contain real secrets (this is by design — sanitizer aborts)
- Generated output is bounded by the current generator rules and template scope
- Status reading is bounded by what's in `tesla/logs/` and `tesla_template/setup/` — Tesla cannot recover lost reports
- Tesla does NOT access or summarize other agents' private workspaces

---

## External Integrations

```bash
# Invoke Tesla directly (once registered)
openclaw --profile odin agent --agent tesla --message "what was the last export?"

# Direct template generation (bypasses agent layer — admin use)
node ~/.openclaw-odin/tesla_v4/generate_template.js

# Check weekly export logs
tail -50 ~/.openclaw-odin/tesla/logs/weekly.log
```

**Connected systems:**
- GitHub (push — requires env creds)
- OpenClaw config/validate.js (validation)
- Tesla V4 template generator
- Discord: #tesla via @Tesla bot (once configured)
- macOS launchd: weekly template generation automation

---

_Tesla's skills are narrow by design. Generate, sanitize, package. Clean boundaries, no leakage._
