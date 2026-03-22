'use strict';
/**
 * bench_runner.js
 * Provider benchmark execution engine.
 *
 * Called by the dispatcher when a task carries a `test_lane` field.
 * Bypasses normal agent routing entirely — calls the provider's API directly,
 * measures latency and token usage, and writes a structured benchmark record
 * to provider_lab/benchmarks/.
 *
 * Benchmark record schema:
 * {
 *   bench_id:       "<uuid>",
 *   task_id:        "<original task_id>",
 *   test_lane:      "kimi" | "nemotron",
 *   provider:       "<provider_id>",
 *   model:          "<model string>",
 *   timestamp:      "<ISO>",
 *   latency_ms:     <number>,
 *   token_count:    { prompt, completion, total },
 *   finish_reason:  "<string>",
 *   result:         "<response text>",
 *   error:          null | "<error message>",
 *   task_meta: {
 *     type, priority, source, requested_by, payload_length
 *   }
 * }
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { randomUUID } = require('crypto');

// ── Provider registry ─────────────────────────────────────────────────────────

const PROVIDERS = {
  kimi:     require('./providers/kimi'),
  nemotron: require('./providers/nemotron'),
};

// ── Paths ─────────────────────────────────────────────────────────────────────

const HOME       = os.homedir();
const BASE       = path.join(HOME, '.openclaw-odin', 'task_bus');
const BENCH_DIR  = path.join(BASE, 'provider_lab', 'benchmarks');
const LOG_FILE   = path.join(BASE, 'logs', 'task_bus.log');

// ── Logging (mirrors dispatcher format) ──────────────────────────────────────

const IS_TTY = process.stdout.isTTY;

function log(level, msg) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] [${level}] [bench] ${msg}\n`;
  process.stdout.write(line);
  if (IS_TTY) {
    try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
  }
}

// ── Benchmark record writer ───────────────────────────────────────────────────

/**
 * Write a benchmark result to provider_lab/benchmarks/.
 * Filename: <timestamp>_<test_lane>_<bench_id>.json
 * Returns the path of the written file.
 */
function writeBenchmark(record) {
  fs.mkdirSync(BENCH_DIR, { recursive: true });

  const dateSlug = record.timestamp.slice(0, 10);
  const filename = `${dateSlug}_${record.test_lane}_${record.bench_id}.json`;
  const filepath = path.join(BENCH_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(record, null, 2));
  return filepath;
}

// ── Payload extraction ────────────────────────────────────────────────────────

/**
 * Get a plain-text prompt from a task's payload field.
 * Handles both string payloads and structured objects.
 */
function extractPrompt(task) {
  if (typeof task.payload === 'string') return task.payload;
  if (typeof task.payload === 'object' && task.payload !== null) {
    return task.payload.prompt
        || task.payload.message
        || task.payload.content
        || JSON.stringify(task.payload);
  }
  return String(task.payload ?? '');
}

// ── Core benchmark runner ─────────────────────────────────────────────────────

/**
 * Run a benchmark task against the specified provider lane.
 * Bypasses all normal agent routing.
 *
 * @param {object} task  — full task object from the queue (must have test_lane)
 * @returns {Promise<{ benchFile, record, success }>}
 */
