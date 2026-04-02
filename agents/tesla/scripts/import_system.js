#!/usr/bin/env node

/**
 * import_system.js
 * Full system import from GitHub snapshot
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || process.env.USERPROFILE;
const ODIN_ROOT = path.join(HOME, '.openclaw-odin');
const WORKSPACE = path.join(ODIN_ROOT, 'workspace');
const TESLA_DIR = path.join(WORKSPACE, 'agents', 'tesla');
const LOGS_DIR = path.join(TESLA_DIR, 'logs');

const DRY_RUN = process.argv.includes('--dry-run');
const BRANCH = process.argv.find((arg, i) => process.argv[i-1] === '--branch');

function main() {
  const report = {
    timestamp: new Date().toISOString(),
    action: 'import-system',
    dryRun: DRY_RUN,
    branch: BRANCH || 'main',
    status: 'success',
    imported: 0,
    skipped: 0,
    backed_up: 0,
    collisions: 0,
    failureReason: null,
  };

  try {
    // For dry-run, just report what would happen
    if (DRY_RUN) {
      report.status = 'dry-run-complete';
      report.message = 'Would import full system from GitHub snapshot branch: ' + (BRANCH || 'main');
      report.readiness = 'NEEDS_MANUAL_SETUP';
      report.manual_setup_required = [
        'Set openclaw.json (root config)',
        'Set auth-profiles.json (credentials)',
        'Configure gateway.bind',
        'Verify all agent directories',
      ];
    } else {
      // Real import would happen here
      report.status = 'not-implemented';
      report.failureReason = 'Full import not yet implemented; use dry-run to preview';
    }

  } catch (e) {
    report.status = 'failed';
    report.failureReason = e.message;
  }

  // Write report
  const reportPath = path.join(LOGS_DIR, `tesla-import-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(LOGS_DIR, 'latest.json'), JSON.stringify(report, null, 2));

  console.log(`\n✓ Import report: ${reportPath}`);
  console.log(`Status: ${report.status}`);
  
  if (report.readiness) {
    console.log(`Readiness: ${report.readiness}`);
  }
  
  if (report.manual_setup_required && report.manual_setup_required.length > 0) {
    console.log('\nManual setup required:');
    report.manual_setup_required.forEach(item => console.log(`  - ${item}`));
  }
}

main();
