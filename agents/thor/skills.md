# SKILLS.md — Thor

_Thor's capabilities. Cloud-first reasoning for systems work._

---

## Active Skills

| Skill | Category | Status | Notes |
|-------|----------|--------|-------|
| Discord messaging | Communication | active | @Thor bot in #thor |
| Workflow analysis | Systems | active | Reads agent files, identifies inefficiencies, proposes improvements |
| Cross-agent synthesis | Systems | active | Reads output from all agents to identify patterns and gaps |
| Promote candidate writing | Documentation | active | When task yields durable insight, writes workspace/promote/YYYY-MM-DD-thor-SLUG.md for Odin review → Adam KB |
| Process testing | Systems | active | Identifies fragile assumptions, proposes pressure tests |
| System review reports | Systems | active | Produces structured THOR-SYSTEM-REVIEW-*.md files |
| Memory writing | Core | active | Writes to memory/YYYY-MM-DD.md when something worth keeping is found |
| Best-practice forging | Systems | active | Extracts proven patterns into reusable documentation |

---

## Skills in Progress

| Skill | Why | Status | ETA |
|-------|-----|--------|-----|
| Artist Toolkit development tracking | Monitor Apollo/Chronus/Hercules/Hermes integration progress | active | Ongoing |
| Workshop curriculum development | Music production + AI agents content | ongoing | Phase 2 |

---

## Skills Needed

| Skill | Why | Priority | Blocker |
|-------|-----|---------|---------|
| Automated workflow benchmarking | Measure actual vs expected performance | medium | Need baseline data from live agents first |

---

## Known Limitations

- On-demand only — Thor does not monitor continuously
- Does NOT execute changes — suggests and documents only; Odin or Bazzy approves changes
- Does NOT touch openclaw.json or system config directly
- Requires Sonnet 4.5 minimum — local/Haiku models are not used for Thor's work
- Durable outputs go to workspace/promote/ (not direct to Adam) — Odin gates what enters Adam's KB
- Memory files (.md) for session logs; promote candidates (.md) for KB-worthy insights; THOR-SYSTEM-REVIEW-*.md for deep structured analysis

---

## Tools & Integrations

```bash
# Invoke Thor directly for a specific task
echo "Review the Loki heartbeat workflow and identify improvements" | \
  openclaw --profile odin agent --agent thor

# Invoke for system review
echo "Conduct a system review of all currently active agents and report findings" | \
  openclaw --profile odin agent --agent thor
```

**External integrations:**
- Discord: connected (@Thor bot, #thor channel)
- Anthropic: connected (Sonnet 4.5 primary)
- All agent workspaces: readable (no write access to other agents' files)
- workspace/promote/: writable — Thor drops promote candidates here for Odin review
- workspace/agents/adam/ADAM-INTAKE.md: readable — promote candidate format reference

**Promote candidate format (minimum viable):**
```
File: workspace/promote/YYYY-MM-DD-thor-TOPIC-SLUG.md

WHAT: [one sentence — what the insight or finding is]
WHY IT MATTERS: [why this should survive session death]
SOURCE: thor
CATEGORY HINT: architecture | workflow | decision | learning | reference
PROJECT: music | IT | system | pantheon
[Full detail below — more context is always better]
```

---

_Thor's job is to improve things. If this skills file is out of date, that's a process failure._
