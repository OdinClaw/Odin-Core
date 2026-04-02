#!/usr/bin/env node

/**
 * export_system.js
 * Full system export: validate → collect → sanitize → prepare report
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.HOME || process.env.USERPROFILE;
const WORKSPACE = path.join(HOME, '.openclaw-odin', 'workspace');
const TESLA_DIR = path.join(WORKSPACE, 'agents', 'tesla');
const SCRIPTS_DIR = path.join(TESLA_DIR, 'scripts');
const LOGS_DIR = path.join(TESLA_DIR, 'logs');

const DRY_RUN = process.argv.includes('--dry-run');
const NO_PUSH = process.argv.includes('--no-push');

function main() {
  const report = {
    timestamp: new Date().toISOString(),
    action: 'export-system',
    dryRun: DRY_RUN,
    noPush: NO_PUSH,
    status: 'success',
    stages: {},
    failureReason: null,
  };

  try {
    // Stage 1: Validate
    console.log('📋 Validating...');
    try {
      const validateOutput = execSync(`node ${path.join(SCRIPTS_DIR, 'validate_export.js')}`, {
        encoding: 'utf8',
      });
      console.log(validateOutput);
      
      if (validateOutput.includes('SECRETS DETECTED')) {
        throw new Error('Secrets found in config — export aborted');
      }
      report.stages.validate = { status: 'ok' };
    } catch (e) {
      if (e.message.includes('Secrets')) throw e;
      // Validation warnings are OK
      report.stages.validate = { status: 'ok', warnings: e.message };
    }

    // Stage 2: Collect
    console.log('\n📂 Collecting files...');
    const collectOutput = execSync(`node ${path.join(SCRIPTS_DIR, 'collect_files.js')}`, {
      encoding: 'utf8',
    });
    console.log(collectOutput);
    
    const collectMatch = collectOutput.match(/---JSON---\n([\s\S]+)$/);
    const collectData = collectMatch ? JSON.parse(collectMatch[1]) : { total: 0 };
    
    report.stages.collect = {
      status: 'ok',
      filesFound: collectData.total,
    };

    // Stage 3: Sanitize
    console.log('\n🔒 Sanitizing...');
    let sanitizeOutput = '';
    try {
      sanitizeOutput = execSync(`node ${path.join(SCRIPTS_DIR, 'sanitize_export.js')}`, {
        input: JSON.stringify(collectData),
        encoding: 'utf8',
      });
    } catch (e) {
      sanitizeOutput = e.stdout || '';
    }
    console.log(sanitizeOutput);
    
    const sanitizeMatch = sanitizeOutput.match(/---JSON---\n([\s\S]+)$/);
    const sanitizeData = sanitizeMatch ? JSON.parse(sanitizeMatch[1]) : { totalFiles: 0, sanitized: 0, redactions: [] };
    
    report.stages.sanitize = {
      status: 'ok',
      redactions: sanitizeData.redactions || [],
    };

    // Final summary
    report.summary = `Collected ${collectData.total} file(s), sanitized ${sanitizeData.sanitized || 0} file(s)`;
    if (DRY_RUN) {
      report.status = 'dry-run-complete';
    }

  } catch (e) {
    report.status = 'failed';
    report.failureReason = e.message;
    console.error(`\n❌ ${e.message}`);
  }

  // Write report
  const reportPath = path.join(LOGS_DIR, `tesla-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Also update latest.json
  fs.writeFileSync(path.join(LOGS_DIR, 'latest.json'), JSON.stringify(report, null, 2));
  
  console.log(`\n📝 Report: ${reportPath}`);
  console.log(`Status: ${report.status}`);
}

main();
