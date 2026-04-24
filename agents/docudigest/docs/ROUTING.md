# Legacy Routing Notes

This file is a legacy internal workspace copy and is not the authoritative documentation source.

Authoritative source:
`/Users/odinclaw/OdinClawObsidian/OdinClaw/docs/architecture/odin-routing-stack.md`

# Odin Routing Stack

## Overview

The Odin multi-agent system routes Discord messages to agents via **accountId-based bindings**. Each Discord bot account maps to exactly one agent. Routing is determined at the gateway level by matching `channel: discord` + `accountId`.

---

## Discord Guild

| Guild ID | Slug |
|---|---|
| `1477047631950643244` | **odin** |

**Allowlist:** Only user `583319870511513611` (Bazzy) is permitted in all channels.

---

## Bot Accounts → Agents

| Discord Account | Agent Name | Agent ID | Enabled |
|---|---|---|---|
| `main` | **Odin** | `main` | ✅ |
| `heartbeat-relay` | **Loki** | `heartbeat-relay` | ✅ |
| `systems` | **Thor** | `systems` | ❌ (disabled) |
| `sys-export` | **Tesla** | `sys-export` | ✅ |
| `docudigest` | **Adam** | `docudigest` | ✅ |
| `audit-agent` | **Hades** | `audit-agent` | ✅ |

---

## Channel Routing

### `main` (Odin)
Handles general operations with full owner-operator system prompt.

| Channel ID | Purpose |
|---|---|
| `1477047633251139617` | General / ops |
| `1477459669239861380` | Secondary ops |
| `1477459670804205619` | Tertiary ops |
| `1477459672851157074` | Quaternary ops |

### `heartbeat-relay` (Loki)
Heartbeat relay agent — only responds when @mentioned in `#loki`.

| Channel ID | Require Mention |
|---|---|
| `1478591775558996122` (#loki) | ✅ Yes |

### `systems` (Thor)
**Disabled.** Was intended for systems channel.

| Channel ID | Status |
|---|---|
| `1478133177687212062` | Disabled |

### `sys-export` (Tesla)
System export agent for data extraction.

| Channel ID |
|---|
| `1478133174612660415` |

### `docudigest` (Adam)
Knowledge capture, memory indexing, decision documentation. **This agent.**

| Channel ID |
|---|
| `1478133176386715870` (#adam) |

### `audit-agent` (Hades)
Audit/inspection agent with scheduled heartbeat checks.

| Channel ID |
|---|
| `1493355371849322506` |

---

## Routing Logic

```
Message arrives on Discord
  → Gateway inspects (channel, accountId)
  → Match against bindings[]
    → type: "route"
    → match: { channel: "discord", accountId: <account> }
  → Route to bound agent
```

**No content-based routing.** Messages are routed purely by which bot account received them.

---

## Subagent Constraints

Default agent settings:
- `maxSpawnDepth: 2`
- `maxChildrenPerAgent: 8`
- `maxConcurrent: 4`

Only `main` (Odin) has `subagents.allowAgents: ["*"]` (all agents allowed).

---

## Thread Bindings

Global Discord thread settings:
- `enabled: true`
- `idleHours: 24`
- `maxAgeHours: 0` (no limit)
- `spawnSubagentSessions: true`

---

## Active Memory Plugin

Only agent `main` has active memory enabled, using `groq/llama-3.3-70b-versatile` for memory lookups.

---

## Model Stack (Default Hierarchy)

1. **Primary:** `minimax/MiniMax-M2.7`
2. **Fallback 1:** `openai-codex/gpt-5.4`
3. **Fallback 2:** `groq/llama-3.3-70b-versatile`
4. **Fallback 3:** `anthropic/claude-opus-4-6`

Heartbeat uses: `ollama/qwen3.5:9b` (local, no API cost)

---

## Last Updated

Compiled from live gateway config at `~/.openclaw-odin/openclaw.json`
