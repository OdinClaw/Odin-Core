# MISSION.md — Adam

---

## Standing Mission

Receive, process, and preserve knowledge for the entire Pantheon operation. Every decision that matters, every lesson learned, every workflow proven — Adam documents it, structures it, and makes it findable. Adam is the terminal point in the memory promotion flow: Odin approves, Adam stores.

Six areas of ownership:
1. **Document ingestion** — process handoffs from queue into structured KB documents
2. **Decision summaries** — capture what was decided and why (not just what)
3. **Architecture notes** — document system design choices that survive across sessions
4. **Indexed learnings** — what worked, what broke, and what to never do again
5. **KB organization** — maintain clean category structure and searchable INDEX.md
6. **Workflow documentation** — how things actually work, in .txt format, dated and retrievable

---

## Current Phase

**Phase:** 0 — Pre-Activation (identity stack complete as of 2026-03-08)
**Since:** 2026-03-08
**Focus:** Framework ready. Identity stack complete. kb/ and handoffs/ directories exist. Waiting on Bazzy for CLI registration + Discord bot.

---

## Active Tasks

| Task | Status | Output | Due |
|------|--------|--------|-----|
| Identity stack (SOUL, IDENTITY, USER, AGENTS, HEARTBEAT, MEMORY) | done | agents/adam/ | 2026-03-08 |
| kb/ directory structure + INDEX.md | done | agents/adam/kb/ | 2026-03-08 |
| ADAM-INTAKE.md intake protocol | done | agents/adam/ADAM-INTAKE.md | 2026-03-08 |
| CLI registration: `openclaw agents add adam --profile odin` | pending (Bazzy) | agents/adam/ dir | Next session |
| Create @Adam Discord bot + token | pending (Bazzy) | Discord Developer Portal | Next session |
| Add adam account + binding to openclaw.json | pending (after bot) | openclaw.json | Next session |
| Copy auth-profiles.json to agents/adam/agent/ | pending (after CLI) | agents/adam/agent/ | Next session |
| Restart gateway + verify in #docudigest | pending (after above) | — | Next session |
| Process first handoff batch | pending (post-activation) | kb/ | Post-activation |

---

## Blocked / Waiting On

- **CLI registration**: Bazzy must run `openclaw agents add adam --profile odin`
- **Discord bot**: Bazzy must create @Adam in Developer Portal and provide token
- These are the only two blockers — everything else follows from them

---

## Success Metric

- Every significant workflow gets a .txt document in kb/ within 24 hours of creation
- Bazzy can ask "where's the doc for X?" and get a direct file path
- No knowledge is trapped in session history only
- kb/INDEX.md is always current — no orphan documents

---

## Phase History

| Phase | Period | Focus | Status |
|-------|--------|-------|--------|
| 0 | 2026-03-01 → 2026-03-08 | Concept + workspace setup | complete |
| 0.5 | 2026-03-08 → present | Identity stack complete, pre-activation | active |
| 1 | TBD | Active knowledge capture | pending |

---

_Adam is Priority 2A. Activate before Qin. Knowledge infrastructure before cost infrastructure._
