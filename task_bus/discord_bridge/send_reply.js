#!/usr/bin/env node
'use strict';
/**
 * send_reply.js
 * Delivers a task result back to the originating Discord channel.
 *
 * Called by dispatcher.js after successful agent execution when the task
 * originated from Discord (source === 'discord' && reply_account && reply_target).
 *
 * Usage:
 *   node send_reply.js --account <accountId> --target <channelId> --message "<text>"
 *   node send_reply.js --task-file <path/to/completed-task.json>
 *
 * Internally calls:
 *   openclaw --profile odin message send \
 *     --channel discord \
 *     --account <accountId> \
 *     --target <channelId> \
 *     --message <text>
 */

const { execFile: _execFile } = require('child_process');
const { promisify }           = require('util');
const fs                      = require('fs');
const path                    = require('path');
const os                      = require('os');

const execFile = promisify(_execFile);

// ── Constants ──────────────────────────────────────────────────────────────────

const HOME     = os.homedir();
const LOG_FILE = path.join(HOME, '.openclaw-odin', 'task_bus', 'logs', 'task_bus.log');

// openclaw CLI — look for it in PATH, common install locations
const OPENCLAW_CANDIDATES = [
  'openclaw',
  '/usr/local/bin/openclaw',
  '/opt/homebrew/bin/openclaw',
  path.join(HOME, '.local', 'bin', 'openclaw'),
];

// Maximum message length Discord allows (2000 chars); truncate if needed
const DISCORD_MAX_LENGTH = 1900;

// Prefix added to all task-bus-delivered responses so recipients know the source
const REPLY_PREFIX = '[Task Bus]';

// ── Logging ────────────────────────────────────────────────────────────────────

