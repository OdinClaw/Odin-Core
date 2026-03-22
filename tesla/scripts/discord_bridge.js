#!/usr/bin/env node
'use strict';
/**
 * discord_bridge.js
 * Tesla Discord command bridge.
 *
 * Parses incoming Tesla commands and delegates to core scripts.
 * Designed to be called by the Tesla OpenClaw agent or directly from CLI.
 * Contains zero export business logic — delegates entirely to core scripts.
 *
 * Supported commands:
 *   tesla ping
 *   tesla status
 *   tesla dryrun system
 *   tesla export system [--no-push]
 *   tesla export agent <functional_id>
 *   tesla validate export
 *   tesla last report
 *
 * Usage:
 *   node discord_bridge.js "tesla ping"
 *   node discord_bridge.js "tesla export agent documentation_agent"
 *   node discord_bridge.js "tesla dryrun system"
 */

const { spawnSync }                           = require('child_process');
const path                                    = require('path');

const { readLatestReport, formatReportForDiscord } = require('./report_export');
const { runConfigValidation }                 = require('./validate_export');

const SCRIPTS = __dirname;

function log(msg) {
  process.stderr.write(`[${new Date().toISOString()}] [tesla:bridge] ${msg}\n`);
}

// ── Script runner ─────────────────────────────────────────────────────────────

/**
 * Spawn a Tesla core script as a subprocess and capture output.
 * Timeout: 5 minutes (exports can take time).
 */
function runScript(scriptName, args) {
  args = args || [];
  const scriptPath = path.join(SCRIPTS, scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    timeout:  300_000,
    env:      process.env,
    cwd:      SCRIPTS,
  });
  return {
    ok:     result.status === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    code:   result.status,
  };
}

// ── Help text ─────────────────────────────────────────────────────────────────

const HELP = [
  '**Tesla v1 — Export Agent**',
  '',
  '**Commands:**',
  '  `tesla ping`                        — health check',
  '  `tesla status`                      — config status + last export summary',
  '  `tesla dryrun system`               — preview full system export (no push)',
  '  `tesla export system`               — full system export to odin-core',
  '  `tesla export system --no-push`     — collect + validate, skip GitHub push',
  '  `tesla export agent <functional_id>` — export single agent to odin-agents',
  '  `tesla validate export`             — run config/validate.js checks',
  '  `tesla last report`                 — show most recent export report',
  '',
  '**Agent functional IDs:**',
  '  `orchestrator`, `reasoning_engine`, `monitor_agent`, `documentation_agent`',
  '  `portfolio_curator_agent` (Tesla itself), and 10 workspace agents.',
].join('\n');

// ── Command handlers ──────────────────────────────────────────────────────────

/**
 * Parse and execute a Tesla Discord command.
 * @param {string} rawCommand - full message text, e.g. "tesla ping"
 * @returns {Promise<string>} - Discord-ready response (≤ 2000 chars)
 */
async function handleCommand(rawCommand) {
  if (!rawCommand || typeof rawCommand !== 'string') {
    return '❌ Empty command.';
  }

  const trimmed = rawCommand.trim();
  const lower   = trimmed.toLowerCase();
  const tokens  = lower.split(/\s+/);

  if (tokens[0] !== 'tesla') {
    return `❌ Tesla commands must start with \`tesla\`. Got: \`${tokens[0]}\`\n\n${HELP}`;
  }

  const sub = tokens[1];

  // ── tesla ping ────────────────────────────────────────────────────────
  if (sub === 'ping') {
    return '🟢 Tesla v1 online — export engine ready.';
  }

  // ── tesla status ──────────────────────────────────────────────────────
  if (sub === 'status') {
    log('Running status check...');
    const cv     = runConfigValidation();
    const report = readLatestReport();
    const lines  = [
      '🛰️ **Tesla Status**',
      `Config: ${cv.passed ? `✅ passing (${cv.checkCount} checks)` : '❌ FAILING'}`,
    ];
    if (report) {
      const ts = (report.timestamp || report.generatedAt || '').slice(0, 19).replace('T', ' ');
      lines.push(`Last export: \`${report.action}\` — ${ts} UTC`);
      lines.push(`Last result: ${report.success ? '✅ success' : `❌ failed: ${(report.failureReason || '').slice(0, 80)}`}`);
    } else {
      lines.push('Last export: _none yet_');
    }
    return lines.join('\n');
  }

  // ── tesla dryrun system ───────────────────────────────────────────────
  if (sub === 'dryrun' && tokens[2] === 'system') {
    log('Starting full system dry run...');
    const r      = runScript('export_system.js', ['--dry-run']);
    const report = readLatestReport();
    const lines  = [
      '🧪 **Tesla Dry Run — Full System**',
      report ? formatReportForDiscord(report) : `Exit ${r.code}`,
    ];
    if (!report && r.stdout) {
      // Show last 1200 chars of stdout as fallback
      lines.push('```\n' + r.stdout.slice(-1200) + '\n```');
    }
    return lines.join('\n');
  }

  // ── tesla export system ───────────────────────────────────────────────
  if (sub === 'export' && tokens[2] === 'system') {
    const noPush = lower.includes('--no-push');
    const args   = noPush ? ['--no-push'] : [];
    log(`Starting full system export (no-push: ${noPush})...`);
    runScript('export_system.js', args);
    const report = readLatestReport();
    return report ? formatReportForDiscord(report) : '⚠️ Export ran but no report found.';
  }

  // ── tesla export agent <functional_id> ───────────────────────────────
  if (sub === 'export' && tokens[2] === 'agent') {
    // Preserve original casing of functional_id from raw command
    const rawTokens    = trimmed.split(/\s+/);
    const functionalId = rawTokens[3];
    if (!functionalId) {
      return '❌ Usage: `tesla export agent <functional_id>`\nExample: `tesla export agent documentation_agent`';
    }
    log(`Starting agent export: ${functionalId}`);
    runScript('export_agent.js', [functionalId]);
    const report = readLatestReport();
    return report ? formatReportForDiscord(report) : '⚠️ Agent export ran but no report found.';
  }

  // ── tesla validate export ─────────────────────────────────────────────
  if (sub === 'validate' && tokens[2] === 'export') {
    log('Running config validation...');
    const cv = runConfigValidation();
    const lines = [
      `🔍 **Tesla Validate**`,
      cv.passed
        ? `✅ Config validation: PASSED (${cv.checkCount} checks)`
        : '❌ Config validation: FAILED',
    ];
    if (!cv.passed) {
      const failures = cv.output.split('\n')
        .filter(l => /✗|FAIL|Failed/.test(l))
        .slice(0, 10)
        .join('\n');
      lines.push('```\n' + failures + '\n```');
    } else {
      lines.push('System is clean and ready for export.');
    }
    return lines.join('\n');
  }

  // ── tesla last report ─────────────────────────────────────────────────
  if (sub === 'last' && tokens[2] === 'report') {
    const report = readLatestReport();
    return formatReportForDiscord(report);
  }

  // ── help / unknown ────────────────────────────────────────────────────
  if (sub === 'help' || !sub) return HELP;

  return `❓ Unknown command: \`tesla ${tokens.slice(1).join(' ')}\`\n\n${HELP}`;
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

if (require.main === module) {
  const rawCommand = process.argv.slice(2).join(' ');
  if (!rawCommand) {
    console.log(HELP);
    process.exit(0);
  }

  handleCommand(rawCommand).then(response => {
    console.log(response);
    process.exit(0);
  }).catch(err => {
    console.error(`Bridge error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { handleCommand };
