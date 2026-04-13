# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to Odin's setup.

## Odin control surface

Primary operator script:

```bash
python3 scripts/odin_operator.py status
python3 scripts/odin_operator.py doctor
python3 scripts/odin_operator.py agents
python3 scripts/odin_operator.py tasks
python3 scripts/odin_operator.py failures
python3 scripts/odin_operator.py maintenance --apply
python3 scripts/odin_operator.py restart odin
```

Canonical path if the workspace-relative script is unavailable:

```bash
python3 /Users/odinclaw/.openclaw-odin/scripts/odin_operator.py doctor
```

## Live environment paths

- Config: `/Users/odinclaw/.openclaw-odin/openclaw.json`
- State: `/Users/odinclaw/.openclaw-odin`
- Gateway log: `/Users/odinclaw/.openclaw-odin/logs/gateway.log`
- Gateway error log: `/Users/odinclaw/.openclaw-odin/logs/gateway.err.log`
- Tasks DB: `/Users/odinclaw/.openclaw-odin/tasks/runs.sqlite`
- Router state: `/Users/odinclaw/.openclaw-odin/scripts/provider-registry.json`

## OpenClaw control commands

Use these exact forms when you need the native CLI:

```bash
openclaw --profile odin gateway status --json
openclaw --profile odin health --json
openclaw --profile odin models status --json
openclaw --profile odin tasks maintenance --apply
```

## Required fallback behavior

- If a direct tool call is rejected or unavailable, switch to `exec`.
- Prefer the operator script or exact `openclaw --profile odin ...` commands over invented tool names.
- Never say you can only provide information when local control is available.

---

Add anything environment-specific that helps you operate the system reliably.
