'use strict';
/**
 * preprocessor.js
 * Payload compression layer for the Task Bus.
 * System display name is configurable — see config/system.json.
 * Agent display names are configurable — see config/agents.json.
 *
 * Reduces expensive Anthropic token usage by normalising and compressing
 * task payloads before final agent execution.
 *
 * Model chain (never uses Anthropic):
 *   primary:  groq/llama-3.1-8b-instant   fast, ~500ms, free tier
 *   fallback: ollama/llama3.2:3b           local, ~5s, always available
 *
 * Eligibility rules:
 *   ✓ documentation   — always compress
 *   ✓ system_event    — always compress
 *   ✓ orchestration   — only when payload >= ORCHESTRATION_MIN_LENGTH chars
 *   ✓ reasoning       — only when task.force_preprocess === true
 *   ✗ monitoring      — never (time-sensitive, must stay verbatim)
 *   ✗ test_lane       — never (benchmark tasks bypass all agent routing)
 *   ✗ skip_preprocess — task-level opt-out flag
 *   ✗ short payloads  — below MIN_PAYLOAD_LENGTH chars
 *
 * Fields attached to every preprocessed task:
 *   preprocessed              boolean
 *   original_payload_length   number (chars)
 *   preprocessed_payload_length number (chars, only when preprocessed=true)
 *   preprocessor_model        string (only when preprocessed=true)
 *   preprocess_skipped_reason string (only when preprocessed=false)
 *   preprocess_savings_pct    number (only when preprocessed=true)
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const https = require('https');
const http  = require('http');

const { getAgentName, getSystemName, getAgentNameList } = require('../../config/names');
const { LIVE_AGENT_IDS } = require('../../config/agent_ids');

// CORE_AGENT_IDS drives the compression preservation rule that tells the
// compressor model which agent names must never be altered in payloads.
// It is derived from LIVE_AGENT_IDS so new live agents are automatically
// included without touching this file.
//
// NOTE: SYSTEM_PROMPTS are string constants computed at module-load time.
// If agents.json display names change at runtime, the prompts pick up the
// new names only after the dispatcher process is restarted.
const CORE_AGENT_IDS = LIVE_AGENT_IDS;

// ── Constants ─────────────────────────────────────────────────────────────────

const HOME = os.homedir();

// Minimum payload length (chars) before we attempt preprocessing at all
const MIN_PAYLOAD_LENGTH = 500;

// Orchestration tasks only get preprocessed above this threshold
const ORCHESTRATION_MIN_LENGTH = 2_000;

// If compression saves less than this fraction, don't swap the payload
// (not worth the latency for marginal savings)
const MIN_SAVINGS_FRACTION = 0.15;

// Model identifiers for direct API calls (no provider prefix)
const GROQ_MODEL   = 'llama-3.1-8b-instant';
const OLLAMA_MODEL = 'llama3.2:3b';

// Groq endpoint
const GROQ_HOSTNAME = 'api.groq.com';
const GROQ_PATH     = '/openai/v1/chat/completions';
const GROQ_TIMEOUT  = 30_000;

// Ollama endpoint (local)
const OLLAMA_HOST    = '127.0.0.1';
const OLLAMA_PORT    = 11434;
const OLLAMA_PATH    = '/api/chat';
const OLLAMA_TIMEOUT = 60_000;

// Max tokens the compressor model is asked to produce
const MAX_OUTPUT_TOKENS = 1_024;

// ── Auth-profile key loader ───────────────────────────────────────────────────

let _groqKeyCache = null;

/**
 * Resolve Groq API key.
 * Priority:
 *   1. GROQ_API_KEY environment variable
 *   2. openclaw auth-profiles.json → profiles['groq:default'].key
 */
function getGroqApiKey() {
  if (_groqKeyCache) return _groqKeyCache;

  if (process.env.GROQ_API_KEY) {
    _groqKeyCache = process.env.GROQ_API_KEY;
    return _groqKeyCache;
  }

  try {
    const profilesPath = path.join(
      HOME, '.openclaw-odin', 'agents', 'main', 'agent', 'auth-profiles.json'
    );
    const data     = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
    const groqKey  = data?.profiles?.['groq:default']?.key;
    if (groqKey && groqKey !== 'ollama-local') {
      _groqKeyCache = groqKey;
      return _groqKeyCache;
    }
  } catch (_) { /* profiles file missing or malformed */ }

  return null;
}

// ── Compression system prompts ────────────────────────────────────────────────

