# INTAKE-PROTOCOL.md — Memory Promotion Staging

_The promote/ directory is a staging area. Not a destination._
_Created: 2026-03-08_

---

## What This Directory Is

`workspace/promote/` is the first stage in the memory promotion flow. Any agent — or Odin directly — drops a raw candidate here when something is worth preserving. Odin reviews on a per-session basis and decides what moves forward.

**Promote/ is not permanent storage.** Files here are either:
- Approved → moved to `agents/adam/handoffs/`
- Deferred → left with a note, reviewed next session
- Rejected → deleted or marked with DISCARD

---

## The Three-Stage Flow

```
Stage 1: PROMOTE/          ← Raw candidates land here (any agent, any format)
              ↓
         Odin reviews       ← Gatekeeper. No file advances without Odin's decision.
              ↓
Stage 2: HANDOFFS/          ← Approved queue. Adam reads this only.
              ↓
         Adam processes     ← Structures into KB document. Updates INDEX.md.
              ↓
Stage 3: KB/                ← Final destination. Permanent. Searchable.
```

---

## How to Submit a Promote Candidate

**File naming:** `YYYY-MM-DD-TOPIC-SLUG.md`
**Examples:**
- `2026-03-08-discord-id-precision-bug.md`
- `2026-03-08-loki-cloud-escalation-rule.md`
- `2026-03-08-thor-classification-decision.md`

**Minimum content (loose format, Odin will structure):**
```markdown
WHAT: [one sentence — what happened or was decided]
WHY IT MATTERS: [why this should survive session death]
SOURCE: [which agent, session, or conversation produced this]
CATEGORY HINT: architecture | workflow | decision | learning | reference
PROJECT: music | IT | system | pantheon
```

More context is always better. Don't over-edit — just capture the substance while it's fresh.

---

## Odin's Review Criteria

Odin reviews `promote/` at the start or end of each session. Three gates:

1. **Durability** — Will this matter beyond this session? Is it session context or genuine pattern?
2. **Actionability** — Can Adam structure this as a retrievable document? Is there enough substance?
3. **Uniqueness** — Is this already captured somewhere in kb/? No duplicates.

**If approved:** Odin writes a structured handoff to `agents/adam/handoffs/YYYY-MM-DD-SLUG.md` with full context, then deletes or archives the promote/ file.

**If deferred:** Odin leaves the file with a note prepended: `STATUS: DEFERRED — [reason] — review next session`

**If rejected:** File deleted, or marked `STATUS: DISCARD` if explanation is useful to leave behind briefly.

---

## What Belongs in promote/

**YES:**
- Decisions with lasting impact (tool choices, architecture direction, workflow design)
- Lessons from things that broke (include symptoms, root cause, fix, prevention)
- Workflows that worked and should be reproducible
- System design choices that explain "why" not just "what"
- Patterns confirmed across multiple sessions

**NO:**
- Session-specific status (e.g., "gateway was down today but came back")
- One-time task logs with no reusable insight
- Information already in kb/
- Speculation or unverified conclusions

---

## Odin's Promote Review Command

```bash
# Check what's in staging
ls -lt ~/.openclaw-odin/workspace/promote/

# View a specific candidate
cat ~/.openclaw-odin/workspace/promote/YYYY-MM-DD-SLUG.md

# After review — write approved handoff to Adam's queue
# Then remove from promote/
rm ~/.openclaw-odin/workspace/promote/YYYY-MM-DD-SLUG.md
```

---

## Current Queue

_As of 2026-03-08: Empty. Adam not yet activated. First handoffs will queue here once Odin begins reviewing promote candidates during active sessions._

---

_Files in promote/ older than 7 days with no Odin decision should be escalated to Bazzy._
