#!/usr/bin/env node
'use strict';

require('dotenv').config({
  // Portable path — resolves to <repo_root>/.env regardless of machine or username.
  // __dirname === task_bus/workers/, so ../../ reaches the openclaw-odin root.
  path: require('path').resolve(__dirname, '../../.env'),
});


/**
 * dispatcher.js
 * Task Bus dispatcher — polls queue/, classifies, routes, and executes tasks.
 *
 * Lifecycle per task:
 *   queue/ → (atomic rename) → processing/ → agent invocation
 *     → success: processing/ → completed/
 *     → failure: processing/ → failed/
 *
 * Concurrency: max MAX_CONCURRENT tasks in flight simultaneously.
 * Priority order: high > normal > low, then by task timestamp (FIFO).
 * On SIGTERM/SIGINT: drains active tasks (max 30s) before exiting.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFile }   = require('child_process');
const { randomUUID } = require('crypto');

const { classify }                      = require('../router/classifier');
const { route, routeWithFallbacks }     = require('../router/router');
const { annotateTask, describeRouting } = require('../router/model_router');
const { runBenchmark, isTestLane }      = require('../provider_lab/bench_runner');
const { preprocess }                    = require('../router/preprocessor');
const { sendReply, formatMessage }      = require('../discord_bridge/send_reply');
const { getAgentName }                  = require('../../config/names');
const { AGENT_IDS }                     = require('../../config/agent_ids');
const { getAgentWorkspacePath }         = require('../../config/paths');

// ── Constants ─────────────────────────────────────────────────────────────────

const HOME       = os.homedir();
const BASE       = path.join(HOME, '.openclaw-odin', 'task_bus');
const QUEUE      = path.join(BASE, 'queue');
const PROCESSING = path.join(BASE, 'processing');
const COMPLETED  = path.join(BASE, 'completed');
const FAILED     = path.join(BASE, 'failed');
const LOG_FILE   = path.join(BASE, 'logs', 'task_bus.log');
// Portable binary resolution: honour OPENCLAW_BIN env override, then fall back
// to bare 'openclaw' and let PATH resolve it. Avoids machine-specific Homebrew path.
const OPENCLAW   = process.env.OPENCLAW_BIN || 'openclaw';

const MAX_CONCURRENT   = 5;
const POLL_INTERVAL_MS = 1_000;    // how often to check queue
const AGENT_TIMEOUT_MS = 120_000;  // max time for one agent invocation (2 min)
const DRAIN_TIMEOUT_MS = 30_000;   // max drain time on shutdown
const HEARTBEAT_MS     = 30 * 60 * 1000;  // stats log interval

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

// ── State ─────────────────────────────────────────────────────────────────────

let active       = 0;        // currently in-flight tasks
let shuttingDown = false;
let pollTimer    = null;

const stats = {
  dispatched: 0,
  completed:  0,
  failed:     0,
  startedAt:  new Date().toISOString(),
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

// ── Setup ─────────────────────────────────────────────────────────────────────

function ensureDirs() {
  for (const d of [QUEUE, PROCESSING, COMPLETED, FAILED, path.dirname(LOG_FILE)]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

// ── Queue management ──────────────────────────────────────────────────────────

/**
 * Read queue directory, returning filenames sorted by:
 *   1. Priority (high first)
 *   2. Task timestamp (oldest first, FIFO within same priority)
 */
function readQueue() {
  try {
    const files = fs.readdirSync(QUEUE).filter(f => f.endsWith('.json'));
    if (files.length === 0) return [];

    return files
      .map(f => {
        const fp = path.join(QUEUE, f);
        let priority  = 1;   // normal default
        let timestamp = 0;
        try {
          const task = JSON.parse(fs.readFileSync(fp, 'utf8'));
          priority  = PRIORITY_ORDER[task.priority] ?? 1;
          timestamp = new Date(task.timestamp || 0).getTime();
        } catch (_) { /* unreadable — still include, will fail at processTask */ }
        return { file: f, priority, timestamp };
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.timestamp - b.timestamp;
      })
      .map(e => e.file);
  } catch (err) {
    log('ERROR', `readQueue: ${err.message}`);
    return [];
  }
}

/**
 * Atomically move a task file between directories.
 * Returns the new path, or null if the file no longer exists (race condition).
 */
function moveTask(filename, fromDir, toDir) {
  const from = path.join(fromDir, filename);
  const to   = path.join(toDir,   filename);
  try {
    fs.renameSync(from, to);
    return to;
  } catch (err) {
    if (err.code === 'ENOENT') return null;  // already grabbed / moved
    log('ERROR', `moveTask ${filename}: ${fromDir} → ${toDir}: ${err.message}`);
    return null;
  }
}

