# Tesla v1 — Export & Packaging Agent

Tesla is the **export, sanitization, and GitHub publishing layer** of the Odin system.

Architecture: **OpenClaw side** = core export logic | **Discord bot side** = command interface only.

---

## Directory Structure

```
tesla/
  config/
    export_targets.json      Exclusion rules (dirs/files never exported)
    sanitize_rules.json      Secret detection + path redaction patterns
    github_targets.json      Repo names, branch templates, commit messages
  manifests/
    full_export.json         What to include in a full system export
    agent_export.json        What to include in a single-agent export
  scripts/
    export_system.js         Full system export orchestrator (CLI + module)
    export_agent.js          Single agent export orchestrator (CLI + module)
    collect_files.js         Manifest-driven file collection
    sanitize_export.js       Secret detection (abort) + path redaction
    validate_export.js       Pre-push validation suite
    push_github.js           Git init + commit + push
    build_env_template.js    .env.example generator
    report_export.js         Report write/read/Discord format
    discord_bridge.js        Discord command parser + script dispatcher
    weekly_export.js         Weekly scheduler entry point
  launchd/
    ai.openclaw.tesla.weekly.plist.template   macOS LaunchAgent template
  temp/                      Ephemeral export staging (never committed)
  logs/                      Export run reports (latest.json always updated)
  README.md                  This file
```

---

## Quick Start

### Dry-run (safe, no side effects)

```bash
node ~/.openclaw-odin/tesla/scripts/export_system.js --dry-run
node ~/.openclaw-odin/tesla/scripts/export_agent.js documentation_agent --dry-run
```

### Full export (requires GITHUB_TOKEN)

```bash
export GITHUB_TOKEN=ghp_your_token
export GITHUB_USERNAME=your_username
node ~/.openclaw-odin/tesla/scripts/export_system.js
```

### Agent export

```bash
node ~/.openclaw-odin/tesla/scripts/export_agent.js reasoning_engine
```

### Discord bridge

```bash
node ~/.openclaw-odin/tesla/scripts/discord_bridge.js "tesla ping"
node ~/.openclaw-odin/tesla/scripts/discord_bridge.js "tesla dryrun system"
node ~/.openclaw-odin/tesla/scripts/discord_bridge.js "tesla export agent documentation_agent"
```

---

## Discord Commands

| Command | Description |
|---------|-------------|
| `tesla ping` | Health check |
| `tesla status` | Config status + last export summary |
| `tesla dryrun system` | Preview full export without pushing |
| `tesla export system` | Full system export → odin-core |
| `tesla export system --no-push` | Collect + validate, skip push |
| `tesla export agent <functional_id>` | Export single agent → odin-agents |
| `tesla validate export` | Run config/validate.js --strict --compat |
| `tesla last report` | Show most recent export report |

### Functional IDs for agent export

```
orchestrator              (main / Odin)
reasoning_engine          (thor)
monitor_agent             (loki)
documentation_agent       (adam)
portfolio_curator_agent   (tesla — itself)
social_analytics_agent    (apollo)
thought_leadership_agent  (buddha)
rnd_lab_agent             (beelzebub)
content_scheduler_agent   (chronus)
security_auditor_agent    (hades)
community_bot_agent       (hercules)
collab_leads_agent        (hermes)
usage_tracker_agent       (qin)
trading_bot_agent         (shiva)
insurance_analyzer_agent  (zeus)
```

---

## Environment Variables

### Required for push
```
GITHUB_TOKEN=ghp_...        Personal access token (repo:write scope)
GITHUB_USERNAME=...          GitHub username
```

### Optional overrides
```
GITHUB_REMOTE_ODIN_CORE=https://github.com/.../odin-core.git
GITHUB_REMOTE_ODIN_AGENTS=https://github.com/.../odin-agents.git
GIT_EMAIL=tesla@openclaw.local
GIT_NAME=Tesla Export Bot
TESLA_WEEKLY_NO_PUSH=true   Dry-push mode for weekly cron (validation only)
```

---

## Export Flow

### Full system export

1. Run `config/validate.js --strict --compat`
2. Load `manifests/full_export.json` + `config/export_targets.json`
3. Collect all allowed files
4. Copy to `tesla/temp/full-YYYY-MM-DD-PID/`
5. Scan each file for secrets → **abort if found**
6. Redact machine-specific paths (`/Users/<username>/` → `${HOME}/`)
7. Generate `.env.example`
8. Validate the export directory
9. `git init` → `git checkout -b export/snapshot-YYYY-MM-DD` → `git commit` → `git push`
10. Clean temp dir
11. Write report to `tesla/logs/`

