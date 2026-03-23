'use strict';
/**
 * index_manager.js
 * Core library for Adam's memory retrieval indexes.
 *
 * Manages three JSON index files:
 *   architecture_index.json  — tracks documents/architecture/*.txt
 *   decision_index.json      — tracks documents/decisions/*.txt
 *   summary_index.json       — tracks documents/summaries/*.txt
 *
 * Entry schema:
 * {
 *   id:               "<uuid>",
 *   date:             "YYYY-MM-DD",
 *   file:             "<path relative to workspace/agents/adam/>",
 *   topic:            "<string>",
 *   agents_involved:  ["<agent>", ...],
 *   summary:          "<string>",
 *   indexed_at:       "<ISO>",
 *   tags:             ["<keyword>", ...]   // auto-extracted
 * }
 *
 * Public API:
 *   append(type, entry)           → entry (with assigned id)
 *   update(type, id, patch)       → entry | null
 *   remove(type, id)              → boolean
 *   getById(type, id)             → entry | null
 *   getAll(type)                  → entry[]
 *   query(type, filter)           → entry[]
 *   search(type, text, opts)      → scored[]  { entry, score }
 *   stats(type)                   → { count, oldest, newest }
 *   reindexFile(type, filePath)   → entry (upserts by file path)
 */

const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const { randomUUID } = require('crypto');

// ── Paths ─────────────────────────────────────────────────────────────────────

const HOME      = os.homedir();
const INDEX_DIR = path.join(HOME, '.openclaw-odin', 'memory_index');

const INDEX_FILES = {
  architecture: path.join(INDEX_DIR, 'architecture_index.json'),
  decision:     path.join(INDEX_DIR, 'decision_index.json'),
  summary:      path.join(INDEX_DIR, 'summary_index.json'),
};

// ── Schema ────────────────────────────────────────────────────────────────────

const SCHEMA_VERSION = '1.0';

const EMPTY_INDEX = (type) => ({
  schema_version: SCHEMA_VERSION,
  index_type:     type,
  created_at:     new Date().toISOString(),
  updated_at:     new Date().toISOString(),
  count:          0,
  entries:        [],
});

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_TYPES = Object.keys(INDEX_FILES);