/**
 * Overwrite a task file in its current location with updated data.
 */
function updateTask(filename, dir, data) {
  const fp = path.join(dir, filename);
  try {
    fs.writeFileSync(fp, JSON.stringify(data, null, 2));
  } catch (err) {
    log('ERROR', `updateTask ${filename}: ${err.message}`);
  }
}

// ── Document detection ────────────────────────────────────────────────────────

// Path resolved from config/agents.json path_key — not from display name.
// Changing the documentation agent's display_name will NOT affect this path.
// To rename the on-disk directory: update path_key in agents.json and move the dir.
const DOC_AGENT_DOCS_BASE    = getAgentWorkspacePath(AGENT_IDS.DOCUMENTATION_AGENT, 'documents');
const DOC_AGENT_DOC_SUBDIRS  = ['architecture', 'decisions', 'summaries'];

/**
 * Attempt to find the .txt file the documentation_agent created during this task.
 *
 * Strategy A — Agent included a file path in its result text (preferred):
 *   Scan result for a token ending in ".txt" that exists on disk.
 *
 * Strategy B — Recency scan:
 *   Walk the known document sub-directories and return the newest .txt file
 *   whose mtime falls within DOC_RECENCY_MS of the task's started_at time.
 *
 * Returns an absolute path string, or null if nothing found.
 */
const DOC_RECENCY_MS = 15_000;  // files written within 15s of task start qualify

function findGeneratedDocument(task, resultText) {
  // Strategy A: extract a path from the result text
  const pathMatch = resultText.match(/[\w./~-]+\.txt/g);
  if (pathMatch) {
    for (const candidate of pathMatch) {
      // Resolve relative to documentation agent docs base if not absolute
      const abs = path.isAbsolute(candidate)
        ? candidate
        : path.join(DOC_AGENT_DOCS_BASE, candidate);
      try {
        fs.accessSync(abs, fs.constants.R_OK);
        return abs;
      } catch (_) { /* try next */ }
    }
  }

  // Strategy B: find the newest .txt in any doc subdirectory written around task start
  const taskStartMs = task.started_at ? new Date(task.started_at).getTime() : (Date.now() - AGENT_TIMEOUT_MS);
  let newest = null;
  let newestMtime = 0;

  for (const sub of DOC_AGENT_DOC_SUBDIRS) {
    const dir = path.join(DOC_AGENT_DOCS_BASE, sub);
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
      for (const f of files) {
        const fp = path.join(dir, f);
        try {
          const { mtimeMs } = fs.statSync(fp);
          if (mtimeMs >= taskStartMs - DOC_RECENCY_MS && mtimeMs > newestMtime) {
            newestMtime = mtimeMs;
            newest = fp;
          }
        } catch (_) { /* skip unreadable */ }
      }
    } catch (_) { /* dir may not exist yet */ }
  }

  return newest;
}

// ── Agent invocation ──────────────────────────────────────────────────────────

/**
 * Invoke an agent via openclaw CLI.
 * Returns { stdout, stderr } on success, throws on failure.
 */
function invokeAgent(agentId, message) {
  return new Promise((resolve, reject) => {
    log('DEBUG', `execFile: openclaw --profile odin agent --agent ${agentId}`);
    execFile(
      OPENCLAW,
      ['--profile', 'odin', 'agent', '--agent', agentId, '--message', message],
      { timeout: AGENT_TIMEOUT_MS },
      (err, stdout, stderr) => {
        if (err) {
          const enriched = new Error(err.message);
          enriched.stdout = stdout || '';
          enriched.stderr = stderr || '';
          enriched.code   = err.code;
          reject(enriched);
        } else {
          resolve({ stdout: (stdout || '').trim(), stderr: (stderr || '').trim() });
        }
      }
    );
  });
}

/**
 * Format the message sent to an agent. Includes model routing metadata so the
 * agent has full context on how this task was classified and what tier it expects.
 */
function buildAgentMessage(task, taskClass) {
  const payload = typeof task.payload === 'string'
    ? task.payload
    : JSON.stringify(task.payload, null, 2);

  const fbs = (task.fallback_models || []).join(', ') || 'none';

  const lines = [
    `[Task Bus]`,
    `task_id=${task.task_id}  type=${task.type}  class=${taskClass}  priority=${task.priority || 'normal'}`,
    `source=${task.source || 'unknown'}  requested_by=${task.requested_by || 'unknown'}`,
    `model_lane=${task.model_lane || 'unknown'}  lane=${task.lane_label || '?'}  fallbacks=${fbs}`,
  ];

  // Preprocessing summary line — shown when preprocessing ran
  if (task.preprocessed) {
    lines.push(
      `preprocessed=true  ` +
      `${task.original_payload_length}→${task.preprocessed_payload_length}ch ` +
      `(−${task.preprocess_savings_pct}%)  via ${task.preprocessor_model}`
    );
  }

  lines.push('', payload);
  return lines.join('\n');
}

