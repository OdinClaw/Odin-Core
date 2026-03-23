'use strict';
/**
 * sanitize_export.js
 * Tesla sanitization engine.
 *
 * Policy:
 *   ABORT  — if any file contains a recognized secret pattern. Fail closed.
 *   REDACT — machine-specific paths replaced with portable placeholders.
 *   SKIP   — binary files are copied as-is without content scanning.
 *
 * Uncertainty principle: when in doubt, abort rather than expose.
 */

const fs   = require('fs');
const path = require('path');

// File extensions treated as binary — content scan skipped, file copied directly.
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp',
  '.svg', '.zip', '.tar', '.gz', '.br', '.7z',
  '.ttf', '.woff', '.woff2', '.eot',
  '.pdf', '.mp3', '.mp4', '.wav', '.ogg', '.avi',
  '.exe', '.bin', '.so', '.dylib', '.node',
]);

/**
 * Files that contain SECRET PATTERN DEFINITIONS, not real secrets.
 * These are Tesla's own rule/config files whose content looks like secrets
 * to the scanner (regex strings, placeholder tokens) but must be exported.
 *
 * Policy: skip the abort-scan pass for these files only.
 *         Redaction still runs (machine paths are still replaced).
 *         This exemption is narrow and explicit — not a general loophole.
 */
const RULE_DEFINITION_FILES = new Set([
  'tesla/config/sanitize_rules.json',
]);

// ── Rule compilation ──────────────────────────────────────────────────────────

/**
 * Compile sanitize_rules.json into runtime regex objects.
 * Called once per export run and reused across all files.
 */
function compileRules(rules) {
  return {
    abort: (rules.abort_on_match || []).map(r => ({
      id:          r.id,
      description: r.description,
      severity:    r.severity,
      regex:       new RegExp(r.pattern, 'g'),
    })),
    redact: (rules.redact_patterns || []).map(r => ({
      id:          r.id,
      description: r.description,
      replacement: r.replacement,
      regex:       new RegExp(r.pattern, 'g'),
    })),
    excludeFilenames: new Set(rules.always_exclude_filenames || []),
    excludeDirs:      new Set(rules.always_exclude_dirs || []),
  };
}

// ── Filename-level gate ───────────────────────────────────────────────────────

/**
 * Check whether a file should be excluded purely by name/path.
 * This is a safety-net check — collect_files should have already filtered most.
 *
 * @returns {{ excluded: boolean, reason?: string }}
 */
function isExcludedByName(relPath, compiled) {
  const base  = path.basename(relPath);
  const parts = relPath.replace(/\\/g, '/').split('/');

  // Directory component check
  for (const part of parts.slice(0, -1)) {
    if (compiled.excludeDirs.has(part)) {
      return { excluded: true, reason: `excluded dir: ${part}` };
    }
  }

  // Exact filename match
  if (compiled.excludeFilenames.has(base)) {
    return { excluded: true, reason: `excluded filename: ${base}` };
  }

  // Wildcard pattern match (e.g. *.log)
  for (const pat of compiled.excludeFilenames) {
    if (pat.startsWith('*.') && base.endsWith(pat.slice(1))) {
      return { excluded: true, reason: `excluded pattern: ${pat}` };
    }
  }

  return { excluded: false };
}

// ── Content sanitizer ─────────────────────────────────────────────────────────

/**
 * Sanitize the content of a single file.
 *
 * @param {string} content   - raw file text
 * @param {string} relPath   - relative path (for logging and binary detection)
 * @param {object} compiled  - compiled rules from compileRules()
 * @returns
 *   { safe: true,  content: string, redactions: number, skipped?: boolean }
 *   { safe: false, reason: string, match: string, file: string }
 */
function sanitizeContent(content, relPath, compiled) {
  const ext = path.extname(relPath).toLowerCase();

  if (BINARY_EXTENSIONS.has(ext)) {
    return { safe: true, content, redactions: 0, skipped: true };
  }

  // ── Abort pass: check for secrets ────────────────────────────────────
  for (const rule of compiled.abort) {
    rule.regex.lastIndex = 0;
    const match = rule.regex.exec(content);
    if (match) {
      // Mask most of the match for safe logging
      const visible = match[0].slice(0, 6) + '***';
      return {
        safe:   false,
        reason: `${rule.id}: ${rule.description}`,
        match:  visible,
        file:   relPath,
      };
    }
  }

  // ── Redact pass: replace machine-specific paths ───────────────────────
  let sanitized  = content;
  let redactions = 0;

  for (const rule of compiled.redact) {
    rule.regex.lastIndex = 0;
    const before  = sanitized;
    sanitized     = sanitized.replace(rule.regex, rule.replacement);
    if (sanitized !== before) redactions++;
  }

  return { safe: true, content: sanitized, redactions };
}

// ── Batch sanitizer ───────────────────────────────────────────────────────────

/**
 * Sanitize a collected file list and optionally write to destDir.
 *
 * @param {Array<{src, relPath}>} files  - output of collectSystemFiles / collectAgentFiles
 * @param {string}  destDir              - destination directory for sanitized copies
 * @param {object}  rules                - raw sanitize_rules.json object
 * @param {boolean} dryRun               - if true, scan but do not write files
 * @returns {{
 *   ok:       boolean,
 *   sanitized: Array<{relPath, redactions, binary}>,
 *   redacted:  Array<{relPath, redactions}>,
 *   aborted:   object|null,
 *   scanned:   number,
 * }}
 */
function sanitizeExport(files, destDir, rules, dryRun) {
  dryRun = dryRun === true;
  const compiled  = compileRules(rules);
  const sanitized = [];
  const redacted  = [];
  let   aborted   = null;

  for (const { src, relPath } of files) {

    // Safety-net filename exclusion
    const nameCheck = isExcludedByName(relPath, compiled);
    if (nameCheck.excluded) continue;

    // Try to read as text; fall back to binary copy
    let rawContent;
    try {
      rawContent = fs.readFileSync(src, 'utf8');
    } catch (_) {
      // File is binary or unreadable as text — copy verbatim
      if (!dryRun) {
        const destPath = path.join(destDir, relPath);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(src, destPath);
      }
      sanitized.push({ relPath, binary: true, redactions: 0 });
      continue;
    }

    // Rule-definition files: skip abort-scan, run redact only.
    // These files contain pattern definitions that look like secrets to the
    // scanner but are not actual credentials. Exemption is explicit and narrow.
    let result;
    if (RULE_DEFINITION_FILES.has(relPath)) {
      let content = rawContent;
      let redactions = 0;
      const compiled2 = compiled;  // same compiled rules, redact pass only
      for (const rule of compiled2.redact) {
        rule.regex.lastIndex = 0;
        const before = content;
        content = content.replace(rule.regex, rule.replacement);
        if (content !== before) redactions++;
      }
      result = { safe: true, content, redactions };
    } else {
      result = sanitizeContent(rawContent, relPath, compiled);
    }

    if (!result.safe) {
      aborted = { ...result };
      return { ok: false, sanitized, redacted, aborted, scanned: sanitized.length };
    }

    if (!dryRun) {
      const destPath = path.join(destDir, relPath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, result.content, 'utf8');
    }

    sanitized.push({ relPath, binary: false, redactions: result.redactions });
    if (result.redactions > 0) {
      redacted.push({ relPath, redactions: result.redactions });
    }
  }

  return { ok: true, sanitized, redacted, aborted: null, scanned: sanitized.length };
}

module.exports = {
  sanitizeExport,
  sanitizeContent,
  compileRules,
  isExcludedByName,
  RULE_DEFINITION_FILES,
};
