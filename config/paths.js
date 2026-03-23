'use strict';
/**
 * paths.js
 * Filesystem path resolution helpers for agent directories.
 *
 * WHY THIS EXISTS:
 *   Previously, filesystem paths were built by string-concatenating display
 *   names directly into path.join() calls (e.g. `workspace/agents/adam/`).
 *   That means renaming a display_name would silently break file access.
 *
 *   This module resolves paths from the stable `path_key` stored in
 *   config/agents.json, which defaults to the platform ID — never the
 *   display name. This decouples the display layer from the disk layout.
 *
 * DIRECTORY LAYOUT:
 *   ~/.openclaw-odin/agents/<path_key>/           — OpenClaw sessions, memory
 *   ~/.openclaw-odin/workspace/agents/<path_key>/ — identity docs, workspace files
 *   ~/.openclaw-odin/workspace/                   — shared workspace root
 *
 * REBRAND SAFETY:
 *   Changing an agent's display_name in agents.json has ZERO effect on paths.
 *   To physically rename agent directories:
 *     1. Move/rename the directory on disk
 *     2. Update path_key in agents.json to match
 *     3. Restart affected processes (or call reloadConfig() in names.js)
 *
 * Usage:
 *   const { getAgentWorkspacePath, getAgentSessionPath } = require('../../config/paths');
 *   getAgentWorkspacePath('adam', 'documents')        // → ~/.openclaw-odin/workspace/agents/adam/documents
 *   getAgentWorkspacePath('adam', 'documents', 'architecture') // → .../architecture
 *   getAgentSessionPath('main')                       // → ~/.openclaw-odin/agents/main
 */

const path = require('path');
const os   = require('os');

// names.js is the single source of truth for path_key resolution.
// We import only getAgentPathKey to keep the dependency minimal.
const { getAgentPathKey } = require('./names');

const HOME     = os.homedir();
const BASE_DIR = path.join(HOME, '.openclaw-odin');

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Resolve a path inside an agent's OpenClaw session directory.
 *
 *   ~/.openclaw-odin/agents/<path_key>/[...subParts]
 *
 * @param {string}    platformId — agent platform ID (e.g. 'adam', 'main')
 * @param {...string} subParts   — optional path segments to append
 * @returns {string}             — absolute path
 */
function getAgentSessionPath(platformId, ...subParts) {
  const key = getAgentPathKey(platformId);
  return path.join(BASE_DIR, 'agents', key, ...subParts);
}

/**
 * Resolve a path inside an agent's workspace directory.
 *
 *   ~/.openclaw-odin/workspace/agents/<path_key>/[...subParts]
 *
 * @param {string}    platformId — agent platform ID (e.g. 'adam', 'main')
 * @param {...string} subParts   — optional path segments to append
 * @returns {string}             — absolute path
 */
function getAgentWorkspacePath(platformId, ...subParts) {
  const key = getAgentPathKey(platformId);
  return path.join(BASE_DIR, 'workspace', 'agents', key, ...subParts);
}

/**
 * Resolve a path inside the shared workspace root (not agent-specific).
 *
 *   ~/.openclaw-odin/workspace/[...subParts]
 *
 * @param {...string} subParts
 * @returns {string}
 */
function getWorkspacePath(...subParts) {
  return path.join(BASE_DIR, 'workspace', ...subParts);
}

/**
 * Return the base openclaw-odin data directory.
 * Use when constructing paths outside the standard agent/workspace subtree.
 *
 * @returns {string}  ~/.openclaw-odin
 */
function getBaseDir() {
  return BASE_DIR;
}

module.exports = {
  getAgentSessionPath,
  getAgentWorkspacePath,
  getWorkspacePath,
  getBaseDir,
};