const SHARED_PRESERVATION_RULES = `\
ALWAYS preserve exactly (never alter, truncate, or paraphrase):
• Agent names: ${getAgentNameList(CORE_AGENT_IDS)}
• Model identifiers (e.g. anthropic/claude-haiku-4-5-20251001, groq/llama-3.1-8b-instant)
• File paths and directory names
• Channel IDs, task IDs, UUIDs, bench IDs
• ISO timestamps
• Port numbers, version strings, numeric config values
• Error messages and their codes
• All "previous → current" state pairs
• Decision text and its direct rationale (condense prose, keep meaning 100%)
• Action items and their assigned targets`;

const SHARED_REMOVAL_RULES = `\
SAFE to remove:
• Preamble phrases: "I will now…", "As requested…", "Please note that…"
• Repetitive examples illustrating the same concept twice
• Hedging language: "approximately", "it seems", "potentially", "it should be noted"
• Restatement of field labels in prose ("the model field contains…")
• Verbose transition sentences that add no information
• Duplicate sentences that say the same thing in different words`;

const SYSTEM_PROMPTS = {

  documentation: `\
You are a payload compressor for the ${getAgentName('adam')} documentation agent (${getSystemName()} AI system).
Compress the following documentation task payload. The output will be sent to a documentation agent that writes structured text files.

${SHARED_PRESERVATION_RULES}

${SHARED_REMOVAL_RULES}

OUTPUT: Return ONLY the compressed payload. No meta-commentary, no "Here is the compressed version:", no markdown code fences. Preserve line structure for structured data.`,

  system_event: `\
You are a payload compressor for the ${getSystemName()} AI system architecture event pipeline.
Compress the following system event payload. The output describes configuration or architecture changes and will be sent to the ${getAgentName('adam')} agent for documentation.

${SHARED_PRESERVATION_RULES}
• component names, event types, and source labels
• Every change entry: component, agent, previous value, current value

${SHARED_REMOVAL_RULES}

OUTPUT: Return ONLY the compressed payload. No meta-commentary. Preserve the change list structure — one line per change is ideal.`,

  orchestration: `\
You are a payload compressor for the ${getAgentName('main')} orchestration agent (${getSystemName()} AI system).
Compress the following orchestration task payload. The output will be sent to ${getAgentName('main')} for coordination and delegation.

${SHARED_PRESERVATION_RULES}
• Agent assignments and task sequences
• Dependencies between steps
• Constraints and ordering requirements

${SHARED_REMOVAL_RULES}

OUTPUT: Return ONLY the compressed payload. No meta-commentary. Preserve numbered or bulleted lists if present.`,

  reasoning: `\
You are a payload compressor for the ${getAgentName('thor')} reasoning agent (${getSystemName()} AI system).
Compress the following reasoning task payload. ${getAgentName('thor')} performs deep analysis — preserve all analytical context.

${SHARED_PRESERVATION_RULES}
• All hypotheses, constraints, and evaluation criteria
• Data points and measurements
• Comparative values and ratios

${SHARED_REMOVAL_RULES}

OUTPUT: Return ONLY the compressed payload. No meta-commentary.`,
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────

/**
 * HTTPS POST to Groq (OpenAI-compatible chat completions).
 */
function groqPost(apiKey, messages) {
  const body = JSON.stringify({
    model:       GROQ_MODEL,
    messages,
    max_tokens:  MAX_OUTPUT_TOKENS,
    temperature: 0.1,   // low temperature for deterministic, faithful compression
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: GROQ_HOSTNAME,
        path:     GROQ_PATH,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Authorization':  `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body),
          'User-Agent':     'openclaw-task-bus-preprocessor/1.0',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); }
          catch (_) {
            return reject(new Error(`Groq non-JSON response (${res.statusCode}): ${raw.slice(0, 200)}`));
          }
          if (res.statusCode >= 400) {
            const msg = parsed?.error?.message || JSON.stringify(parsed).slice(0, 200);
            return reject(new Error(`Groq HTTP ${res.statusCode}: ${msg}`));
          }
          const content = parsed?.choices?.[0]?.message?.content ?? '';
          resolve({ content, model: parsed?.model || GROQ_MODEL });
        });
      }
    );
    req.setTimeout(GROQ_TIMEOUT, () => req.destroy(new Error('Groq request timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * HTTP POST to Ollama (local, no auth).
 */
function ollamaPost(messages) {
  const body = JSON.stringify({
    model:    OLLAMA_MODEL,
    messages,
    stream:   false,
    options:  { temperature: 0.1 },
  });

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: OLLAMA_HOST,
        port:     OLLAMA_PORT,
        path:     OLLAMA_PATH,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); }
          catch (_) {
            return reject(new Error(`Ollama non-JSON response: ${raw.slice(0, 200)}`));
          }
          if (parsed.error) return reject(new Error(`Ollama error: ${parsed.error}`));
          const content = parsed?.message?.content ?? '';
          resolve({ content, model: `ollama/${parsed?.model || OLLAMA_MODEL}` });
        });
      }
    );
    req.setTimeout(OLLAMA_TIMEOUT, () => req.destroy(new Error('Ollama request timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Eligibility ───────────────────────────────────────────────────────────────

/**
 * Determine whether a task should be preprocessed.
 *
 * @param {object} task
 * @param {string} taskClass  — output of classifier.classify()
 * @returns {{ eligible: boolean, reason: string }}
 */
function isEligible(task, taskClass) {
  // Benchmark tasks never get preprocessed — they bypass agent routing entirely
  if (task.test_lane) {
    return { eligible: false, reason: 'benchmark_lane' };
  }

  // Explicit opt-out flag
  if (task.skip_preprocess) {
    return { eligible: false, reason: 'skip_preprocess_flag' };
  }

  // Monitoring tasks must stay verbatim (time-sensitive status checks)
  if (taskClass === 'monitoring') {
    return { eligible: false, reason: 'monitoring_excluded' };
  }

  // Reasoning (reasoning_engine — deep analysis) only when explicitly requested
  if (taskClass === 'reasoning' && !task.force_preprocess) {
    return { eligible: false, reason: 'reasoning_not_forced' };
  }

  // Payload length guard — not worth calling a model for short content
  const payloadLen = getPayloadLength(task);
  if (payloadLen < MIN_PAYLOAD_LENGTH) {
    return { eligible: false, reason: `payload_too_short (${payloadLen} < ${MIN_PAYLOAD_LENGTH})` };
  }

  // Orchestration: only above the higher threshold
  if (taskClass === 'orchestration' && payloadLen < ORCHESTRATION_MIN_LENGTH) {
    return {
      eligible: false,
      reason:   `orchestration_below_threshold (${payloadLen} < ${ORCHESTRATION_MIN_LENGTH})`,
    };
  }

  // Compressible classes
  if (['documentation', 'system_event', 'orchestration', 'reasoning'].includes(taskClass)) {
    return { eligible: true, reason: taskClass };
  }

  return { eligible: false, reason: `class_not_compressible (${taskClass})` };
}

// ── Payload utilities ─────────────────────────────────────────────────────────

function getPayloadLength(task) {
  if (!task.payload) return 0;
  if (typeof task.payload === 'string') return task.payload.length;
  return JSON.stringify(task.payload).length;
}

function getPayloadText(task) {
  if (!task.payload) return '';
  if (typeof task.payload === 'string') return task.payload;
  return JSON.stringify(task.payload, null, 2);
}

// ── Core compressor ───────────────────────────────────────────────────────────

/**
 * Call the compressor model with the appropriate system prompt.
 * Tries Groq first, falls back to Ollama.
 *
 * @param {string} payloadText
 * @param {string} taskClass
 * @returns {Promise<{ compressed: string, model: string, attempted: string[] }>}
 */
async function callCompressor(payloadText, taskClass) {
  const systemPrompt = SYSTEM_PROMPTS[taskClass] || SYSTEM_PROMPTS.orchestration;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: payloadText  },
  ];

  const attempted = [];

  // ── Try Groq ────────────────────────────────────────────────────────────────
  const groqKey = getGroqApiKey();
  if (groqKey) {
    attempted.push(`groq/${GROQ_MODEL}`);
    try {
      const { content, model } = await groqPost(groqKey, messages);
      return { compressed: content.trim(), model: `groq/${model}`, attempted };
    } catch (err) {
      // Fall through to Ollama
      const hint = err.message.includes('429') ? ' (rate-limited)' : '';
      attempted.push(`groq_failed${hint}: ${err.message.slice(0, 80)}`);
    }
  } else {
    attempted.push('groq_skipped (no key)');
  }

  // ── Try Ollama ──────────────────────────────────────────────────────────────
  attempted.push(`ollama/${OLLAMA_MODEL}`);
  try {
    const { content, model } = await ollamaPost(messages);
    return { compressed: content.trim(), model, attempted };
  } catch (err) {
    attempted.push(`ollama_failed: ${err.message.slice(0, 80)}`);
    throw new Error(
      `Both compressor models failed. Attempts: ${attempted.join(' → ')}`
    );
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Preprocess a task object.
 *
 * Always attaches `preprocessed`, `original_payload_length`, and
 * `preprocess_skipped_reason` (when skipped) to the returned task.
 *
 * When preprocessing fires:
 *   - task.payload is replaced with the compressed version
 *   - task.preprocessed = true
 *   - task.preprocessed_payload_length is set
 *   - task.preprocessor_model is set
 *   - task.preprocess_savings_pct is set
 *
 * Never throws — if compression fails the original task is returned unchanged
 * with preprocessed=false.
 *
 * @param {object} task       — raw task object
 * @param {string} taskClass  — result of classify(task)
 * @param {Function} logFn    — optional logging function (level, msg) => void
 * @returns {Promise<object>} — (possibly modified) task
 */
async function preprocess(task, taskClass, logFn = null) {
  const log = logFn || (() => {});

  const originalText   = getPayloadText(task);
  const originalLength = originalText.length;

  // Stamp original length regardless of whether we preprocess
  task = { ...task, original_payload_length: originalLength };

  // ── Eligibility check ────────────────────────────────────────────────────────
  const { eligible, reason } = isEligible(task, taskClass);

  if (!eligible) {
    log('DEBUG', `Preprocess skipped [${task.task_id}]: ${reason}`);
    return {
      ...task,
      preprocessed:              false,
      preprocess_skipped_reason: reason,
    };
  }

  // ── Compression ──────────────────────────────────────────────────────────────
  log('INFO', `Preprocessing [${task.task_id}] class=${taskClass} payload=${originalLength}ch`);

  let compressed, model, attempted;
  try {
    ({ compressed, model, attempted } = await callCompressor(originalText, taskClass));
  } catch (err) {
    log('WARN', `Preprocessing failed [${task.task_id}]: ${err.message.slice(0, 120)}`);
    return {
      ...task,
      preprocessed:              false,
      preprocess_skipped_reason: `compression_error: ${err.message.slice(0, 80)}`,
    };
  }

  const compressedLength = compressed.length;
  const savingsPct = Math.round((1 - compressedLength / originalLength) * 100);

  // ── Sanity checks ─────────────────────────────────────────────────────────────

  // Reject if the compressor returned an empty string
  if (!compressed) {
    log('WARN', `Preprocessing aborted [${task.task_id}]: compressor returned empty string`);
    return {
      ...task,
      preprocessed:              false,
      preprocess_skipped_reason: 'compression_returned_empty',
    };
  }

  // Reject if the compressor made the payload LONGER (can happen with small payloads
  // or when the model adds preamble despite instructions)
  if (compressedLength >= originalLength) {
    log('INFO',
      `Preprocessing skipped [${task.task_id}]: no savings ` +
      `(${originalLength} → ${compressedLength} chars via ${model})`
    );
    return {
      ...task,
      preprocessed:              false,
      preprocess_skipped_reason: `no_savings (${originalLength}→${compressedLength})`,
    };
  }

  // Reject if savings are below the minimum threshold (not worth the latency)
  if (savingsPct < Math.round(MIN_SAVINGS_FRACTION * 100)) {
    log('INFO',
      `Preprocessing skipped [${task.task_id}]: marginal savings ` +
      `(${savingsPct}% < ${Math.round(MIN_SAVINGS_FRACTION * 100)}% threshold via ${model})`
    );
    return {
      ...task,
      preprocessed:              false,
      preprocess_skipped_reason: `marginal_savings_${savingsPct}pct`,
    };
  }

  // ── Commit compression ───────────────────────────────────────────────────────
  log('INFO',
    `✓ Preprocessed [${task.task_id}] ${originalLength}→${compressedLength}ch ` +
    `(−${savingsPct}%) via ${model}`
  );

  return {
    ...task,
    payload:                     compressed,
    preprocessed:                true,
    original_payload_length:     originalLength,
    preprocessed_payload_length: compressedLength,
    preprocessor_model:          model,
    preprocess_savings_pct:      savingsPct,
    _original_payload:           originalText,   // preserved for audit; not sent to agent
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  preprocess,
  isEligible,
  getPayloadLength,
  getPayloadText,
  getGroqApiKey,
  // Constants exposed for tests / introspection
  MIN_PAYLOAD_LENGTH,
  ORCHESTRATION_MIN_LENGTH,
  MIN_SAVINGS_FRACTION,
  GROQ_MODEL,
  OLLAMA_MODEL,
};