async function runBenchmark(task) {
  const lane     = (task.test_lane || '').toLowerCase().trim();
  const benchId  = randomUUID();
  const ts       = new Date().toISOString();

  log('INFO', `Starting benchmark — lane=${lane} task_id=${task.task_id} bench_id=${benchId}`);

  // ── Resolve provider ───────────────────────────────────────────────────────

  const provider = PROVIDERS[lane];
  if (!provider) {
    const err = `Unknown test_lane "${lane}". Available: ${Object.keys(PROVIDERS).join(', ')}`;
    log('ERROR', err);

    const record = buildRecord({ task, benchId, ts, lane, error: err });
    const benchFile = writeBenchmark(record);
    log('WARN', `Benchmark record written (error): ${benchFile}`);
    return { benchFile, record, success: false };
  }

  // ── Check availability ─────────────────────────────────────────────────────

  const providerInfo = provider.info();
  if (!providerInfo.available) {
    const err =
      `Provider "${lane}" has no API key configured. ` +
      `Set one of: ${providerInfo.api_key_env.join(', ')}`;
    log('WARN', err);

    const record = buildRecord({ task, benchId, ts, lane, error: err, providerInfo });
    const benchFile = writeBenchmark(record);
    log('WARN', `Benchmark record written (unconfigured): ${benchFile}`);
    return { benchFile, record, success: false };
  }

  // ── Extract options from task ──────────────────────────────────────────────

  const callOpts = {
    model:       task.bench_model    || undefined,
    max_tokens:  task.bench_max_tokens  || undefined,
    temperature: task.bench_temperature || undefined,
    timeout_ms:  task.bench_timeout_ms  || undefined,
  };
  // Strip undefined keys so provider defaults apply cleanly
  Object.keys(callOpts).forEach(k => callOpts[k] === undefined && delete callOpts[k]);

  const prompt = extractPrompt(task);
  if (!prompt) {
    const err = 'Empty prompt — task payload is blank';
    log('ERROR', err);
    const record = buildRecord({ task, benchId, ts, lane, error: err, providerInfo });
    const benchFile = writeBenchmark(record);
    return { benchFile, record, success: false };
  }

  log('INFO',
    `Calling ${providerInfo.name} | model=${callOpts.model || providerInfo.default_model} | ` +
    `prompt_len=${prompt.length}ch`
  );

  // ── Execute ────────────────────────────────────────────────────────────────

  let callResult;
  try {
    callResult = await provider.call(prompt, callOpts);
  } catch (err) {
    log('WARN', `Provider call failed (${lane}): ${err.message}`);

    const record = buildRecord({
      task, benchId, ts, lane,
      error: err.message,
      providerInfo,
    });
    const benchFile = writeBenchmark(record);
    log('WARN', `Benchmark record written (failed): ${benchFile}`);
    return { benchFile, record, success: false };
  }

  // ── Write success record ───────────────────────────────────────────────────

  const record = buildRecord({
    task, benchId, ts, lane,
    callResult, providerInfo,
  });

  const benchFile = writeBenchmark(record);

  log('INFO',
    `✓ Benchmark complete | lane=${lane} model=${callResult.model} ` +
    `latency=${callResult.latency_ms}ms tokens=${callResult.token_count.total} | ${benchFile}`
  );

  return { benchFile, record, success: true };
}

// ── Record builder ────────────────────────────────────────────────────────────

function buildRecord({ task, benchId, ts, lane, callResult, providerInfo, error }) {
  return {
    bench_id:     benchId,
    task_id:      task.task_id,
    test_lane:    lane,

    // Provider / model
    provider:     callResult?.provider     || lane,
    model:        callResult?.model        || providerInfo?.default_model || null,

    // Timing
    timestamp:    ts,
    latency_ms:   callResult?.latency_ms   ?? null,

    // Token usage
    token_count:  callResult?.token_count  ?? { prompt: null, completion: null, total: null },

    // Response
    finish_reason: callResult?.finish_reason ?? null,
    result:        callResult?.result        ?? null,

    // Error (null on success)
    error:         error ?? null,

    // Task provenance (without the full payload to keep records compact)
    task_meta: {
      type:           task.type,
      priority:       task.priority       || 'normal',
      source:         task.source         || 'unknown',
      requested_by:   task.requested_by   || 'unknown',
      payload_length: String(task.payload ?? '').length,
    },
  };
}

// ── Provider info / listing ───────────────────────────────────────────────────

/**
 * Return info for all registered providers.
 * @returns {object[]}
 */
function listProviders() {
  return Object.values(PROVIDERS).map(p => p.info());
}

/**
 * Return true if lane is a recognised test_lane value.
 * @param {string} lane
 * @returns {boolean}
 */
function isTestLane(lane) {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, (lane || '').toLowerCase().trim());
}

module.exports = { runBenchmark, listProviders, isTestLane, BENCH_DIR };
