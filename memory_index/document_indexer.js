#!/usr/bin/env node
'use strict';
/**
 * document_indexer.js
 * Filesystem watcher for Adam's document output directories.
 *
 * Watches:
 *   workspace/agents/adam/documents/architecture/  → architecture_index
 *   workspace/agents/adam/documents/decisions/     → decision_index
 *   workspace/agents/adam/documents/summaries/     → summary_index
 *
 * On .txt file create/modify:
 *   1. Parse the document using the template field map
 *   2. Extract: date, topic, agents_involved, summary
 *   3. Upsert the entry in the appropriate index
 *
 * Template formats:
 *
 *   Architecture Note           Decision Record             Discussion Summary
 *   ─────────────────           ───────────────             ──────────────────
 *   Date: ...                   Date: ...                   Date: ...
 *   System: ...                 System: ...                 Channel: ...
 *   Change: ...                 Decision: ...               Summary: ...
 *   Details: ...                Reason: ...                 Key Points: ...
 *   Impact: ...                 Impact: ...                 Actions: ...
 *   Related Agents: ...         Related Components: ...
 */

const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const { upsertByFile } = require('./index_manager');
const { getAgentWorkspacePath } = require('../config/paths');

// ── Paths ─────────────────────────────────────────────────────────────────────

const HOME = os.homedir();

// Resolved via paths.js so the path tracks path_key in agents.json, not a hardcoded string.
// If the documentation agent's path_key ever changes in agents.json, these update automatically.
const ADAM_DOCS = getAgentWorkspacePath('adam', 'documents');
const ADAM_BASE = getAgentWorkspacePath('adam');

const LOG_FILE  = path.join(HOME, '.openclaw-odin', 'memory_index', 'document_indexer.log');

// Map subdirectory name → index type
const DIR_TO_TYPE = {
  architecture: 'architecture',
  decisions:    'decision',
  summaries:    'summary',
};

// ── Logging ───────────────────────────────────────────────────────────────────

const IS_TTY = process.stdout.isTTY;

