'use strict';
/**
 * report_export.js
 * Tesla export run reporting.
 *
 * Every export writes a timestamped JSON report to tesla/logs/.
 * The most recent report is always available at tesla/logs/latest.json.
 * Discord formatting is provided for the command bridge.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const TESLA_DIR = path.join(os.homedir(), '.openclaw-odin', 'tesla');
const LOGS_DIR  = path.join(TESLA_DIR, 'logs');
const LATEST    = path.join(LOGS_DIR, 'latest.json');

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Write a report object to disk.
 * Enriches the report with generatedAt and a unique filename.
 *
 * @param {object} report
 * @returns {string} absolute path of the written file
 */
function writeReport(report) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  const ts       = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `tesla-report-${ts}.json`;
  const filePath = path.join(LOGS_DIR, filename);

  const enriched = {
    ...report,
    reportFile:  filename,
    generatedAt: new Date().toISOString(),
  };

  const content = JSON.stringify(enriched, null, 2);
  fs.writeFileSync(filePath, content, 'utf8');
  fs.writeFileSync(LATEST, content, 'utf8');  // always keep latest in sync

  return filePath;
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Read the most recent export report.
 * @returns {object|null}
 */
function readLatestReport() {
  try {
    return JSON.parse(fs.readFileSync(LATEST, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * List all saved reports (newest first).
 * @param {number} [limit=10]
 * @returns {Array<string>} filenames
 */
function listReports(limit) {
  limit = limit || 10;
  try {
    return fs.readdirSync(LOGS_DIR)
      .filter(f => f.startsWith('tesla-report-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);
  } catch (_) {
    return [];
  }
}

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Format a report as a concise Discord-ready string.
 * Fits within Discord's 2000 character limit.
 *
 * @param {object|null} report
 * @returns {string}
 */
function formatReportForDiscord(report) {
  if (!report) return '❌ No export reports found. Run `tesla export system` first.';

  const icon   = report.success ? '✅' : '❌';
  const drFlag = report.dryRun  ? ' _(dry run)_' : '';
  const ts     = (report.timestamp || report.generatedAt || '').slice(0, 19).replace('T', ' ');

  const lines = [
    `${icon} **Tesla Export Report**${drFlag}`,
    `Action:     \`${report.action || 'unknown'}\``,
    `Time:       ${ts} UTC`,
    `Repo:       \`${report.repoTarget || 'N/A'}\``,
    `Branch:     \`${report.branchTarget || 'N/A'}\``,
    `Validation: ${report.validationPassed ? '✅ passed' : '❌ failed'}`,
    `Files:      ${report.fileCount || 0} included / ${report.excludedCount || 0} excluded`,
    `Redactions: ${report.redactionCount || 0}`,
    `Push:       ${report.pushResult || 'not attempted'}`,
  ];

  if (report.commitHash) {
    lines.push(`Commit:     \`${report.commitHash.slice(0, 12)}\``);
  }

  if (!report.success && report.failureReason) {
    const reason = report.failureReason.slice(0, 300);
    lines.push(`Failure:    ${reason}`);
  }

  if (report.agentFunctionalId) {
    lines.push(`Agent:      \`${report.agentFunctionalId}\``);
  }

  return lines.join('\n');
}

module.exports = {
  writeReport,
  readLatestReport,
  listReports,
  formatReportForDiscord,
  LOGS_DIR,
  LATEST,
};