function assertType(type) {
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Unknown index type "${type}". Valid: ${VALID_TYPES.join(', ')}`);
  }
}

// ── I/O helpers ───────────────────────────────────────────────────────────────

/**
 * Load an index file. Returns an empty index if the file is missing or corrupt.
 */
function loadIndex(type) {
  assertType(type);
  const filepath = INDEX_FILES[type];
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return EMPTY_INDEX(type);
    }
    // Corrupt file — return empty and let the next write repair it
    return EMPTY_INDEX(type);
  }
}

/**
 * Atomically write an index to disk (write to temp, then rename).
 * Prevents partial-write corruption.
 */
function saveIndex(type, data) {
  assertType(type);
  const filepath = INDEX_FILES[type];
  const tmp      = filepath + '.tmp';

  data.updated_at = new Date().toISOString();
  data.count      = data.entries.length;

  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filepath);   // atomic on POSIX
}

// ── Tag extractor ─────────────────────────────────────────────────────────────

// Stop-words to skip when auto-generating tags
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','up','about','into','through','during','is','was','are',
  'were','be','been','being','have','has','had','do','does','did','will',
  'would','could','should','may','might','must','shall','can','need',
  'this','that','these','those','it','its','i','we','you','he','she','they',
  'all','both','each','few','more','most','other','some','such','no','not',
]);

/**
 * Extract relevant tags from topic + summary text.
 * Returns an array of lowercase single-word tags (de-duplicated).
 */
function extractTags(entry) {
  const text = `${entry.topic || ''} ${entry.summary || ''}`;
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s\-_]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  )].slice(0, 30);  // cap at 30 tags
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

/**
 * Append a new entry to the index.
 * Assigns `id`, `indexed_at`, and `tags` automatically.
 * Returns the completed entry object.
 *
 * @param {string} type
 * @param {object} entry  — { date, file, topic, agents_involved, summary, [tags] }
 * @returns {object}
 */
function append(type, entry) {
  const idx = loadIndex(type);

  const full = {
    id:              randomUUID(),
    date:            entry.date            || new Date().toISOString().slice(0, 10),
    file:            entry.file            || '',
    topic:           entry.topic           || '',
    agents_involved: entry.agents_involved || [],
    summary:         entry.summary         || '',
    indexed_at:      new Date().toISOString(),
    tags:            entry.tags            || extractTags(entry),
  };

  // Prevent duplicate file entries — update instead
  const existing = idx.entries.findIndex(e => e.file && e.file === full.file);
  if (existing >= 0) {
    idx.entries[existing] = { ...idx.entries[existing], ...full, id: idx.entries[existing].id };
    saveIndex(type, idx);
    return idx.entries[existing];
  }

  idx.entries.push(full);
  saveIndex(type, idx);
  return full;
}

/**
 * Update specific fields on an existing entry by id.
 * Re-extracts tags if topic or summary changed.
 * Returns the updated entry, or null if not found.
 */
function update(type, id, patch) {
  const idx = loadIndex(type);
  const i   = idx.entries.findIndex(e => e.id === id);
  if (i < 0) return null;

  const merged = { ...idx.entries[i], ...patch, id };
  // Refresh tags if text fields changed
  if (patch.topic !== undefined || patch.summary !== undefined) {
    merged.tags = extractTags(merged);
  }
  idx.entries[i] = merged;
  saveIndex(type, idx);
  return merged;
}

/**
 * Remove an entry by id.
 * Returns true if removed, false if not found.
 */
function remove(type, id) {
  const idx    = loadIndex(type);
  const before = idx.entries.length;
  idx.entries  = idx.entries.filter(e => e.id !== id);
  if (idx.entries.length === before) return false;
  saveIndex(type, idx);
  return true;
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

/**
 * Retrieve a single entry by id.
 */
function getById(type, id) {
  return loadIndex(type).entries.find(e => e.id === id) ?? null;
}

/**
 * Return all entries in the index (optionally sorted).
 * Default sort: newest first (by date, then indexed_at).
 */
function getAll(type, { sortBy = 'date', order = 'desc' } = {}) {
  const idx = loadIndex(type);
  return sortEntries(idx.entries, sortBy, order);
}

// ── Structured query ──────────────────────────────────────────────────────────

/**
 * Filter entries using a structured predicate object.
 *
 * Supported filter fields:
 *   agent        {string}    — entries where agents_involved includes this value (case-insensitive)
 *   agents       {string[]}  — any of these agents (OR logic)
 *   topic        {string}    — substring match on topic (case-insensitive)
 *   tag          {string}    — exact tag match
 *   tags         {string[]}  — any of these tags (OR logic)
 *   dateFrom     {string}    — ISO date, inclusive lower bound on `date`
 *   dateTo       {string}    — ISO date, inclusive upper bound on `date`
 *   file         {string}    — substring match on file path
 *   limit        {number}    — max results to return (default: 50)
 *   offset       {number}    — skip first N results (default: 0)
 *   sortBy       {string}    — 'date' | 'indexed_at' | 'topic'  (default: 'date')
 *   order        {string}    — 'asc' | 'desc'  (default: 'desc')
 *
 * @param {string} type
 * @param {object} filter
 * @returns {object[]}
 */
function query(type, filter = {}) {
  const idx = loadIndex(type);
  let   results = idx.entries;

  // ── Predicates ────────────────────────────────────────────────────────────

  if (filter.agent) {
    const a = filter.agent.toLowerCase();
    results = results.filter(e =>
      e.agents_involved.some(ag => ag.toLowerCase().includes(a))
    );
  }

  if (Array.isArray(filter.agents) && filter.agents.length) {
    const set = filter.agents.map(a => a.toLowerCase());
    results = results.filter(e =>
      e.agents_involved.some(ag => set.some(a => ag.toLowerCase().includes(a)))
    );
  }

  if (filter.topic) {
    const t = filter.topic.toLowerCase();
    results = results.filter(e => e.topic.toLowerCase().includes(t));
  }

  if (filter.tag) {
    const t = filter.tag.toLowerCase();
    results = results.filter(e => e.tags.includes(t));
  }

  if (Array.isArray(filter.tags) && filter.tags.length) {
    const set = new Set(filter.tags.map(t => t.toLowerCase()));
    results = results.filter(e => e.tags.some(t => set.has(t)));
  }

  if (filter.dateFrom) {
    results = results.filter(e => e.date >= filter.dateFrom);
  }

  if (filter.dateTo) {
    results = results.filter(e => e.date <= filter.dateTo);
  }

  if (filter.file) {
    const f = filter.file.toLowerCase();
    results = results.filter(e => e.file.toLowerCase().includes(f));
  }

  // ── Sort + paginate ───────────────────────────────────────────────────────

  results = sortEntries(results, filter.sortBy || 'date', filter.order || 'desc');

  const offset = filter.offset || 0;
  const limit  = filter.limit  || 50;
  return results.slice(offset, offset + limit);
}

// ── Full-text search ──────────────────────────────────────────────────────────

/**
 * Full-text keyword search across topic, summary, and tags.
 * Returns results sorted by relevance score (descending).
 *
 * Scoring:
 *   +3 per keyword match in topic
 *   +2 per keyword match in summary
 *   +1 per keyword match in tags
 *   +1 per keyword match in file path
 *
 * @param {string} type
 * @param {string} text        — free-form search string
 * @param {object} [opts]
 * @param {number} [opts.limit]        — max results (default: 20)
 * @param {number} [opts.minScore]     — minimum score threshold (default: 1)
 * @param {string} [opts.dateFrom]     — optional date bound
 * @param {string} [opts.dateTo]       — optional date bound
 * @returns {{ entry: object, score: number, matched_keywords: string[] }[]}
 */
function search(type, text, opts = {}) {
  if (!text || !text.trim()) return [];

  const keywords = text
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));

  if (keywords.length === 0) return [];

  let entries = loadIndex(type).entries;

  // Optional date bounds before scoring (reduces work)
  if (opts.dateFrom) entries = entries.filter(e => e.date >= opts.dateFrom);
  if (opts.dateTo)   entries = entries.filter(e => e.date <= opts.dateTo);

  const scored = entries.map(entry => {
    let score = 0;
    const matched = new Set();

    const topicLower   = entry.topic.toLowerCase();
    const summaryLower = entry.summary.toLowerCase();
    const fileLower    = entry.file.toLowerCase();
    const tagsJoined   = entry.tags.join(' ');

    for (const kw of keywords) {
      // Count occurrences for extra weight on repeated matches
      const topicHits   = countOccurrences(topicLower,   kw);
      const summaryHits = countOccurrences(summaryLower, kw);
      const tagHit      = tagsJoined.includes(kw) ? 1 : 0;
      const fileHit     = fileLower.includes(kw)  ? 1 : 0;

      if (topicHits + summaryHits + tagHit + fileHit > 0) {
        matched.add(kw);
      }

      score += topicHits   * 3;
      score += summaryHits * 2;
      score += tagHit      * 1;
      score += fileHit     * 1;
    }

    return { entry, score, matched_keywords: [...matched] };
  });

  const minScore = opts.minScore ?? 1;
  const limit    = opts.limit    ?? 20;

  return scored
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date))
    .slice(0, limit);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Return aggregate statistics for an index.
 */
function stats(type) {
  const idx = loadIndex(type);
  if (idx.entries.length === 0) {
    return { count: 0, oldest: null, newest: null, agents: [], tags: [] };
  }

  const sorted  = [...idx.entries].sort((a, b) => a.date.localeCompare(b.date));
  const agents  = [...new Set(idx.entries.flatMap(e => e.agents_involved))].sort();
  const allTags = idx.entries.flatMap(e => e.tags);
  // Top 10 most frequent tags
  const tagFreq = {};
  for (const t of allTags) tagFreq[t] = (tagFreq[t] || 0) + 1;
  const topTags = Object.entries(tagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, freq]) => ({ tag, freq }));

  return {
    count:      idx.entries.length,
    oldest:     sorted[0].date,
    newest:     sorted[sorted.length - 1].date,
    updated_at: idx.updated_at,
    agents,
    top_tags:   topTags,
  };
}

// ── Upsert by file path ───────────────────────────────────────────────────────

/**
 * Insert or update an index entry keyed by file path.
 * Used by the document_indexer when it detects a new/modified document.
 * Equivalent to append() but always updates if the file is already indexed.
 */
function upsertByFile(type, entry) {
  const idx     = loadIndex(type);
  const existing = idx.entries.findIndex(e => e.file && e.file === entry.file);

  const full = {
    id:              existing >= 0 ? idx.entries[existing].id : randomUUID(),
    date:            entry.date            || new Date().toISOString().slice(0, 10),
    file:            entry.file            || '',
    topic:           entry.topic           || '',
    agents_involved: entry.agents_involved || [],
    summary:         entry.summary         || '',
    indexed_at:      new Date().toISOString(),
    tags:            entry.tags            || extractTags(entry),
  };

  if (existing >= 0) {
    idx.entries[existing] = full;
  } else {
    idx.entries.push(full);
  }

  saveIndex(type, idx);
  return full;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let pos   = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

function sortEntries(entries, sortBy, order) {
  const dir = order === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    const va = a[sortBy] || '';
    const vb = b[sortBy] || '';
    return va < vb ? -dir : va > vb ? dir : 0;
  });
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  append,
  update,
  remove,
  getById,
  getAll,
  query,
  search,
  stats,
  upsertByFile,
  extractTags,
  loadIndex,       // exposed for diagnostics
  INDEX_FILES,
  VALID_TYPES,
};
