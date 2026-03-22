'use strict';
/**
 * model_router.js
 * Determines the model tier for each task class and annotates task objects
 * with routing metadata before dispatch.
 *
 * This layer sits between classification/agent-routing and actual execution.
 * It attaches three fields to every task:
 *
 *   assigned_agent   — the agent ID chosen by router.js
 *   model_lane       — primary model this task class should run on
 *   fallback_models  — ordered list of models to try if primary is unavailable
 *
 * Model lanes map to logical capability tiers:
 *   "fast"    — haiku-4-5   (cost-efficient, high-throughput)
 *   "strong"  — sonnet-4-5  (complex reasoning, longer context)
 *   "local"   — ollama      (no rate limits, fully offline)
 *   "cheap"   — groq        (near-zero cost, fast inference)
 *
 * The lane metadata is written into the task JSON so completed/ and failed/
 * records carry full routing provenance for observability.
 */

// ── Model tier definitions ────────────────────────────────────────────────────

const TIER = {
  minimax: 'minimax/minimax-m2.7',
  haiku:  'anthropic/claude-haiku-4-5',
  sonnet: 'anthropic/claude-sonnet-4-5',
  groq8b: 'groq/llama-3.1-8b-instant',
  groq70b:'groq/llama-3.3-70b-versatile',
  local:  'ollama/llama3.2:3b',
};

// ── Per-class lane definitions ────────────────────────────────────────────────

const LANES = {
  /**
   * orchestration — orchestrator (platform_id: 'main')
   * Light coordination tasks. Haiku handles the bulk; escalate to Sonnet
   * only for multi-step plans that need stronger context tracking.
   */
  orchestration: {
    model_lane:     TIER.minimax,
    fallback_models: [TIER.haiku, TIER.sonnet],
    lane_label:     'fast',
  },

  /**
   * reasoning — reasoning_engine (platform_id: 'thor')
   * Deep analysis and problem-solving. Sonnet is primary; fall back to
   * Haiku when rate-limited or for simpler queries.
   */
  reasoning: {
    model_lane:     TIER.sonnet,
    fallback_models: [TIER.haiku],
    lane_label:     'strong',
  },

  /**
   * documentation — documentation_agent (platform_id: 'adam')
   * Writing and archiving. Groq Llama is cost-free and fast for structured
   * text generation; Haiku as cloud fallback when Groq quota is exhausted.
   */
  documentation: {
    model_lane:     TIER.groq8b,
    fallback_models: [TIER.haiku],
    lane_label:     'cheap',
  },

  /**
   * monitoring — monitor_agent (platform_id: 'loki')
   * Lightweight status checks, heartbeats, connectivity probes.
   * Local model only — no cloud round-trips, no rate-limit exposure.
   * Fallback to Haiku if Ollama is unavailable.
   */
  monitoring: {
    model_lane:     TIER.local,
    fallback_models: [TIER.haiku],
    lane_label:     'local',
  },

  /**
   * system_event — documentation_agent (platform_id: 'adam')
   * Config/architecture change events. Haiku is sufficient; these are
   * structured payloads with known templates — no heavy reasoning needed.
   */
  system_event: {
    model_lane:     TIER.minimax,
    fallback_models: [TIER.haiku, TIER.sonnet],
    lane_label:     'fast',
  },
};

// ── Default lane for unknown classes ─────────────────────────────────────────

const DEFAULT_LANE = {
  model_lane:     TIER.minimax,
  fallback_models: [TIER.haiku, TIER.sonnet],
  lane_label:     'fast',
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the model lane for a task class.
 * Returns { model_lane, fallback_models, lane_label }.
 *
 * @param {string} taskClass — one of the five canonical class names
 * @returns {{ model_lane: string, fallback_models: string[], lane_label: string }}
 */
function getModelLane(taskClass) {
  return LANES[taskClass] || DEFAULT_LANE;
}

/**
 * Annotate a task object with routing metadata in-place.
 * Writes assigned_agent, model_lane, fallback_models, and lane_label.
 * Also stamps routing_decided_at so we can trace when the decision was made.
 *
 * @param {object} task       — mutable task object
 * @param {string} taskClass  — classified task class
 * @param {string} agentId    — agent selected by router.js
 * @returns {object}          — the same task object (mutated)
 */
function annotateTask(task, taskClass, agentId) {
  const lane = getModelLane(taskClass);

  task.assigned_agent      = agentId;
  task.model_lane          = lane.model_lane;
  task.fallback_models     = lane.fallback_models;
  task.lane_label          = lane.lane_label;
  task.routing_decided_at  = new Date().toISOString();

  return task;
}

/**
 * Return a compact routing summary string suitable for log lines.
 *
 * @param {string} taskClass
 * @param {string} agentId
 * @returns {string}  e.g. "reasoning → thor | strong (sonnet-4-5 → haiku-4-5)"
 */
function describeRouting(taskClass, agentId) {
  const lane    = getModelLane(taskClass);
  const primary = lane.model_lane.split('/').pop();
  const fbs     = lane.fallback_models.map(m => m.split('/').pop()).join(' → ');
  const fbStr   = fbs ? ` → ${fbs}` : '';
  return `${taskClass} → ${agentId} | ${lane.lane_label} (${primary}${fbStr})`;
}

/**
 * Validate that a model string is in the known tier registry.
 * Useful for testing and for future dynamic reconfiguration.
 *
 * @param {string} model
 * @returns {boolean}
 */
function isKnownModel(model) {
  return Object.values(TIER).includes(model);
}

module.exports = {
  getModelLane,
  annotateTask,
  describeRouting,
  isKnownModel,
  LANES,
  TIER,
};
