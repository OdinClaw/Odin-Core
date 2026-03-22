'use strict';
/**
 * names.js
 * Config-driven naming, identity, and path-key compatibility layer.
 *
 * ── KEY CONCEPTS ─────────────────────────────────────────────────────────────
 *
 *  platform_id   Stable technical key used by the OpenClaw binary and routing
 *                code (e.g. 'adam', 'main'). NEVER changes. Used as --agent
 *                flag and as the top-level key in agents.json.
 *
 *  functional_id Descriptive semantic name for the agent's role in the system
 *                (e.g. 'documentation_agent', 'orchestrator'). Stored in
 *                agents.json. Used for code clarity — not for routing.
 *
 *  display_name  Human-visible name in UI, logs, and AI prompts. Fully
 *                configurable. Changing it has zero runtime or routing impact.
 *
 *  path_key      Directory name on disk for agent files. Defaults to
 *                platform_id. Only update if directories are actually renamed.
 *
 * ── REBRAND SUPPORT ──────────────────────────────────────────────────────────
 *
 *  To rebrand for a new environment:
 *   1. Edit config/system.json  → change system_name (and system_id if needed)
 *   2. Edit config/agents.json  → change display_name for any/all agents
 *   3. Restart processes or call reloadConfig()
 *   → No code changes required anywhere else.
 *
 * ── CONFIG RELOAD ────────────────────────────────────────────────────────────
 *
 *  By default, config is cached indefinitely (process-stable, no disk I/O
 *  after first load). To change this:
 *
 *   • Set  CONFIG_HOT_RELOAD=true  → enables 30-second TTL cache.
 *   • Call reloadConfig()          → forces an immediate cache flush.
 *
 *  NOTE: preprocessor.js system prompts are computed at module-load time as
 *  string constants. They pick up reloaded names only if the module is also
 *  reloaded (i.e. on process restart). This is a known limitation documented
 *  in preprocessor.js.
 *
 * ── FALLBACK CONTRACT ────────────────────────────────────────────────────────
 *
 *  If config files are missing, malformed, or partially broken:
 *   • AGENT_DEFAULTS is used (hardcoded below)
 *   • getAgentName('adam') always returns 'Adam' even without agents.json
 *   • The system never throws from a missing config file
 *
 * Usage:
 *   const { getAgentName, getSystemName, getAgentPathKey } = require('../../config/names');
 */

const fs   = require('fs');
const path = require('path');

const CONFIG_DIR = __dirname;

// ── Hot reload settings ────────────────────────────────────────────────────────

const HOT_RELOAD   = process.env.CONFIG_HOT_RELOAD === 'true';
const CACHE_TTL_MS = HOT_RELOAD ? 30_000 : Infinity;  // 30s window when enabled

// ── Hardcoded fallback defaults ────────────────────────────────────────────────
// Used when config files are missing or malformed. Always mirrors the live
// agent roster so the system is operational without config files present.

