#!/usr/bin/env node
'use strict';
/**
 * export_system.js
 * Tesla full-system export orchestrator.
 *
 * Usage:
 *   node export_system.js [--dry-run] [--no-push]
 *
 * Flags:
 *   --dry-run   Collect and report without copying or pushing
 *   --no-push   Collect, sanitize, validate — but skip the GitHub push
 *
 * Flow:
 *   1. Validate live config (config/validate.js --strict --compat)
 *   2. Load manifest + targets + rules
 *   3. Collect files
 *   4. Prepare temp export directory
 *   5. Sanitize + copy files
 *   6. Generate .env.example
 *   7. Validate export directory
 *   8. Push to GitHub (unless --dry-run / --no-push)
 *   9. Clean up temp dir
 *  10. Write report
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const { collectSystemFiles }               = require('./collect_files');
const { sanitizeExport }                   = require('./sanitize_export');
const { validateExport, runConfigValidation } = require('./validate_export');
const { writeEnvExample }                  = require('./build_env_template');
const { pushToGitHub }                     = require('./push_github');
const { writeReport, formatReportForDiscord } = require('./report_export');

const BASE_DIR  = path.join(os.homedir(), '.openclaw-odin');
const TESLA_DIR = path.join(BASE_DIR, 'tesla');
const TEMP_BASE = path.join(TESLA_DIR, 'temp');

function loadJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(TESLA_DIR, relPath), 'utf8'));
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] [tesla:system] ${msg}`);
}

// ── Export orchestration ──────────────────────────────────────────────────────

async function run(opts) {
  opts = opts || {};
  const dryRun  = opts.dryRun  === true;
  const noPush  = opts.noPush  === true;
  const date    = new Date().toISOString().slice(0, 10);
  const tempDir = path.join(TEMP_BASE, `full-${date}-${process.pid}`);

  const report = {
    action:           'full_system_export',
    timestamp:        new Date().toISOString(),
    dryRun,
    repoTarget:       null,
    branchTarget:     null,
    validationPassed: false,
    fileCount:        0,
    excludedCount:    0,
    redactionCount:   0,
    pushResult:       'not_attempted',
    commitHash:       null,
    success:          false,
    failureReason:    null,
  };

  try {
    // ── Load Tesla config ────────────────────────────────────────────────
    log('Loading Tesla config...');
    const manifest      = loadJSON('manifests/full_export.json');
    const targets       = loadJSON('config/export_targets.json');
    const rules         = loadJSON('config/sanitize_rules.json');
    const githubTargets = loadJSON('config/github_targets.json');
    const ghTarget      = githubTargets.full_export;

    const branch    = ghTarget.branch_template.replace('{DATE}', date);
    const commitMsg = ghTarget.commit_template.replace('{DATE}', date);

    report.repoTarget   = ghTarget.repo_name;
    report.branchTarget = branch;

    // ── Step 1: Validate live config ─────────────────────────────────────
    log('Running live config validation (--strict --compat)...');
    const cv = runConfigValidation();
    if (!cv.passed) {
      throw new Error(`Live config validation failed:\n${cv.output.slice(0, 500)}`);
    }
    log(`Config validation: PASSED (${cv.checkCount} checks)`);

    // ── Step 2: Collect files ─────────────────────────────────────────────
    log('Collecting files from manifest...');
    const { files, excluded, missing } = collectSystemFiles(manifest, targets, BASE_DIR);

    report.fileCount     = files.length;
    report.excludedCount = excluded.length;  // manifest items skipped by exclusion patterns

    if (missing.length > 0) {
      throw new Error(`Required manifest items missing: ${missing.join(', ')}`);
    }

    log(`Collected ${files.length} files (${excluded.length} pattern-excluded)`);

    // ── Dry-run: report and exit ──────────────────────────────────────────
    if (dryRun) {
      log('── DRY RUN ─────────────────────────────────────');
      log(`Would export to: ${ghTarget.repo_name} @ ${branch}`);
      log(`Included files (${files.length}):`);
      files.forEach(f => log(`  + ${f.relPath}`));
      if (excluded.length > 0) {
        log(`Excluded by pattern (${excluded.length}):`);
        excluded.forEach(e => log(`  - ${e}`));
      }
      log('────────────────────────────────────────────────');

      report.validationPassed = true;
      report.success          = true;
      report.pushResult       = 'dry_run_skipped';
      const rp = writeReport(report);
      log(`Dry-run report: ${rp}`);
      log('\n' + formatReportForDiscord(report));
      return report;
    }

    // ── Step 3: Prepare temp dir ──────────────────────────────────────────
    log(`Creating temp dir: ${tempDir}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // ── Step 4: Sanitize + copy ───────────────────────────────────────────
    log('Sanitizing and copying files...');
    const san = sanitizeExport(files, tempDir, rules, false);

    if (!san.ok) {
      throw new Error(
        `ABORT: Secret detected — ${san.aborted.reason}\n` +
        `File: ${san.aborted.file}\nMatch: ${san.aborted.match}`
      );
    }

    report.redactionCount = san.redacted.reduce((s, r) => s + r.redactions, 0);

    if (san.redacted.length > 0) {
      log(`Redacted machine paths in ${san.redacted.length} file(s)`);
    }

    // ── Step 5: Generate .env.example ────────────────────────────────────
    log('Generating .env.example...');
    writeEnvExample(tempDir);

    // ── Step 6: Validate export ───────────────────────────────────────────
    log('Validating export package...');
    const val = validateExport(tempDir, manifest, rules, true);  // skipConfig=true
    report.validationPassed = val.passed;

    if (!val.passed) {
      const failures = val.checks
        .filter(c => !c.passed)
        .map(c => `  [${c.name}] ${c.detail}`)
        .join('\n');
      throw new Error(`Export validation failed:\n${failures}`);
    }
    log('Export validation: PASSED');
    val.checks.forEach(c => log(`  ✓ ${c.name}: ${c.detail}`));

    // ── Step 7: Push to GitHub ────────────────────────────────────────────
    if (noPush) {
      log('--no-push flag set — skipping GitHub push');
      report.pushResult = 'skipped_by_flag';
    } else {
      log(`Pushing to GitHub: ${ghTarget.repo_name} @ ${branch} ...`);
      const push = pushToGitHub(tempDir, ghTarget, branch, commitMsg, false);
      report.commitHash = push.commitHash;
      report.pushResult = push.ok ? 'success' : `failed: ${push.stderr.slice(0, 200)}`;

      if (!push.ok) {
        throw new Error(`GitHub push failed: ${push.stderr}`);
      }
      log(`Push successful — commit: ${push.commitHash}`);
      log(`Remote: ${push.remote} @ ${branch}`);
    }

    report.success = true;

  } catch (err) {
    report.failureReason = err.message;
    report.success       = false;
    log(`EXPORT FAILED: ${err.message}`);
  } finally {
    // ── Clean up temp dir ─────────────────────────────────────────────────
    if (!dryRun && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        log('Temp dir cleaned up');
      } catch (e) {
        log(`Warning: could not clean temp dir: ${e.message}`);
      }
    }
  }

  const reportPath = writeReport(report);
  log(`Report: ${reportPath}`);
  log('\n' + formatReportForDiscord(report));

  return report;
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

if (require.main === module) {
  const args   = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const noPush = args.includes('--no-push');

  run({ dryRun, noPush }).then(report => {
    process.exit(report.success ? 0 : 1);
  }).catch(err => {
    console.error(`Unhandled error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { run };