function log(level, msg) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}\n`;
  process.stdout.write(line);
  if (IS_TTY) {
    try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
  }
}

// ── Template parsers ──────────────────────────────────────────────────────────

/**
 * Extract a named field value from document text.
 * Handles single-line fields ("Field: value") and
 * multi-line fields (everything until the next field or EOF).
 *
 * @param {string} text     — full document content
 * @param {string} field    — field label as it appears in the template
 * @param {boolean} multiline — capture until next blank line or next labelled field
 * @returns {string}
 */
function extractField(text, field, multiline = false) {
  const labelPattern = new RegExp(
    `^${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.*)$`,
    'im'
  );
  const match = text.match(labelPattern);
  if (!match) return '';

  let value = match[1].trim();

  if (multiline && !value) {
    // Capture subsequent indented/non-label lines
    const startIdx = text.indexOf(match[0]) + match[0].length;
    const rest     = text.slice(startIdx);
    const lines    = rest.split('\n');
    const collected = [];
    for (const line of lines) {
      // Stop at empty line or next labelled field ("Word: ")
      if (line.trim() === '') break;
      if (/^\w[\w\s]+:/.test(line)) break;
      collected.push(line.trim());
    }
    value = collected.join(' ').trim();
  }

  return value;
}

/**
 * Parse comma/semicolon-separated agent names from a field value.
 * Also handles "agent1 and agent2" natural language forms.
 */
function parseAgentList(raw) {
  if (!raw) return [];
  return raw
    .split(/[,;]|\s+and\s+/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length > 0 && s !== 'n/a' && s !== 'none');
}

/**
 * Normalise a date string to YYYY-MM-DD.
 * Accepts ISO dates, "March 17 2026", "17/03/2026", etc.
 */
function normaliseDate(raw) {
  if (!raw) return new Date().toISOString().slice(0, 10);
  // Already ISO-ish
  const iso = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  // Attempt JS Date parse for natural language
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

// ── Per-template parsers ──────────────────────────────────────────────────────

function parseArchitecture(text) {
  const date    = normaliseDate(extractField(text, 'Date'));
  const system  = extractField(text, 'System');
  const change  = extractField(text, 'Change', true);
  const details = extractField(text, 'Details', true);
  const impact  = extractField(text, 'Impact',  true);
  const agents  = parseAgentList(extractField(text, 'Related Agents'));

  // Topic = System: Change
  const topicParts = [system, change].filter(Boolean);
  const topic      = topicParts.join(': ') || change || '(Architecture note)';

  // Summary = first 300 chars of Details, fall back to Impact
  const summary = (details || impact || change || '').slice(0, 300).trim();

  return { date, topic, agents_involved: agents, summary };
}

function parseDecision(text) {
  const date       = normaliseDate(extractField(text, 'Date'));
  const system     = extractField(text, 'System');
  const decision   = extractField(text, 'Decision', true);
  const reason     = extractField(text, 'Reason',   true);
  const components = parseAgentList(extractField(text, 'Related Components'));

  const topicParts = [system, decision].filter(Boolean);
  const topic      = topicParts.join(': ') || decision || '(Decision record)';
  const summary    = (reason || decision || '').slice(0, 300).trim();

  return { date, topic, agents_involved: components, summary };
}

function parseSummary(text) {
  const date     = normaliseDate(extractField(text, 'Date'));
  const channel  = extractField(text, 'Channel');
  const summaryV = extractField(text, 'Summary',    true);
  const points   = extractField(text, 'Key Points', true);
  const actions  = extractField(text, 'Actions',    true);

  const topic   = channel ? `Discussion in ${channel}` : '(Discussion summary)';
  const summary = (summaryV || points || actions || '').slice(0, 300).trim();

  // No explicit agent field in summary template — derive from channel name if possible
  const agents = channel ? [channel.replace(/^#/, '').toLowerCase()].filter(a => a !== 'adam') : [];

  return { date, topic, agents_involved: agents, summary };
}

// ── Document type detector ────────────────────────────────────────────────────

const HEADER_PATTERNS = {
  architecture: /^Architecture Note/im,
  decision:     /^Decision Record/im,
  summary:      /^Discussion Summary/im,
};

/**
 * Detect document type from its content header line.
 * Falls back to the parent directory name.
 */
function detectDocType(text, dirType) {
  for (const [type, pattern] of Object.entries(HEADER_PATTERNS)) {
    if (pattern.test(text)) return type;
  }
  return dirType;   // fall back to directory-derived type
}

// ── Main indexer ──────────────────────────────────────────────────────────────

/**
 * Read, parse, and index a single document file.
 * @param {string} filepath   — absolute path to the .txt document
 * @param {string} dirType    — 'architecture' | 'decision' | 'summary'
 * @returns {object|null}     — the index entry, or null on failure
 */
function indexDocument(filepath, dirType) {
  let text;
  try {
    text = fs.readFileSync(filepath, 'utf8');
  } catch (err) {
    log('WARN', `Cannot read ${filepath}: ${err.message}`);
    return null;
  }

  if (!text.trim()) {
    log('DEBUG', `Skipping empty file: ${filepath}`);
    return null;
  }

  const docType = detectDocType(text, dirType);

  // Parse metadata by document type
  let parsed;
  switch (docType) {
    case 'architecture': parsed = parseArchitecture(text); break;
    case 'decision':     parsed = parseDecision(text);     break;
    case 'summary':      parsed = parseSummary(text);      break;
    default:
      log('WARN', `Unknown doc type "${docType}" for ${filepath} — skipping`);
      return null;
  }

  // File path stored relative to ADAM_BASE for portability
  const relFile = filepath.startsWith(ADAM_BASE)
    ? filepath.slice(ADAM_BASE.length).replace(/^\//, '')
    : filepath;

  const entry = {
    ...parsed,
    file: relFile,
  };

  const indexed = upsertByFile(docType, entry);

  log('INFO',
    `Indexed [${docType}] "${indexed.topic.slice(0, 60)}" ` +
    `agents=${indexed.agents_involved.join(',') || 'none'} ` +
    `file=${relFile}`
  );

  return indexed;
}

// ── Watcher ───────────────────────────────────────────────────────────────────

// Debounce per-file to avoid double-events on save
const FILE_DEBOUNCE_MS = 1500;
const fileTimers = new Map();

function handleFileChange(filepath, dirType) {
  if (!filepath.endsWith('.txt')) return;

  if (fileTimers.has(filepath)) {
    clearTimeout(fileTimers.get(filepath));
  }
  fileTimers.set(filepath, setTimeout(() => {
    fileTimers.delete(filepath);
    log('INFO', `Change detected: ${filepath.replace(HOME, '~')}`);
    indexDocument(filepath, dirType);
  }, FILE_DEBOUNCE_MS));
}

function watchDir(dirPath, dirType) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });

    const watcher = fs.watch(dirPath, { persistent: true }, (_evt, filename) => {
      if (!filename) return;
      handleFileChange(path.join(dirPath, filename), dirType);
    });

    watcher.on('error', (err) => {
      log('ERROR', `Watcher error on ${dirPath}: ${err.message} — retrying in 5s`);
      setTimeout(() => watchDir(dirPath, dirType), 5_000);
    });

    log('INFO', `Watching [${dirType}]: ${dirPath.replace(HOME, '~')}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      log('WARN', `Dir not found (retry in 30s): ${dirPath.replace(HOME, '~')}`);
      setTimeout(() => watchDir(dirPath, dirType), 30_000);
    } else {
      log('ERROR', `Cannot watch ${dirPath}: ${err.message}`);
    }
  }
}