const AGENT_DEFAULTS = {
  main:       { display_name: 'Odin',       functional_id: 'orchestrator',             role: 'orchestration',      path_key: 'main'       },
  loki:       { display_name: 'Loki',       functional_id: 'monitor_agent',            role: 'monitoring',         path_key: 'loki'       },
  thor:       { display_name: 'Thor',       functional_id: 'reasoning_engine',         role: 'reasoning',          path_key: 'thor'       },
  adam:       { display_name: 'Adam',       functional_id: 'documentation_agent',      role: 'documentation',      path_key: 'adam'       },
  apollo:     { display_name: 'Apollo',     functional_id: 'social_analytics_agent',   role: 'social_analytics',   path_key: 'apollo'     },
  buddha:     { display_name: 'Buddha',     functional_id: 'thought_leadership_agent', role: 'thought_leadership', path_key: 'buddha'     },
  beelzebub:  { display_name: 'Beelzebub', functional_id: 'rnd_lab_agent',            role: 'rnd_lab',            path_key: 'beelzebub'  },
  chronus:    { display_name: 'Chronus',   functional_id: 'content_scheduler_agent',  role: 'content_scheduler',  path_key: 'chronus'    },
  hades:      { display_name: 'Hades',     functional_id: 'security_auditor_agent',   role: 'security_auditor',   path_key: 'hades'      },
  hercules:   { display_name: 'Hercules',  functional_id: 'community_bot_agent',      role: 'community_bot',      path_key: 'hercules'   },
  hermes:     { display_name: 'Hermes',    functional_id: 'collab_leads_agent',       role: 'collab_leads',       path_key: 'hermes'     },
  qin:        { display_name: 'Qin',       functional_id: 'usage_tracker_agent',      role: 'usage_tracker',      path_key: 'qin'        },
  shiva:      { display_name: 'Shiva',     functional_id: 'trading_bot_agent',        role: 'trading_bot',        path_key: 'shiva'      },
  tesla:      { display_name: 'Tesla',     functional_id: 'portfolio_curator_agent',  role: 'portfolio_curator',  path_key: 'tesla'      },
  zeus:       { display_name: 'Zeus',      functional_id: 'insurance_analyzer_agent', role: 'insurance_analyzer', path_key: 'zeus'       },
};

const SYSTEM_DEFAULTS = {
  system_id:          'odin_core',
  system_name:        'Odin',
  system_description: 'Agentic AI Operating System',
};

// ── Config cache state ─────────────────────────────────────────────────────────

let _agentsConfig   = null;
let _systemConfig   = null;
let _agentsLoadedAt = 0;
let _systemLoadedAt = 0;

function _isCacheExpired(loadedAt) {
  return CACHE_TTL_MS !== Infinity && (Date.now() - loadedAt) > CACHE_TTL_MS;
}

// ── Config loaders (lazy, TTL-cached) ─────────────────────────────────────────

function loadAgentsConfig() {
  if (_agentsConfig !== null && !_isCacheExpired(_agentsLoadedAt)) return _agentsConfig;
  try {
    const raw     = fs.readFileSync(path.join(CONFIG_DIR, 'agents.json'), 'utf8');
    _agentsConfig = JSON.parse(raw);
    _agentsLoadedAt = Date.now();
  } catch (_) {
    // First-load failure: use empty object (AGENT_DEFAULTS will fill the gaps).
    // Hot-reload failure: keep stale cache — better than losing all names.
    if (_agentsConfig === null) _agentsConfig = {};
  }
  return _agentsConfig;
}

function loadSystemConfig() {
  if (_systemConfig !== null && !_isCacheExpired(_systemLoadedAt)) return _systemConfig;
  try {
    const raw     = fs.readFileSync(path.join(CONFIG_DIR, 'system.json'), 'utf8');
    _systemConfig = JSON.parse(raw);
    _systemLoadedAt = Date.now();
  } catch (_) {
    if (_systemConfig === null) _systemConfig = {};
  }
  return _systemConfig;
}

// ── Internal: resolve a full agent entry ──────────────────────────────────────

/**
 * Merge config entry + defaults for a given platform ID.
 * Always returns a complete object — never null.
 */
function _resolveAgent(platformId) {
  const config       = loadAgentsConfig();
  const configEntry  = config[platformId] || {};
  const defaultEntry = AGENT_DEFAULTS[platformId] || { display_name: platformId, path_key: platformId };
  return { ...defaultEntry, ...configEntry };
}

// ── Public API — display names ─────────────────────────────────────────────────

/**
 * Get the display name for an agent.
 * Resolution: agents.json → AGENT_DEFAULTS → platformId itself (last resort).
 *
 * @param {string} platformId  e.g. 'main', 'adam'
 * @returns {string}           e.g. 'Odin', 'Adam'
 */
function getAgentName(platformId) {
  return _resolveAgent(platformId).display_name || platformId;
}

/**
 * Get the system display name.
 * Resolution: system.json → SYSTEM_DEFAULTS.system_name.
 *
 * @returns {string}
 */
