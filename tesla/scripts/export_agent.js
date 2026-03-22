#!/usr/bin/env node
'use strict';
/**
 * export_agent.js
 * Tesla single-agent export orchestrator.
 *
 * Usage:
 *   node export_agent.js <functional_id> [--dry-run] [--no-push]
 *
 * Examples:
 *   node export_agent.js documentation_agent
 *   node export_agent.js reasoning_engine --dry-run
 *   node export_agent.js monitor_agent --no-push
 *
 * Resolves the agent by functional_id (from agents.json),
 * collects config + workspace files, sanitizes, validates, and pushes.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// Config helpers — reuse existing config layer
const { getAgentByFunctionalId, getAllAgentIds, getAgentFunctionalId } = require('../../config/names');

const { collectAgentFiles }                    = require('./collect_files');
const { sanitizeExport }                       = require('./sanitize_export');
const { validateExport, runConfigValidation }  = require('./validate_export');
const { writeEnvExample }                      = require('./build_env_template');
const { pushToGitHub }                         = require('./push_github');
const { writeReport, formatReportForDiscord }  = require('./report_export');

const BASE_DIR  = path.join(os.homedir(), '.openclaw-odin');
const TESLA_DIR = path.join(BASE_DIR, 'tesla');
const TEMP_BASE = path.join(TESLA_DIR, 'temp');

function loadJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(TESLA_DIR, relPath), 'utf8'));
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] [tesla:agent] ${msg}`);
}

// ── Agent resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a functional_id to full agent metadata.
 * Supports both functional_id lookup and platform_id aliases.
 */
function resolveAgent(input) {
  if (!input) return null;
  const lower = input.toLowerCase().trim();

  // Try functional_id lookup first
  const byFunctional = getAgentByFunctionalId(lower);
  if (byFunctional) return byFunctional;

  // Try as platform_id — check if it has a functional_id
  try {
    const funcId = getAgentFunctionalId(lower);
    if (funcId) {
      return getAgentByFunctionalId(funcId);
    }
  } catch (_) {}

  return null;
}

// ── Export orchestration ──────────────────────────────────────────────────────

