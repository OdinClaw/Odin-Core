'use strict';
/**
 * collect_files.js
 * Collects files for Tesla export based on a manifest + exclusion targets.
 *
 * Returns structured file lists — does NOT read or write file content.
 * Sanitization is handled downstream by sanitize_export.js.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const BASE_DIR = path.join(os.homedir(), '.openclaw-odin');

// ── Exclusion matching ────────────────────────────────────────────────────────

/**
 * Test whether a relative path matches an exclusion pattern.
 * Patterns can be:
 *   "dir/"           — any path starting with this prefix
 *   "**\/pattern"    — any path containing this filename or suffix
 *   "*.ext"          — any file ending with .ext (basename match)
 *   "exact/path"     — exact relative path match or prefix match
 */
function matchesExclusion(relPath, pattern) {
  const norm = relPath.replace(/\\/g, '/');
  const pat  = pattern.replace(/\\/g, '/');

  if (pat.endsWith('/')) {
    // Directory prefix — match any file inside
    return norm === pat.slice(0, -1) || norm.startsWith(pat);
  }

  if (pat.startsWith('**/')) {
    const suffix = pat.slice(3);
    if (suffix.startsWith('*.')) {
      // e.g. **/*.log — any file with this extension anywhere
      return path.basename(norm).endsWith(suffix.slice(1));
    }
    // e.g. **/node_modules/ — handled above; **/filename — any path ending
    return norm.endsWith('/' + suffix) || norm === suffix;
  }

  if (pat.includes('*')) {
    // Wildcard in filename — match against basename only
    const base   = path.basename(norm);
    const parts  = pat.split('*');
    const prefix = parts[0];
    const suffix = parts[parts.length - 1];
    return base.startsWith(prefix) && base.endsWith(suffix);
  }

  // Exact match or directory prefix
  return norm === pat || norm.startsWith(pat + '/') || norm.startsWith(pat);
}

function isExcluded(relPath, excludePatterns) {
  return excludePatterns.some(p => matchesExclusion(relPath, p));
}

// ── Directory walker ──────────────────────────────────────────────────────────

/**
 * Recursively walk dirPath, collecting files into results[].
 * relBase is the relative prefix accumulated so far.
 */
function walkDir(dirPath, relBase, excludePatterns, results) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (_) {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath  = relBase ? `${relBase}/${entry.name}` : entry.name;

    if (isExcluded(relPath, excludePatterns)) continue;
    // Also check basename-only exclusion for directory names
    if (isExcluded(entry.name + '/', excludePatterns)) continue;

    if (entry.isDirectory()) {
      walkDir(fullPath, relPath, excludePatterns, results);
    } else if (entry.isFile()) {
      results.push({ src: fullPath, relPath });
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Collect files for a full system export.
 *
 * @param {object} manifest   - full_export.json contents
 * @param {object} targets    - export_targets.json contents  (targets.exclude = string[])
 * @param {string} [srcBase]  - source root (defaults to ~/.openclaw-odin)
 * @returns {{ files: Array<{src,relPath}>, excluded: string[], missing: string[] }}
 */
function collectSystemFiles(manifest, targets, srcBase) {
  srcBase = srcBase || BASE_DIR;
  const excludePatterns = targets.exclude || [];
  const files    = [];
  const excluded = [];
  const missing  = [];

  for (const item of manifest.items) {
    const itemPath = item.path.replace(/\/$/, '');  // strip trailing slash for stat
    const absPath  = path.join(srcBase, itemPath);

    // Apply manifest-level exclusion first
    if (isExcluded(item.path, excludePatterns)) {
      excluded.push(item.path);
      continue;
    }

    if (!fs.existsSync(absPath)) {
      if (item.required) missing.push(item.path);
      // non-required missing items are silently skipped
      continue;
    }

    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      walkDir(absPath, itemPath, excludePatterns, files);
    } else if (stat.isFile()) {
      if (!isExcluded(item.path, excludePatterns)) {
        files.push({ src: absPath, relPath: item.path });
      }
    }
  }

  return { files, excluded, missing };
}

/**
 * Collect files for a single-agent export.
 *
 * @param {string} platformId - agent platform ID (e.g. 'adam')
 * @param {string} pathKey    - agent path_key from agents.json
 * @param {object} manifest   - agent_export.json contents
 * @param {string} [srcBase]  - source root
 * @returns {{ files: Array<{src,relPath}>, missing: string[] }}
 */
function collectAgentFiles(platformId, pathKey, manifest, srcBase) {
  srcBase = srcBase || BASE_DIR;
  const files   = [];
  const missing = [];

  // ── Core config items ─────────────────────────────────────────────────
  for (const item of manifest.items) {
    const absPath = path.join(srcBase, item.path);
    if (!fs.existsSync(absPath)) {
      if (item.required) missing.push(item.path);
      continue;
    }
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      walkDir(absPath, item.path.replace(/\/$/, ''), [], files);
    } else {
      files.push({ src: absPath, relPath: item.path });
    }
  }

  // ── Workspace items (path_key substituted) ────────────────────────────
  // Compute manifest never_include for this agent
  const neverInclude = (manifest.never_include || [])
    .map(p => p.replace('{path_key}', pathKey));

  for (const item of manifest.workspace_items || []) {
    const resolvedRel = item.path.replace('{path_key}', pathKey);
    const absPath     = path.join(srcBase, resolvedRel);

    if (!fs.existsSync(absPath)) {
      if (item.required) missing.push(resolvedRel);
      continue;
    }

    const cleanRel = resolvedRel.replace(/\/$/, '');
    const stat     = fs.statSync(absPath);

    if (stat.isDirectory()) {
      walkDir(absPath, cleanRel, neverInclude, files);
    } else {
      if (!isExcluded(resolvedRel, neverInclude)) {
        files.push({ src: absPath, relPath: resolvedRel });
      }
    }
  }

  return { files, missing };
}

module.exports = { collectSystemFiles, collectAgentFiles, isExcluded, walkDir };
