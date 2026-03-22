'use strict';
/**
 * classifier.js
 * Classifies an incoming task into one of five canonical task classes.
 *
 * Resolution order:
 *   1. Exact type → class lookup (TYPE_MAP)
 *   2. Keyword scan on payload text (KEYWORD_RULES)
 *   3. Default: 'orchestration'
 *
 * Task classes:
 *   orchestration  — planning, coordination, delegation across agents
 *   reasoning      — analysis, problem-solving, deep thinking
 *   monitoring     — health checks, status queries, alerts
 *   documentation  — writing, recording, summarising, archiving
 *   system_event   — config changes, internal broadcasts, watcher events
 */

// ── Direct type → class mapping ───────────────────────────────────────────────

const TYPE_MAP = {
  // Pass-through for already-classified tasks
  orchestration: 'orchestration',
  reasoning:     'reasoning',
  monitoring:    'monitoring',
  documentation: 'documentation',
  system_event:  'system_event',

  // Orchestration aliases
  plan:          'orchestration',
  coordinate:    'orchestration',
  delegate:      'orchestration',
  assign:        'orchestration',
  dispatch:      'orchestration',
  route:         'orchestration',

  // Reasoning aliases
  analyze:       'reasoning',
  analyse:       'reasoning',
  think:         'reasoning',
  solve:         'reasoning',
  research:      'reasoning',
  evaluate:      'reasoning',
  evaluate:      'reasoning',
  debug:         'reasoning',
  review:        'reasoning',

  // Monitoring aliases
  watch:         'monitoring',
  check:         'monitoring',
  status:        'monitoring',
  alert:         'monitoring',
  probe:         'monitoring',
  health:        'monitoring',
  audit:         'monitoring',

  // Documentation aliases
  document:      'documentation',
  doc:           'documentation',
  record:        'documentation',
  summarize:     'documentation',
  summarise:     'documentation',
  archive:       'documentation',
  note:          'documentation',
  write:         'documentation',

  // System event aliases
  event:         'system_event',
  notify:        'system_event',
  broadcast:     'system_event',
  config_change: 'system_event',
  arch_change:   'system_event',
};

// ── Keyword scan rules (ordered: first match wins) ────────────────────────────
//
// Ordering rationale:
//   1. system_event  — very specific terms; checked first to catch arch/config events
//   2. monitoring    — operational terms (health, check, status) must beat reasoning
//   3. orchestration — coordination/planning words
//   4. reasoning     — analysis/debug words (broad; last before documentation)
//   5. documentation — writing/archiving words

const KEYWORD_RULES = [
  {
    // Specific system/config event terms — NOT generic component names like "gateway"
    class:   'system_event',
    pattern: /\b(system\.architecture|config\.changed|system\.decision|architecture\.changed|config_change|openclaw\.json|system_event)\b/i,
  },
  {
    class:   'monitoring',
    pattern: /\b(monitor|watch|health|status|alert|heartbeat|probe|audit|connectivity|uptime|ping)\b/i,
  },
  {
    // "check" is common in monitoring but also debugging; treat as monitoring when standalone
    class:   'monitoring',
    pattern: /\bcheck\b/i,
  },
  {
    class:   'orchestration',
    pattern: /\b(coordinat|orchestrat|delegat|assign task|plan|dispatch|route task)\b/i,
  },
  {
    class:   'reasoning',
    pattern: /\b(analyz|analys|reason|think|solv|research|evaluat|debug|diagnos|review)\b/i,
  },
  {
    // Prefix patterns — no trailing \b so "summarize", "archiving" etc. all match
    class:   'documentation',
    pattern: /\b(?:document|record|summari[sz]|archiv|write[ -]?up|knowledge base|log entry|arch note)/i,
  },
];

// ── Classifier entry point ────────────────────────────────────────────────────

/**
 * Classify a task object.
 * @param {object} task  — task JSON (must have at minimum a `type` field)
 * @returns {string}     — one of the five task class names
 */
function classify(task) {
  // 1. Exact type match
  const typeLower = (task.type || '').toLowerCase().replace(/[-\s]/g, '_');
  const mapped = TYPE_MAP[typeLower];
  if (mapped) return mapped;

  // 2. Keyword scan (check type string first, then payload)
  const searchText = [
    task.type  || '',
    typeof task.payload === 'string' ? task.payload : JSON.stringify(task.payload || ''),
  ].join(' ');

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(searchText)) return rule.class;
  }

  // 3. Default
  return 'orchestration';
}

/**
 * Return all possible task classes (useful for validation / UI).
 */
const ALL_CLASSES = [
  'orchestration',
  'reasoning',
  'monitoring',
  'documentation',
  'system_event',
];

module.exports = { classify, ALL_CLASSES, TYPE_MAP };
