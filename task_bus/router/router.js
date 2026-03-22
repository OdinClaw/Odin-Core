'use strict';
/**
 * router.js
 * Maps task classes to agent platform IDs.
 *
 * Agent roster (functional_id → platform_id → configurable display_name):
 *   orchestrator         → 'main'  → display: see config/agents.json
 *   reasoning_engine     → 'thor'  → display: see config/agents.json
 *   monitor_agent        → 'loki'  → display: see config/agents.json
 *   documentation_agent  → 'adam'  → display: see config/agents.json
 *
 * Platform IDs are the stable keys used by OpenClaw routing and are
 * imported as named constants from config/agent_ids.js. Display names
 * are configurable in config/agents.json and have no routing effect.
 */

const { AGENT_IDS, LIVE_AGENT_IDS } = require('../../config/agent_ids');

// ── Primary routing table ─────────────────────────────────────────────────────
// Maps task class → platform ID (via named constant, not bare string).

const ROUTES = {
  orchestration: AGENT_IDS.ORCHESTRATOR,        // orchestrator coordinates everything
  reasoning:     AGENT_IDS.REASONING_ENGINE,    // reasoning_engine handles deep analysis
  monitoring:    AGENT_IDS.MONITOR_AGENT,        // monitor_agent watches the system
  documentation: AGENT_IDS.DOCUMENTATION_AGENT, // documentation_agent records and archives
  system_event:  AGENT_IDS.DOCUMENTATION_AGENT, // documentation_agent handles config/arch events too
};

// ── Fallback chain per class ──────────────────────────────────────────────────
// If the primary agent is unavailable, fall back in this order.

const FALLBACKS = {
  orchestration: [AGENT_IDS.REASONING_ENGINE,     AGENT_IDS.DOCUMENTATION_AGENT],
  reasoning:     [AGENT_IDS.ORCHESTRATOR,          AGENT_IDS.DOCUMENTATION_AGENT],
  monitoring:    [AGENT_IDS.ORCHESTRATOR,          AGENT_IDS.REASONING_ENGINE],
  documentation: [AGENT_IDS.ORCHESTRATOR],
  system_event:  [AGENT_IDS.ORCHESTRATOR],
};

// ── Routing logic ─────────────────────────────────────────────────────────────

/**
 * Resolve the primary agent platform ID for a task class.
 * @param {string} taskClass
 * @returns {string} platform ID
 */
function route(taskClass) {
  return ROUTES[taskClass] || AGENT_IDS.ORCHESTRATOR;
}

/**
 * Resolve the full fallback chain for a task class.
 * Returns [primary, ...fallbacks].
 * @param {string} taskClass
 * @returns {string[]}
 */
function routeWithFallbacks(taskClass) {
  const primary   = route(taskClass);
  const fallbacks = FALLBACKS[taskClass] || [];
  return [primary, ...fallbacks.filter(a => a !== primary)];
}

/**
 * Return a human-readable description of a routing decision.
 * Note: uses platform IDs in the output, not display names.
 * Call getAgentName(id) from config/names.js for display-friendly output.
 */
function describe(taskClass) {
  const primary = route(taskClass);
  const chain   = routeWithFallbacks(taskClass);
  return `${taskClass} → ${primary} (fallbacks: ${chain.slice(1).join(', ') || 'none'})`;
}

/**
 * All currently live agent platform IDs.
 * Source of truth: LIVE_AGENT_IDS in config/agent_ids.js.
 */
const AGENTS = LIVE_AGENT_IDS;

module.exports = { route, routeWithFallbacks, describe, ROUTES, AGENTS };