function getSystemName() {
  const config = loadSystemConfig();
  return config.system_name || SYSTEM_DEFAULTS.system_name;
}

/**
 * Get the full system config object (merged: SYSTEM_DEFAULTS + system.json).
 *
 * @returns {{ system_id: string, system_name: string, system_description: string }}
 */
function getSystemConfig() {
  const config = loadSystemConfig();
  return { ...SYSTEM_DEFAULTS, ...config };
}

/**
 * Get agent display names as a comma-separated lowercase string.
 * Used by the preprocessor's compression preservation rules to tell the
 * compressor model which names must never be altered in task payloads.
 *
 * @param {string[]} platformIds   ordered list of platform IDs
 * @returns {string}               e.g. "odin, thor, loki, adam"
 */
function getAgentNameList(platformIds) {
  return platformIds.map(id => getAgentName(id).toLowerCase()).join(', ');
}

// ── Public API — functional IDs ────────────────────────────────────────────────

/**
 * Get the functional ID for an agent by its platform ID.
 *
 * @param {string} platformId  e.g. 'adam'
 * @returns {string}           e.g. 'documentation_agent'
 */
function getAgentFunctionalId(platformId) {
  return _resolveAgent(platformId).functional_id || platformId;
}

/**
 * Find an agent by its functional ID.
 * Returns { platformId, ...fullEntry } or null if not found.
 *
 * @param {string} functionalId  e.g. 'documentation_agent'
 * @returns {{ platformId: string, display_name: string, role: string, ... } | null}
 */
function getAgentByFunctionalId(functionalId) {
  const config = loadAgentsConfig();

  // Check live config first
  for (const [id, entry] of Object.entries(config)) {
    if (entry.functional_id === functionalId) {
      return { platformId: id, ...AGENT_DEFAULTS[id], ...entry };
    }
  }

  // Fall back to hardcoded defaults
  for (const [id, entry] of Object.entries(AGENT_DEFAULTS)) {
    if (entry.functional_id === functionalId) {
      const configEntry = config[id] || {};
      return { platformId: id, ...entry, ...configEntry };
    }
  }

  return null;
}

/**
 * Get all known platform IDs (union of defaults and config file).
 *
 * @returns {string[]}
 */
function getAllAgentIds() {
  const config = loadAgentsConfig();
  return [...new Set([...Object.keys(AGENT_DEFAULTS), ...Object.keys(config)])];
}

// ── Public API — path keys ─────────────────────────────────────────────────────

/**
 * Get the path_key for an agent.
 * The path_key is the directory name used on disk for agent files.
 * It defaults to the platform_id and should only be changed if the
 * actual on-disk directories are also renamed.
 *
 * Used by config/paths.js to build all agent filesystem paths.
 *
 * @param {string} platformId  e.g. 'adam'
 * @returns {string}           e.g. 'adam'  (matches directory name)
 */
function getAgentPathKey(platformId) {
  return _resolveAgent(platformId).path_key || platformId;
}

// ── Public API — cache control ─────────────────────────────────────────────────

/**
 * Force an immediate reload of all config caches from disk.
 *
 * Use this in long-running processes after an external config file change
 * when CONFIG_HOT_RELOAD=true TTL-based reload is not fast enough.
 *
 * NOTE: preprocessor.js system prompts are computed at module-load time as
 * string constants and are NOT hot-reloadable without a process restart.
 * See the note in preprocessor.js for details.
 */
function reloadConfig() {
  _agentsConfig   = null;
  _systemConfig   = null;
  _agentsLoadedAt = 0;
  _systemLoadedAt = 0;
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  // Display name API
  getAgentName,
  getSystemName,
  getSystemConfig,
  getAgentNameList,

  // Functional ID API
  getAgentFunctionalId,
  getAgentByFunctionalId,
  getAllAgentIds,

  // Path key API (consumed by config/paths.js)
  getAgentPathKey,

  // Cache control
  reloadConfig,
};