// ── Core task processor ───────────────────────────────────────────────────────

async function processTask(filename) {
  const processingPath = path.join(PROCESSING, filename);

  // ── Parse ──────────────────────────────────────────────────────────────────
  let task;
  try {
    const raw = fs.readFileSync(processingPath, 'utf8');
    task      = JSON.parse(raw);
  } catch (err) {
    log('ERROR', `Cannot parse ${filename}: ${err.message} — moving to failed/`);
    moveTask(filename, PROCESSING, FAILED);
    stats.failed++;
    return;
  }

  // Ensure task_id exists
  if (!task.task_id) task.task_id = randomUUID();

  // ── Provider benchmark fast-path ────────────────────────────────────────────
  // If task carries `test_lane`, bypass all agent routing and send directly
  // to the matching provider via bench_runner. Result goes to provider_lab/benchmarks/.
  if (task.test_lane && isTestLane(task.test_lane)) {
    stats.dispatched++;
    log('INFO',
      `→ Task ${task.task_id} | BENCH lane=${task.test_lane} | ` +
      `type=${task.type} priority=${task.priority || 'normal'} source=${task.source || '?'}`
    );

    let benchResult;
    try {
      benchResult = await runBenchmark(task);
    } catch (err) {
      // Unexpected error outside the provider call itself
      log('ERROR', `runBenchmark threw: ${err.message}`);
      benchResult = { success: false, benchFile: null, record: { error: err.message } };
    }

    const durationMs = benchResult.record?.latency_ms ?? 0;

    if (benchResult.success) {
      const completedTask = {
        ...task,
        task_class:   'benchmark',
        started_at:   benchResult.record.timestamp,
        completed_at: new Date().toISOString(),
        duration_ms:  durationMs,
        bench_file:   benchResult.benchFile,
        model:        benchResult.record.model,
        latency_ms:   benchResult.record.latency_ms,
        token_count:  benchResult.record.token_count,
      };
      updateTask(filename, PROCESSING, completedTask);
      const moved = moveTask(filename, PROCESSING, COMPLETED);
      log('INFO',
        `✓ Bench ${task.task_id} done (${durationMs}ms) lane=${task.test_lane} ` +
        `model=${benchResult.record.model} tokens=${benchResult.record.token_count?.total} ` +
        `→ ${moved ? 'completed/' : 'move failed'}`
      );
      stats.completed++;
    } else {
      const failedTask = {
        ...task,
        task_class:  'benchmark',
        started_at:  benchResult.record?.timestamp || new Date().toISOString(),
        failed_at:   new Date().toISOString(),
        duration_ms: durationMs,
        bench_file:  benchResult.benchFile,
        error:       benchResult.record?.error || 'Benchmark failed',
      };
      updateTask(filename, PROCESSING, failedTask);
      const moved = moveTask(filename, PROCESSING, FAILED);
      log('WARN',
        `✗ Bench ${task.task_id} FAILED lane=${task.test_lane} ` +
        `error=${benchResult.record?.error?.slice(0, 80)} ` +
        `→ ${moved ? 'failed/' : 'could not move'}`
      );
      stats.failed++;
    }
    return;   // skip normal agent routing below
  }

  // ── Preprocessing pass ─────────────────────────────────────────────────────
  // Classify early (free — no model call) so preprocessor can check eligibility.
  // If compression fires, task.payload is replaced and metadata fields are attached.
  // The classify call below will re-run on the (possibly compressed) task — the
  // class never changes from preprocessing, but this keeps the code clean.
  const earlyClass = classify(task);
  try {
    task = await preprocess(task, earlyClass, log);
  } catch (err) {
    // preprocess() should never throw — belt-and-suspenders guard
    log('WARN', `Preprocessor threw unexpectedly for ${task.task_id}: ${err.message}`);
  }

  if (task.preprocessed) {
    log('INFO',
      `[preprocess] Task ${task.task_id} compressed ` +
      `${task.original_payload_length}→${task.preprocessed_payload_length}ch ` +
      `(−${task.preprocess_savings_pct}%) via ${task.preprocessor_model}`
    );
    // Persist preprocessed metadata into processing/ immediately
    updateTask(filename, PROCESSING, task);
  } else if (task.preprocess_skipped_reason) {
    log('DEBUG',
      `[preprocess] Skipped ${task.task_id}: ${task.preprocess_skipped_reason}`
    );
  }

  // ── Classify + route + model annotation ────────────────────────────────────
  const taskClass    = classify(task);
  const agentChain   = routeWithFallbacks(taskClass);
  const primaryAgent = agentChain[0];
  const startedAt    = new Date().toISOString();

  // Attach assigned_agent, model_lane, fallback_models, lane_label to task
  annotateTask(task, taskClass, primaryAgent);

  // Persist annotation into processing/ immediately (traceability on crash)
  updateTask(filename, PROCESSING, task);

  log('INFO',
    `→ Task ${task.task_id} | ${describeRouting(taskClass, primaryAgent)} | ` +
    `type=${task.type} priority=${task.priority || 'normal'} source=${task.source || '?'}`
  );

  stats.dispatched++;

  // ── Invoke ─────────────────────────────────────────────────────────────────
  const message = buildAgentMessage(task, taskClass);
  let result    = null;
  let lastError = null;

  for (const agentId of agentChain) {
    if (agentId !== primaryAgent) {
      log('WARN', `Task ${task.task_id} — falling back to agent=${agentId}`);
    }
    try {
      result = await invokeAgent(agentId, message);
      result.agent = agentId;
      break;
    } catch (err) {
      log('WARN', `Task ${task.task_id} agent=${agentId} failed: ${err.message.slice(0, 120)}`);
      lastError = err;
    }
  }

  const durationMs = Date.now() - new Date(startedAt).getTime();

  // ── Handle failure ─────────────────────────────────────────────────────────
  if (!result) {
    const failedTask = {
      ...task,                           // already carries model routing fields
      task_class:      taskClass,
      agent:           primaryAgent,
      agent_chain:     agentChain,
      started_at:      startedAt,
      failed_at:       new Date().toISOString(),
      duration_ms:     durationMs,
      error:           lastError?.message || 'All agents in chain failed',
      stderr:          lastError?.stderr  || '',
    };
    updateTask(filename, PROCESSING, failedTask);
    const moved = moveTask(filename, PROCESSING, FAILED);
    log('WARN',
      `✗ Task ${task.task_id} FAILED (${durationMs}ms) lane=${task.lane_label} ` +
      `→ ${moved ? 'failed/' : 'could not move'}`
    );
    stats.failed++;
    return;
  }

  // ── Handle success ─────────────────────────────────────────────────────────
  const resultText = result.stdout.slice(0, 4000);
  const completedTask = {
    ...task,                             // already carries model routing fields
    task_class:      taskClass,
    agent:           result.agent,
    agent_chain:     agentChain,
    started_at:      startedAt,
    completed_at:    new Date().toISOString(),
    duration_ms:     durationMs,
    // Cap result to avoid bloating completed/ with huge LLM responses
    result:          resultText,
  };
  // Drop the raw original payload saved by preprocessor — it can be large and
  // is only needed for debugging; the task_id links back to the queue record.
  delete completedTask._original_payload;
  updateTask(filename, PROCESSING, completedTask);
  const moved = moveTask(filename, PROCESSING, COMPLETED);
  log('INFO',
    `✓ Task ${task.task_id} completed (${durationMs}ms) agent=${result.agent} ` +
    `lane=${task.lane_label} model=${task.model_lane} → ${moved ? 'completed/' : 'move failed'}`
  );
  stats.completed++;

  // ── Discord reply delivery ─────────────────────────────────────────────────
  // Always reply when the task originated from Discord — including rate-limited
  // completions where the agent skipped execution. "Successful" agent exit with
  // a rate-limit notice must not produce silent completion.
  if (task.source === 'discord' && task.reply_account && task.reply_target) {
    const isRateLimited =
      resultText.includes('Rate limit check') ||
      resultText.includes('queued for next hour') ||
      resultText.includes('rate limit');

    let replyMessage;
    if (isRateLimited) {
      replyMessage = `⚠️ ${getAgentName('adam')} rate limited — document deferred.\n\n${resultText}`;
      log('INFO',
        `Rate-limited result detected for task ${task.task_id} — sending deferred notice ` +
        `account=${task.reply_account} target=${task.reply_target}`
      );
    } else {
      replyMessage = formatMessage(resultText, task.task_id);
      log('INFO',
        `Replying to Discord — task ${task.task_id} ` +
        `account=${task.reply_account} target=${task.reply_target}`
      );
    }

    // Detect a document file the documentation_agent may have written during this task
    const docFile = !isRateLimited ? findGeneratedDocument(task, resultText) : null;
    if (docFile) {
      log('INFO',
        `Document attachment found for task ${task.task_id}: ${docFile}`
      );
    } else if (!isRateLimited && taskClass === 'documentation') {
      log('WARN',
        `No document file found for documentation task ${task.task_id} — sending text only`
      );
    }

    sendReply({
      account: task.reply_account,
      target:  task.reply_target,
      message: replyMessage,
      taskId:  task.task_id,
      file:    docFile || undefined,
    }).catch(err => {
      log('ERROR',
        `Discord reply failed for task ${task.task_id} ` +
        `account=${task.reply_account} target=${task.reply_target}: ${err.message.slice(0, 120)}`
      );
    });
  }
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function poll() {
  if (shuttingDown) return;

  const slots = MAX_CONCURRENT - active;
  if (slots <= 0) return;

  const files = readQueue().slice(0, slots);
  if (files.length === 0) return;

  for (const filename of files) {
    if (active >= MAX_CONCURRENT) break;

    // Atomically claim the task — if rename fails, another process got there first
    const moved = moveTask(filename, QUEUE, PROCESSING);
    if (!moved) continue;

    active++;
    log('DEBUG', `Claimed ${filename} (active=${active}/${MAX_CONCURRENT})`);

    processTask(filename)
      .catch(err => log('ERROR', `Unhandled error processing ${filename}: ${err.message}`))
      .finally(() => {
        active--;
        log('DEBUG', `Slot released (active=${active}/${MAX_CONCURRENT})`);
      });
  }
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

function gracefulShutdown(sig) {
  log('INFO', `${sig} received — draining ${active} active task(s)…`);
  shuttingDown = true;
  if (pollTimer) clearInterval(pollTimer);

  const deadline = setTimeout(() => {
    log('WARN', `Drain timeout after ${DRAIN_TIMEOUT_MS}ms — forcing exit`);
    process.exit(1);
  }, DRAIN_TIMEOUT_MS);
  deadline.unref();

  const check = setInterval(() => {
    if (active === 0) {
      clearInterval(check);
      log('INFO', `All tasks drained. dispatched=${stats.dispatched} completed=${stats.completed} failed=${stats.failed}`);
      process.exit(0);
    }
    log('DEBUG', `Waiting for ${active} task(s)…`);
  }, 500);
}

// ── Entry point ───────────────────────────────────────────────────────────────

function main() {
  ensureDirs();

  log('INFO', '─────────────────────────────────────────────────────');
  log('INFO', 'Task Bus Dispatcher started');
  log('INFO', `PID:             ${process.pid}`);
  log('INFO', `Max concurrent:  ${MAX_CONCURRENT}`);
  log('INFO', `Poll interval:   ${POLL_INTERVAL_MS}ms`);
  log('INFO', `Agent timeout:   ${AGENT_TIMEOUT_MS / 1000}s`);
  log('INFO', `Queue:           ${QUEUE}`);
  log('INFO', `Log:             ${LOG_FILE}`);

  // Recover any tasks stuck in processing/ from a previous crash
  try {
    const stuck = fs.readdirSync(PROCESSING).filter(f => f.endsWith('.json'));
    if (stuck.length > 0) {
      log('WARN', `Recovering ${stuck.length} task(s) stuck in processing/ → re-queuing`);
      for (const f of stuck) {
        const moved = moveTask(f, PROCESSING, QUEUE);
        if (moved) log('INFO', `  Re-queued: ${f}`);
      }
    }
  } catch (_) {}

  // Immediate first poll, then on interval
  poll();
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);

  // Heartbeat / stats every 30 minutes
  setInterval(() => {
    try {
      const qLen = fs.readdirSync(QUEUE).filter(f => f.endsWith('.json')).length;
      const pLen = fs.readdirSync(PROCESSING).filter(f => f.endsWith('.json')).length;
      const cLen = fs.readdirSync(COMPLETED).filter(f => f.endsWith('.json')).length;
      const fLen = fs.readdirSync(FAILED).filter(f => f.endsWith('.json')).length;
      log('INFO',
        `Heartbeat — active=${active}/${MAX_CONCURRENT} | ` +
        `queue=${qLen} processing=${pLen} completed=${cLen} failed=${fLen} | ` +
        `session: dispatched=${stats.dispatched} completed=${stats.completed} failed=${stats.failed}`
      );
    } catch (_) {
      log('INFO', `Heartbeat — active=${active}/${MAX_CONCURRENT}`);
    }
  }, HEARTBEAT_MS);

  process.stdin.resume();
  process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  log('INFO', 'Dispatcher ready. Watching for tasks…');
}

main();