function logLine(level, msg) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] [${level}] [discord-bridge] ${msg}\n`;
  process.stderr.write(line);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch (_) { /* non-fatal */ }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Find the openclaw binary by trying candidates in order.
 * Returns the first one found in PATH, or throws.
 */
async function findOpenClaw() {
  for (const candidate of OPENCLAW_CANDIDATES) {
    try {
      await execFile('which', [candidate]);
      return candidate;
    } catch (_) {
      // Not found via `which` — try direct existence check
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch (_2) { /* try next */ }
    }
  }
  // Last resort: try running directly — it may be in shell PATH even if not via which
  return 'openclaw';
}

/**
 * Truncate text to fit Discord's message limit.
 * Appends "… [truncated]" if truncated.
 */
function truncate(text) {
  if (text.length <= DISCORD_MAX_LENGTH) return text;
  const suffix = '\n… [truncated]';
  return text.slice(0, DISCORD_MAX_LENGTH - suffix.length) + suffix;
}

/**
 * Format the agent result for Discord delivery.
 * The [Task Bus] prefix is prepended internally so the gateway plugin's
 * re-entrancy guard recognises the message and skips re-queuing it.
 * The prefix is stripped before display — users never see it.
 */
function formatMessage(result, taskId) {
  const body = truncate(String(result || '(no result)'));
  return `${REPLY_PREFIX}\n${body}`;
}

/**
 * Strip the internal [Task Bus] prefix from a message before it reaches Discord.
 * Called inside sendReply() so the guard header is present during hook evaluation
 * but absent from the final rendered message.
 */
function stripPrefix(message) {
  if (message.startsWith(`${REPLY_PREFIX}\n`)) {
    return message.slice(REPLY_PREFIX.length + 1);  // +1 for the \n
  }
  return message;
}

// ── Core send function ─────────────────────────────────────────────────────────

/**
 * Send a message (optionally with a file attachment) to a Discord channel.
 * @param {object} opts
 * @param {string}  opts.account     - Discord account ID (e.g. 'default', 'loki')
 * @param {string}  opts.target      - Discord channel ID
 * @param {string}  opts.message     - Message text to send
 * @param {string}  [opts.taskId]    - For logging
 * @param {string}  [opts.file]      - Absolute path to a file to attach (optional)
 */
async function sendReply({ account, target, message, taskId, file }) {
  const openclaw = await findOpenClaw();

  // Validate file path if provided — skip attachment (with warning) if missing
  let resolvedFile = null;
  if (file) {
    try {
      fs.accessSync(file, fs.constants.R_OK);
      resolvedFile = file;
      logLine('INFO',
        `Sending Discord reply with --media attachment: ${resolvedFile} — ` +
        `task_id=${taskId || 'n/a'} account=${account} target=${target}`
      );
    } catch (_) {
      logLine('WARN',
        `Attachment file not found or unreadable, sending text only: ${file} — ` +
        `task_id=${taskId || 'n/a'}`
      );
    }
  }

  // Strip the internal [Task Bus] prefix before sending — users should not see it.
  // The prefix is still present on the message object passed through the hook
  // pipeline, where the gateway plugin uses it as a re-entrancy guard.
  const userMessage = stripPrefix(message);

  const args = [
    '--profile', 'odin',
    'message', 'send',
    '--channel', 'discord',
    '--account', account,
    '--target',  target,
    '--message', userMessage,
    ...(resolvedFile ? ['--media', resolvedFile] : []),
  ];

  if (!resolvedFile) {
    logLine('INFO',
      `Sending reply — task_id=${taskId || 'n/a'} account=${account} ` +
      `target=${target} len=${userMessage.length}ch`
    );
  }

  const { stdout, stderr } = await execFile(openclaw, args, {
    timeout: 15_000,
    env: { ...process.env },
  });

  if (stderr && stderr.trim()) {
    logLine('WARN', `openclaw stderr: ${stderr.trim().slice(0, 200)}`);
  }

  logLine('INFO',
    `Reply sent — task_id=${taskId || 'n/a'} account=${account} target=${target}` +
    (resolvedFile ? ` +file=${path.basename(resolvedFile)}` : '')
  );
  return { success: true, stdout };
}

// ── CLI entrypoint ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key  = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i += 2;
      } else {
        args[key] = true;
        i++;
      }
    } else {
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Mode 1: --task-file <path> — read account/target/result from a completed task JSON
  if (args['task-file']) {
    let task;
    try {
      task = JSON.parse(fs.readFileSync(args['task-file'], 'utf8'));
    } catch (err) {
      console.error(`Failed to read task file: ${err.message}`);
      process.exit(1);
    }

    if (!task.reply_account || !task.reply_target) {
      console.error('Task has no reply_account / reply_target — nothing to send');
      process.exit(0);
    }

    const message = formatMessage(task.result, task.task_id);
    try {
      await sendReply({
        account: task.reply_account,
        target:  task.reply_target,
        message,
        taskId:  task.task_id,
      });
    } catch (err) {
      logLine('ERROR', `Failed to send reply: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  // Mode 2: explicit --account / --target / --message flags
  if (!args.account || !args.target || !args.message) {
    console.error('Usage: send_reply.js --account <id> --target <channelId> --message "<text>"');
    console.error('   or: send_reply.js --task-file <path/to/completed-task.json>');
    process.exit(1);
  }

  try {
    await sendReply({
      account: args.account,
      target:  args.target,
      message: args.message,
      taskId:  args['task-id'] || null,
    });
  } catch (err) {
    logLine('ERROR', `Failed to send reply: ${err.message}`);
    process.exit(1);
  }
}

// ── Exported API (for use by dispatcher.js) ───────────────────────────────────

module.exports = { sendReply, formatMessage };

// ── CLI entrypoint guard ───────────────────────────────────────────────────────
// Only execute CLI logic when run directly (node send_reply.js ...).
// When require()'d by dispatcher.js, this block is skipped entirely.

if (require.main === module) {
  main().catch(err => {
    console.error(`Unhandled error: ${err.message}`);
    process.exit(1);
  });
}