### Single agent export

Same flow but targets only the agent's config + workspace files.
Output goes to `odin-agents` repo on a branch named `export/<agent>-YYYY-MM-DD`.
Includes `agent_manifest.json` with provenance metadata.

---

## Sanitization Rules

**Abort-on-match** (export halts immediately):
- Anthropic API keys (`sk-ant-...`)
- OpenAI API keys (`sk-...`)
- Discord bot tokens (base64 triple format)
- GitHub tokens (`ghp_...`)
- Groq keys (`gsk_...`)
- Telegram bot tokens
- The OpenClaw gateway auth token (hardcoded literal)
- HTTP Bearer headers

**Redact** (replaced before writing):
- `/Users/<username>/` → `${HOME}/`
- `/home/<username>/` → `${HOME}/`

**Always excluded** (never reach sanitizer):
- `.env`, `.env.*`, `openclaw.json`
- `node_modules/`, `workspace/`, `agents/`, `logs/`
- `*.log`, `*.jsonl`, `*.sqlite`, `snapshots/`

---

## Weekly Scheduler (macOS launchd)

1. Copy and customize the plist template:
   ```bash
   cp tesla/launchd/ai.openclaw.tesla.weekly.plist.template \
      ~/Library/LaunchAgents/ai.openclaw.tesla.weekly.plist
   # Replace REPLACE_USERNAME with your macOS username
   sed -i '' "s/REPLACE_USERNAME/$USER/g" \
      ~/Library/LaunchAgents/ai.openclaw.tesla.weekly.plist
   ```

2. Store GitHub token in macOS Keychain:
   ```bash
   security add-generic-password -s tesla-github-token -a tesla -w "ghp_your_token"
   ```

3. Create a wrapper script that exports the token:
   ```bash
   cat > ~/.openclaw-odin/tesla/launchd/run_weekly_export.sh << 'EOF'
   #!/bin/bash
   export GITHUB_TOKEN="$(security find-generic-password -s tesla-github-token -w)"
   export GITHUB_USERNAME="your_github_username"
   exec node ~/.openclaw-odin/tesla/scripts/weekly_export.js
   EOF
   chmod +x ~/.openclaw-odin/tesla/launchd/run_weekly_export.sh
   ```

4. Load and test:
   ```bash
   launchctl load ~/Library/LaunchAgents/ai.openclaw.tesla.weekly.plist
   launchctl start ai.openclaw.tesla.weekly   # test immediately
   ```

5. Check logs:
   ```bash
   tail -f ~/.openclaw-odin/tesla/logs/weekly.log
   ```

---

## Validation Checks (pre-push)

| Check | Description |
|-------|-------------|
| config/validate.js --strict --compat | All 61 system checks must pass |
| Export directory exists | Temp dir was created |
| Export non-empty | At least one file collected |
| .env.example present | Template was generated |
| No .env files | Zero `.env*` files in export |
| No node_modules | npm dirs excluded |
| No secrets | Full re-scan of export directory |
| Required manifest items | All `required: true` items present |

---

## Deployment Checklist (one-time)

- [ ] `openclaw agents add tesla` — register with OpenClaw platform
- [ ] Create Tesla Discord bot in Discord Developer Portal
- [ ] Add bot token to `openclaw.json` under `channels.discord.accounts.tesla`
- [ ] Add `GITHUB_TOKEN` and `GITHUB_USERNAME` to `.env`
- [ ] Create `odin-core` and `odin-agents` repos on GitHub
- [ ] Load weekly LaunchAgent (see above)
- [ ] Run first dry-run: `node tesla/scripts/export_system.js --dry-run`

---

## Report Format

Every export writes to `tesla/logs/latest.json`:

```json
{
  "action": "full_system_export",
  "timestamp": "2026-03-22T10:00:00.000Z",
  "dryRun": false,
  "repoTarget": "odin-core",
  "branchTarget": "export/snapshot-2026-03-22",
  "validationPassed": true,
  "fileCount": 47,
  "excludedCount": 12,
  "redactionCount": 3,
  "pushResult": "success",
  "commitHash": "abc123def456",
  "success": true,
  "failureReason": null
}
```