// ── Backfill ──────────────────────────────────────────────────────────────────

/**
 * On startup, scan all watched directories and index any .txt files
 * that are not already present in the index (by file path).
 */
function backfill() {
  let total = 0;
  for (const [subdir, idxType] of Object.entries(DIR_TO_TYPE)) {
    const dir = path.join(ADAM_DOCS, subdir);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    let count   = 0;
    for (const f of files) {
      const result = indexDocument(path.join(dir, f), idxType);
      if (result) count++;
    }
    if (count > 0) log('INFO', `Backfill [${idxType}]: ${count} file(s) indexed`);
    total += count;
  }
  if (total === 0) log('INFO', 'Backfill: no new documents found');
  else             log('INFO', `Backfill complete: ${total} document(s) indexed`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

function main() {
  try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch (_) {}

  log('INFO', '─────────────────────────────────────────────');
  log('INFO', 'document_indexer started');
  log('INFO', `PID: ${process.pid}`);
  log('INFO', `Index dir: ${path.join(HOME, '.openclaw-odin', 'memory_index').replace(HOME, '~')}`);
  log('INFO', `Debounce: ${FILE_DEBOUNCE_MS}ms`);

  // Backfill existing documents
  backfill();

  // Start watchers for each document subdirectory
  for (const [subdir, idxType] of Object.entries(DIR_TO_TYPE)) {
    watchDir(path.join(ADAM_DOCS, subdir), idxType);
  }

  log('INFO', 'Watching. Waiting for Adam to write documents…');

  process.stdin.resume();

  setInterval(() => {
    const { stats } = require('./index_manager');
    const lines = ['architecture', 'decision', 'summary'].map(t => {
      const s = stats(t);
      return `${t}=${s.count}`;
    });
    log('INFO', `Heartbeat — ${lines.join(' ')}`);
  }, 30 * 60 * 1000);

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      log('INFO', `${sig} — shutting down`);
      process.exit(0);
    });
  }
}

main();
