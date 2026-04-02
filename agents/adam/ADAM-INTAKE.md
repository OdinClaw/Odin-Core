# ADAM-INTAKE.md — Adam's Handoff Processing Protocol

_Practical first-pass implementation. Not over-engineered. One step at a time._
_Created: 2026-03-08_

---

## The Flow

```
Any Agent or Bazzy
       ↓
   promote/           ← raw output, lesson, decision worth preserving
       ↓
  Odin reviews        ← gate. Odin decides: discard, defer, or approve
       ↓
agents/adam/handoffs/ ← approved queue. Adam reads this.
       ↓
  agents/adam/kb/     ← Adam writes structured .txt document
       ↓
  kb/INDEX.md         ← Adam updates index. Always.
       ↓
  #docudigest         ← Adam posts one-line summary (pending bot activation)
```

---

## Stage 1 — Promote Candidate (raw)

**Who writes:** Any agent or Odin directly.
**Where:** `workspace/promote/YYYY-MM-DD-SLUG.md`
**Format:** Loose. Just capture it. Don't worry about structure at this stage.

A promote candidate is anything worth preserving:
- A decision that was made and might get unmade without a record
- A workflow that actually worked
- A lesson learned from something that broke
- An architecture choice that has long-term implications
- A pattern confirmed across multiple sessions

**Minimum viable promote candidate:**
```
WHAT: [one sentence — what happened or was decided]
WHY IT MATTERS: [why this should survive session death]
SOURCE: [which agent or session produced this]
```

---

## Stage 2 — Odin Review (gate)

**Who:** Odin only. This is the memory gatekeeper authority.
**Input:** Files in `workspace/promote/`
**Output:** Approved handoffs written to `workspace/agents/adam/handoffs/`

Odin asks three questions per candidate:
1. Is this genuinely durable? (Not just session context — will it matter next week?)
2. Is this actionable or retrievable? (Can Adam structure this in a way that's findable?)
3. Is this not already captured? (No duplicate documents)

**If yes to all three:** Write handoff file to `agents/adam/handoffs/`.
**If no:** Leave in `promote/` with a brief rejection note, or delete.

**Odin handoff file format:**
```
File: agents/adam/handoffs/YYYY-MM-DD-SLUG.md

FROM: odin
TO: adam
TASK: document
PRIORITY: normal | high

TOPIC: [descriptive topic]
CATEGORY: architecture | workflow | decision | learning | reference
PROJECT: music | IT | system | pantheon
AGENT-SOURCE: [agent or session that produced this knowledge]

CONTENT:
[The actual substance Adam needs to document. Full context preserved.
Odin writes enough that Adam can produce a complete document without guessing.]

RATIONALE:
[Why this is worth preserving. What the decision replaces. What failure led to this learning.]
```

---

## Stage 3 — Adam Processing (execution)

**Who:** Adam.
**Input:** Files in `agents/adam/handoffs/`
**Output:** Structured `.txt` document in `agents/adam/kb/<category>/`

**Adam's processing loop (per handoff file):**

1. **Read** the handoff file completely
2. **Identify** category, project, source agent, topic
3. **Write** KB document to the correct subdirectory:
   - `kb/architecture/` — system design, tool choices, structural decisions
   - `kb/workflows/` — how specific processes actually work
   - `kb/decisions/` — what was decided, why, alternatives rejected
   - `kb/learnings/` — what broke, what fixed it, what to never do again
   - `kb/references/` — config reference, tool usage, patterns
4. **Update** `kb/INDEX.md` — add the new document entry. Never skip this.
5. **Report** completion to Odin via handoff reply file or Discord (when bot is live)
6. **Delete** or archive the processed handoff file (move to `handoffs/processed/`)

---

## KB Document Format (required, every document)

**File naming:** `TOPIC-SLUG-YYYY-MM-DD.txt`
**Path:** `agents/adam/kb/<category>/FILENAME.txt`

```
Title: [descriptive, searchable title]
Date: YYYY-MM-DD
Category: architecture | workflow | decision | learning | reference
Agent: [who produced this knowledge — not Adam, the original source]
Project: music | IT | system | pantheon

--- CONTENT ---

[Structured, complete, context-preserving prose or structured notes.

For decisions: what was decided, why, what alternatives were considered and rejected.
For learnings: what happened, what the symptom was, what fixed it, what to watch for.
For architecture: what the system does, why it's structured this way, what it replaces.
For workflows: step by step. Who does what. What the output looks like.]

--- INDEX TAGS ---
[3-5 searchable keywords, one per line]
```

---

## INDEX.md Format

`agents/adam/kb/INDEX.md` — master index. Adam owns this file. Adam updates it every time a document is added.

```markdown
# Adam KB Index

_Last updated: YYYY-MM-DD_
_Total documents: N_

## Architecture
| File | Title | Date | Project |
|------|-------|------|---------|
| architecture/FILENAME.txt | Title | YYYY-MM-DD | system |

## Workflows
| File | Title | Date | Project |
|------|-------|------|---------|

## Decisions
| File | Title | Date | Project |
|------|-------|------|---------|

## Learnings
| File | Title | Date | Project |
|------|-------|------|---------|

## References
| File | Title | Date | Project |
|------|-------|------|---------|
```

---

## What Adam Does NOT Do

- Adam does not decide what gets documented — Odin decides
- Adam does not pull from `promote/` directly — only from `handoffs/`
- Adam does not write to any file outside `agents/adam/`
- Adam does not modify the source agent's files
- Adam does not reinterpret or editorialize — preserve the "why", not just the "what"
- Adam does not skip INDEX.md updates — ever

---

## Activation Note

**Current status (2026-03-08):** Adam is not yet CLI-registered.
- `agents/adam/handoffs/` — directory exists (created this session)
- `agents/adam/kb/` — directory exists with INDEX.md stub
- Processing protocol defined and ready
- Awaiting: `openclaw agents add adam --profile odin` (Bazzy action)
- Awaiting: @Adam Discord bot creation (Bazzy action)

Once activated, Adam's first run should process any queued handoffs that accumulated during pre-activation.
