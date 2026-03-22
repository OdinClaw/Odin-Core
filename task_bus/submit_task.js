#!/usr/bin/env node
'use strict';
/**
 * submit_task.js
 * CLI utility for submitting tasks to the Task Bus queue.
 *
 * Usage:
 *   node submit_task.js --type <type> --payload "<message>" [options]
 *
 * Options:
 *   --type         Task type (e.g. reasoning, monitoring, documentation, system_event)
 *   --payload      Task content / message to send to the agent
 *   --priority     high | normal (default) | low
 *   --source       discord | cli (default) | watcher | agent
 *   --requested_by Who is requesting (default: operator)
 *   --dry-run      Print the task JSON without writing to queue
 *   --watch        Wait for task to move from processing/ and print result
 *
 * Examples:
 *   node submit_task.js --type reasoning --payload "Analyze the fallback chain config"
 *   node submit_task.js --type monitoring --payload "Check all agent health" --priority high
 *   node submit_task.js --type documentation --payload "Summarize today's Discord activity"
 *   node submit_task.js --type system_event --payload "openclaw.json updated: model changed"
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { randomUUID } = require('crypto');

const { getSystemName } = require('../config/names');

// ── Paths ─────────────────────────────────────────────────────────────────────

const HOME    = os.homedir();
const BASE    = path.join(HOME, '.openclaw-odin', 'task_bus');
const QUEUE   = path.join(BASE, 'queue');
const COMPLETED = path.join(BASE, 'completed');
const FAILED    = path.join(BASE, 'failed');

// ── Arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args  = {};
  const positional = [];
  let   i = 0;

  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i += 2;
      } else {
        args[key] = true;   // boolean flag
        i++;
      }
    } else {
      positional.push(a);
      i++;
    }
  }

  return { args, positional };
}

// ── Validation ────────────────────────────────────────────────────────────────

const VALID_PRIORITIES = ['high', 'normal', 'low'];
const VALID_SOURCES    = ['discord', 'cli', 'watcher', 'agent', 'system'];

function validate(opts) {
  const errors = [];

  if (!opts.payload) {
    errors.push('--payload is required');
  }

  if (opts.priority && !VALID_PRIORITIES.includes(opts.priority)) {
    errors.push(`--priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }

  if (opts.source && !VALID_SOURCES.includes(opts.source)) {
    errors.push(`--source must be one of: ${VALID_SOURCES.join(', ')}`);
  }

  return errors;
}

// ── Watch helper ──────────────────────────────────────────────────────────────

/**
 * Poll completed/ and failed/ until task_id appears, then print result.
 * Times out after 3 minutes.
 */