async function run(agentInput, opts) {
  opts = opts || {};
  const dryRun = opts.dryRun === true;
  const noPush = opts.noPush === true;
  const date   = new Date().toISOString().slice(0, 10);

  const report = {
    action:            'agent_export',
    timestamp:         new Date().toISOString(),
    agentInput,
    agentFunctionalId: null,
    agentPlatformId:   null,
    dryRun,
    repoTarget:        null,
    branchTarget:      null,
    validationPassed:  false,
    fileCount:         0,
    excludedCount:     0,
    redactionCount:    0,
    pushResult:        'not_attempted',
    commitHash:        null,
    success:           false,
    failureReason:     null,
  };

  let tempDir = null;

  try {
    // ── Resolve agent ─────────────────────────────────────────────────────
    if (!agentInput) throw new Error('functional_id argument is required');

    const agent = resolveAgent(agentInput);
    if (!agent) {
      const available = getAllAgentIds()
        .map(pid => `${pid} (${getAgentFunctionalId(pid)})`)
        .join(', ');
      throw new Error(`Unknown agent: "${agentInput}". Available: ${available}`);
    }

    const { platformId, path_key, display_name, functional_id } = agent;
    report.agentFunctionalId = functional_id;
    report.agentPlatformId   = platformId;

    log(`Resolved: "${agentInput}" → platform_id="${platformId}" (${display_name}), path_key="${path_key}"`);

    const safeName = functional_id.replace(/_/g, '-');
    tempDir = path.join(TEMP_BASE, `agent-${safeName}-${date}-${process.pid}`);

    // ── Load Tesla config ─────────────────────────────────────────────────
    const manifest      = loadJSON('manifests/agent_export.json');
    const rules         = loadJSON('config/sanitize_rules.json');
    const githubTargets = loadJSON('config/github_targets.json');
    const ghTarget      = githubTargets.agent_export;

    const branch    = ghTarget.branch_template
      .replace('{AGENT_ID}', safeName)
      .replace('{DATE}',     date);
    const commitMsg = ghTarget.commit_template
      .replace('{AGENT_ID}', safeName)
      .replace('{DATE}',     date);

    report.repoTarget   = ghTarget.repo_name;
    report.branchTarget = branch;

    // ── Step 1: Validate live config ──────────────────────────────────────
    log('Running live config validation...');
    const cv = runConfigValidation();
    if (!cv.passed) {
      throw new Error(`Live config validation failed:\n${cv.output.slice(0, 500)}`);
    }
    log(`Config validation: PASSED (${cv.checkCount} checks)`);

    // ── Step 2: Collect files ─────────────────────────────────────────────
    log(`Collecting files for agent "${platformId}" (path_key: ${path_key})...`);
    const { files, missing } = collectAgentFiles(platformId, path_key, manifest, BASE_DIR);

    report.fileCount = files.length;
    if (missing.length > 0) {
      throw new Error(`Required agent files missing: ${missing.join(', ')}`);
    }
    log(`Collected ${files.length} files`);

    // ── Dry-run: report and exit ──────────────────────────────────────────
    if (dryRun) {
      log('── DRY RUN ─────────────────────────────────────');
      log(`Agent: ${display_name} (${functional_id})`);
      log(`Would export to: ${ghTarget.repo_name} @ ${branch}`);
      files.forEach(f => log(`  + ${f.relPath}`));
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
    fs.mkdirSync(tempDir, { recursive: true });

    // ── Step 4: Sanitize + copy ───────────────────────────────────────────
    log('Sanitizing files...');
    const san = sanitizeExport(files, tempDir, rules, false);
    if (!san.ok) {
      throw new Error(
        `ABORT: Secret detected — ${san.aborted.reason}\n` +
        `File: ${san.aborted.file}`
      );
    }
    report.redactionCount = san.redacted.reduce((s, r) => s + r.redactions, 0);

    // ── Step 5: Write agent_manifest.json ─────────────────────────────────
    const agentManifest = {
      exported_at:    new Date().toISOString(),
      functional_id,
      platform_id:    platformId,
      display_name,
      path_key,
      source:         'odin-core',
      file_count:     files.length,
      files:          files.map(f => f.relPath),
    };
    fs.writeFileSync(
      path.join(tempDir, 'agent_manifest.json'),
      JSON.stringify(agentManifest, null, 2),
      'utf8'
    );

    // ── Step 6: Generate .env.example ─────────────────────────────────────
    writeEnvExample(tempDir);

    // ── Step 7: Validate export ───────────────────────────────────────────
    log('Validating agent export...');
    const val = validateExport(tempDir, manifest, rules, true);  // skipConfig=true
    report.validationPassed = val.passed;
    if (!val.passed) {
      const failures = val.checks
        .filter(c => !c.passed)
        .map(c => `  [${c.name}] ${c.detail}`)
        .join('\n');
      throw new Error(`Agent export validation failed:\n${failures}`);
    }
    log('Export validation: PASSED');

    // ── Step 8: Push ──────────────────────────────────────────────────────
    if (noPush) {
      log('--no-push flag — skipping push');
      report.pushResult = 'skipped_by_flag';
    } else {
      log(`Pushing to ${ghTarget.repo_name} @ ${branch} ...`);
      const push = pushToGitHub(tempDir, ghTarget, branch, commitMsg, false);
      report.commitHash = push.commitHash;
      report.pushResult = push.ok ? 'success' : `failed: ${push.stderr.slice(0, 200)}`;
      if (!push.ok) throw new Error(`GitHub push failed: ${push.stderr}`);
      log(`Push successful — commit: ${push.commitHash}`);
    }

    report.success = true;

  } catch (err) {
    report.failureReason = err.message;
    report.success       = false;
    log(`EXPORT FAILED: ${err.message}`);
  } finally {
    if (!dryRun && tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }

  const reportPath = writeReport(report);
  log(`Report: ${reportPath}`);
  log('\n' + formatReportForDiscord(report));

  return report;
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

if (require.main === module) {
  const args        = process.argv.slice(2);
  const dryRun      = args.includes('--dry-run');
  const noPush      = args.includes('--no-push');
  const nonFlags    = args.filter(a => !a.startsWith('--'));
  const agentInput  = nonFlags[0];

  if (!agentInput) {
    console.error('Usage: export_agent.js <functional_id> [--dry-run] [--no-push]');
    console.error('       functional_id examples: documentation_agent, reasoning_engine, monitor_agent');
    process.exit(1);
  }

  run(agentInput, { dryRun, noPush }).then(report => {
    process.exit(report.success ? 0 : 1);
  }).catch(err => {
    console.error(`Unhandled error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { run, resolveAgent };
