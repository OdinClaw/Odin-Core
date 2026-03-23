'use strict';
/**
 * agent_ids.js
 * Stable platform ID constants for every agent in the Odin system.
 *
 * WHAT IS A "PLATFORM ID"?
 *   The platform ID is the permanent technical key used by the OpenClaw
 *   binary (e.g. `openclaw --agent <id>`) and stored in openclaw.json.
 *   It is a routing key — NOT a persona or display name.
 *   Display names live in config/agents.json and can be changed freely.
 *
 * WHAT IS A "FUNCTIONAL ID"?
 *   The functional ID is the AGENT_IDS key name — a human-readable
 *   constant that describes the agent's actual role in the system.
 *   Code that imports this file uses AGENT_IDS.DOCUMENTATION_AGENT
 *   instead of the bare string 'adam', so the intent is always clear
 *   and a future platform ID change requires updating only this file.
 *
 * REBRAND NOTE:
 *   If display names are changed (in agents.json), this file does NOT
 *   need to change. Platform IDs are permanently tied to OpenClaw
 *   session directories and the binary's --agent flag.
 *
 * HOW TO ADD A NEW AGENT:
 *   1. Register it: `openclaw agents add <id> --profile odin`
 *   2. Add a constant here: ROLE_NAME: '<platform_id>'
 *   3. Add it to LIVE_AGENT_IDS when it goes live
 *   4. Add an entry in config/agents.json
 *
 * Functional role → platform ID mapping:
 *   ORCHESTRATOR               → 'main'
 *   REASONING_ENGINE           → 'thor'
 *   MONITOR_AGENT              → 'loki'
 *   DOCUMENTATION_AGENT        → 'adam'
 *   SOCIAL_ANALYTICS_AGENT     → 'apollo'      (queued)
 *   THOUGHT_LEADERSHIP_AGENT   → 'buddha'      (queued)
 *   RND_LAB_AGENT              → 'beelzebub'   (queued)
 *   CONTENT_SCHEDULER_AGENT    → 'chronus'     (queued)
 *   SECURITY_AUDITOR_AGENT     → 'hades'       (paused)
 *   COMMUNITY_BOT_AGENT        → 'hercules'    (queued)
 *   COLLAB_LEADS_AGENT         → 'hermes'      (queued)
 *   USAGE_TRACKER_AGENT        → 'qin'         (paused)
 *   TRADING_BOT_AGENT          → 'shiva'       (paused)
 *   PORTFOLIO_CURATOR_AGENT    → 'tesla'       (queued)
 *   INSURANCE_ANALYZER_AGENT   → 'zeus'        (research)
 */

// ── Live agents (registered + active in OpenClaw) ─────────────────────────────

const AGENT_IDS = {

  // Primary orchestrator — routes tasks, manages handoffs, governance authority
  ORCHESTRATOR:               'main',

  // Deep reasoning and analysis engine
  REASONING_ENGINE:           'thor',

  // System monitor — heartbeats, health checks, cron watchdog
  MONITOR_AGENT:              'loki',

  // Documentation and knowledge base agent
  DOCUMENTATION_AGENT:        'adam',

  // ── Workspace agents (queued / paused / research — not yet live) ──────────

  // Social media analytics — daily metrics tracking
  SOCIAL_ANALYTICS_AGENT:     'apollo',

  // Thought leadership — LinkedIn content and strategic publishing
  THOUGHT_LEADERSHIP_AGENT:   'buddha',

  // R&D lab — experimental development
  RND_LAB_AGENT:              'beelzebub',

  // Content scheduler — post timing optimization
  CONTENT_SCHEDULER_AGENT:    'chronus',

  // Security auditor — vulnerability assessment and access review
  SECURITY_AUDITOR_AGENT:     'hades',

  // Community bot — fan community management
  COMMUNITY_BOT_AGENT:        'hercules',

  // Collaboration leads — discovery and outreach
  COLLAB_LEADS_AGENT:         'hermes',

  // Usage and spending tracker
  USAGE_TRACKER_AGENT:        'qin',

  // Trading bot — automated market execution
  TRADING_BOT_AGENT:          'shiva',

  // AI portfolio curator — content curation
  PORTFOLIO_CURATOR_AGENT:    'tesla',

  // Insurance analyzer — policy and risk analysis
  INSURANCE_ANALYZER_AGENT:   'zeus',
};

// ── Live agent subset ─────────────────────────────────────────────────────────
// Only agents with status: 'live' in config/agents.json.
// The preprocessor uses this list for its name-preservation rules.
// Update this array when an agent's status changes to/from 'live'.

const LIVE_AGENT_IDS = [
  AGENT_IDS.ORCHESTRATOR,
  AGENT_IDS.REASONING_ENGINE,
  AGENT_IDS.MONITOR_AGENT,
  AGENT_IDS.DOCUMENTATION_AGENT,
];

// ── Reverse map: platform_id → AGENT_IDS key ─────────────────────────────────
// Used by validation to detect unknown platform IDs in config.

const PLATFORM_ID_TO_CONSTANT = Object.fromEntries(
  Object.entries(AGENT_IDS).map(([k, v]) => [v, k])
);

module.exports = { AGENT_IDS, LIVE_AGENT_IDS, PLATFORM_ID_TO_CONSTANT };