function watchTask(taskId) {
  console.log(`\nWaiting for task ${taskId} to complete…`);
  const timeout   = Date.now() + 3 * 60 * 1000;
  const interval  = setInterval(() => {
    if (Date.now() > timeout) {
      clearInterval(interval);
      console.error('Timed out waiting for task result.');
      process.exit(1);
    }

    for (const dir of [COMPLETED, FAILED]) {
      try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        for (const f of files) {
          try {
            const task = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            if (task.task_id !== taskId) continue;

            clearInterval(interval);
            const label = dir === COMPLETED ? '✓ COMPLETED' : '✗ FAILED';
            console.log(`\n${label} (${task.duration_ms}ms) — agent: ${task.agent}`);

            if (task.result) {
              console.log('\n── Agent Response ──');
              console.log(task.result);
            }
            if (task.error) {
              console.error('\n── Error ──');
              console.error(task.error);
            }
            process.exit(dir === COMPLETED ? 0 : 1);
          } catch (_) {}
        }
      } catch (_) {}
    }
  }, 1000);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const { args } = parseArgs(process.argv.slice(2));

  // Help
  if (args.help || args.h) {
    console.log(`
submit_task.js — Submit a task to the ${getSystemName()} Task Bus

Usage:
  node submit_task.js --type <type> --payload "<message>" [options]

Options:
  --type            Task type: reasoning|monitoring|documentation|system_event|orchestration
  --payload         Task content (required)
  --priority        high | normal (default) | low
  --source          cli (default) | discord | watcher | agent | system
  --requested_by    Originator name (default: operator)
  --test_lane       Provider benchmark lane: kimi | nemotron  (bypasses agent routing)
  --bench_model     Override model for benchmark (optional)
  --dry-run         Print task JSON without queuing
  --watch           Wait and print result after completion
  --help            Show this message

Examples:
  node submit_task.js --type reasoning --payload "Is the haiku fallback chain optimal?"
  node submit_task.js --type monitoring --payload "Check all agent connections" --priority high --watch
  node submit_task.js --test_lane kimi --payload "Explain the agent orchestration architecture"
  node submit_task.js --test_lane nemotron --payload "Analyze this config" --bench_model nvidia/nemotron-mini-4b-instruct
  node submit_task.js --type documentation --payload "Write an arch note about the task bus"
  node submit_task.js --type system_event --payload "openclaw.json updated: documentation_agent model changed"
`);
    process.exit(0);
  }

  // Build task
  const opts = {
    payload:       args.payload,
    type:          args.type          || 'orchestration',
    priority:      args.priority      || 'normal',
    source:        args.source        || 'cli',
    requested_by:  args.requested_by  || 'operator',
    reply_account: args.reply_account || null,
    reply_target:  args.reply_target  || null,
    test_lane:     args.test_lane     || null,
    bench_model:   args.bench_model   || null,
    'dry-run':     args['dry-run']    || false,
    watch:         args.watch         || false,
    json:          args.json          || false,
  };

  const errors = validate(opts);
  if (errors.length) {
    for (const e of errors) console.error(`Error: ${e}`);
    console.error('\nRun with --help for usage.');
    process.exit(1);
  }

  const task = {
    task_id:      randomUUID(),
    type:         opts.type,
    priority:     opts.priority,
    source:       opts.source,
    requested_by: opts.requested_by,
    payload:      opts.payload,
    timestamp:    new Date().toISOString(),
    // Discord reply routing — only included when set
    ...(opts.reply_account ? { reply_account: opts.reply_account } : {}),
    ...(opts.reply_target  ? { reply_target:  opts.reply_target  } : {}),
    // Benchmark fields — only included when test_lane is set
    ...(opts.test_lane   ? { test_lane:   opts.test_lane   } : {}),
    ...(opts.bench_model ? { bench_model: opts.bench_model } : {}),
  };

  // Dry-run mode
  if (opts['dry-run']) {
    console.log('── Dry run (not queued) ──');
    console.log(JSON.stringify(task, null, 2));
    process.exit(0);
  }

  // Write to queue
  fs.mkdirSync(QUEUE, { recursive: true });
  const filename = `${Date.now()}_${task.task_id}.json`;
  const filepath = path.join(QUEUE, filename);

  try {
    fs.writeFileSync(filepath, JSON.stringify(task, null, 2));
  } catch (err) {
    console.error(`Failed to write task: ${err.message}`);
    process.exit(1);
  }

  // Machine-readable JSON output (used by gateway plugin)
  if (opts.json) {
    console.log(JSON.stringify({ task_id: task.task_id, file: filepath }));
  } else {
    console.log(`Queued: ${filename}`);
    console.log(`  task_id:   ${task.task_id}`);
    console.log(`  type:      ${task.type}`);
    console.log(`  priority:  ${task.priority}`);
    console.log(`  source:    ${task.source}`);
    if (task.reply_account) console.log(`  reply_account: ${task.reply_account}`);
    if (task.reply_target)  console.log(`  reply_target:  ${task.reply_target}`);
    if (task.test_lane)     console.log(`  test_lane: ${task.test_lane}  [benchmark — bypasses agent routing]`);
    if (task.bench_model)   console.log(`  model:     ${task.bench_model}`);
  }

  if (opts.watch) {
    watchTask(task.task_id);
  }
}

main();
