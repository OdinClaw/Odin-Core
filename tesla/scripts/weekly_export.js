#!/usr/bin/env node
'use strict';
/**
 * weekly_export.js
 * Tesla weekly full-system export entry point.
 *
 * Designed to be called by launchd (or any cron-compatible scheduler).
 * Runs a full system export with --no-push flag optional via env var.
 *
 * Environment:
 *   TESLA_WEEKLY_NO_PUSH=true   — collect + validate but skip push (test mode)
 *   GITHUB_TOKEN                — required for actual push
 *   GITHUB_USERNAME             — required for remote URL construction
 *
 * Log output goes to tesla/logs/weekly.log (stdout) and stderr.
 * The run report is always written to tesla/logs/latest.json.
 *
 * launchd wiring:
 *   See tesla/launchd/ai.openclaw.tesla.weekly.plist.template
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const { run: exportSystem }            = require('./export_system');
const { formatReportForDiscord }       = require('./report_export');

const TESLA_DIR  = path.join(os.homedir(), '.openclaw-odin', 'tesla');
const LOGS_DIR   = path.join(TESLA_DIR, 'logs');
const WEEKLY_LOG = path.join(LOGS_DIR, 'weekly.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] [tesla:weekly] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    fs.appendFileSync(WEEKLY_LOG, line);
  } catch (_) {}
}

async function main() {
  log('═══════════════════════════════════════════');
  log('Tesla Weekly Full Export — Starting');
  log(`PID: ${process.pid}`);

  const noPush = process.env.TESLA_WEEKLY_NO_PUSH === 'true';
  if (noPush) log('TESLA_WEEKLY_NO_PUSH=true — push disabled');

  const report = await exportSystem({ dryRun: false, noPush });

  log('═══════════════════════════════════════════');
  log(report.success ? 'Weekly export: SUCCESS' : `Weekly export: FAILED — ${report.failureReason}`);
  log(formatReportForDiscord(report));

  process.exit(report.success ? 0 : 1);
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
