# SKILLS.md — Adam

_Adam's capabilities. Knowledge capture is the core. Everything else supports it._
_Updated 2026-03-08 — added intake workflow, KB format standard, handoff processing._

---

## Active Skills

| Skill | Category | Status | Notes |
|-------|----------|--------|-------|
| Handoff queue processing | Core | active | Reads agents/adam/handoffs/, processes each into kb/ document |
| Document creation | Knowledge | active | Writes structured .txt docs to kb/ with date, topic, category |
| KB indexing | Knowledge | active | Updates kb/INDEX.md on every new document — never skip |
| Decision capture | Knowledge | active | Format: decision → rationale → alternatives considered |
| Architecture note capture | Knowledge | active | System design decisions with full context preserved |
| Learning capture | Knowledge | active | Format: what happened → what worked → what to remember |
| Workflow documentation | Knowledge | active | Process docs in .txt format, retrievable by future sessions |
| File I/O | Core | active | Reads all workspace; exclusive write access to agents/adam/kb/ |
| Memory writing | Core | active | Writes to memory/YYYY-MM-DD.md for session-level retention |
| Odin confirmation | Communication | active | Reports handoff completion to main agent after each document |
| Discord messaging | Communication | pending activation | @Adam bot → #docudigest once bot is created and registered |

---

## Skills in Progress

| Skill | Why | Status | ETA |
|-------|-----|--------|-----|
| Discord bot integration | Post summaries to #docudigest when docs are created | pending | After @Adam bot is created |
| Handoff trigger cron | Scheduled sweep of handoffs/ queue | pending | Phase 1, after activation |

---

## Skills Needed

| Skill | Why | Priority | Blocker |
|-------|-----|---------|---------|
| kb/ semantic search index | Enable "find doc about X" queries | medium | Need 20+ docs in KB first |
| Cross-agent doc aggregation | Read intel files, archive as KB snapshots on schedule | medium | Phase 1 post-activation |

---

## KB Document Standard

**File naming:** `TOPIC-SLUG-YYYY-MM-DD.txt`
**Examples:**
- `LOKI-ACTIVATION-2026-03-04.txt`
- `PANTHEON-KERNEL-ARCHITECTURE-2026-03-08.txt`

**Required sections in every KB document:**
```
Title: [descriptive, searchable title]
Date: YYYY-MM-DD
Category: architecture | workflow | decision | learning | reference
Agent: [who produced this knowledge]
Project: music | IT | system | pantheon

--- CONTENT ---
[Structured, complete, context-preserving. Preserve the "why", not just the "what".]

--- INDEX TAGS ---
[3-5 searchable keywords]
```

**Storage path:** `workspace/agents/adam/kb/<category>/FILENAME.txt`

---

## Known Limitations

- Adam does not make decisions — Odin approves what gets captured; Adam captures it
- Adam does not write to other agents' workspace files — knowledge flows ONE WAY to Adam
- Output format is .txt, not .md — per Bazzy's documentation standard
- Discord messaging pending until @Adam bot is created
- Not yet activated — CLI registration required before agent functions

---

## Tools & Integrations

```bash
# Invoke Adam to process handoff queue
echo "Process all open handoffs in the queue and update the KB" | \
  openclaw --profile odin agent --agent adam

# Invoke Adam for specific capture
echo "Document the Pantheon kernel architecture we set up today" | \
  openclaw --profile odin agent --agent adam

# Check handoff queue
ls -lt ~/.openclaw-odin/workspace/agents/adam/handoffs/

# Browse KB
ls -Rlt ~/.openclaw-odin/workspace/agents/adam/kb/

# Read KB index
cat ~/.openclaw-odin/workspace/agents/adam/kb/INDEX.md
```

**External integrations:**
- Discord: pending (@Adam bot not yet created)
- All agent intel files: readable
- agents/adam/kb/: exclusive write access

---

_Adam's value compounds over time. Every document added makes the next session smarter._
