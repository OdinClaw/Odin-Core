#!/usr/bin/env node

/**
 * validate_export.js
 * Validates OpenClaw config, agent structure, and detects secrets
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOME = process.env.HOME || process.env.USERPROFILE;
const ODIN_ROOT = path.join(HOME, '.openclaw-odin');
const WORKSPACE = path.join(ODIN_ROOT, 'workspace');
const ODIN_CONFIG = path.join(WORKSPACE, 'agents', 'odin', 'config');

// Secret patterns to detect
const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)[:\s=]+['\"]?([a-zA-Z0-9\-_]{20,})['\"]?/gi,
  /(?:token|auth|secret)[:\s=]+['\"]?([a-zA-Z0-9\-_]{20,})['\"]?/gi,
  /(?:password|passwd)[:\s=]+['\"]?([^\s'\"]+)['\"]?/gi,
  /Bearer\s+([a-zA-Z0-9\-_.~+\/]+=*)/gi,
  /mongodb:\/\/[^\s]+@/gi,
  /postgres:\/\/[^\s]+@/gi,
  /ssh-rsa\s+[A-Za-z0-9+\/]+/gi,
];

function detectSecrets(filePath, content) {
  const secrets = [];
  
  for (const pattern of SECRET_PATTERNS) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      secrets.push({
        file: filePath,
        pattern: pattern.source,
        line: content.substring(0, match.index).split('\n').length,
      });
    }
  }
  
  return secrets;
}

function validateConfig() {
  const results = {
    valid: true,
    warnings: [],
    errors: [],
    secretsFound: [],
  };

  // Check for openclaw.json (at root or workspace)
  const openclaw = fs.existsSync(path.join(ODIN_ROOT, 'openclaw.json'))
    ? path.join(ODIN_ROOT, 'openclaw.json')
    : path.join(WORKSPACE, 'openclaw.json');
  
  if (!fs.existsSync(openclaw)) {
    results.errors.push('openclaw.json not found at root or workspace');
    results.valid = false;
    return results;
  }

  try {
    const config = JSON.parse(fs.readFileSync(openclaw, 'utf8'));
    
    // Validate minimal structure
    if (!config.gateway || !config.gateway.bind) {
      results.warnings.push('gateway.bind not configured');
    }

    // Scan config file for secrets
    const configContent = fs.readFileSync(openclaw, 'utf8');
    const secrets = detectSecrets('openclaw.json', configContent);
    if (secrets.length > 0) {
      results.secretsFound.push(...secrets);
      results.valid = false;
    }

  } catch (e) {
    results.errors.push(`Failed to parse openclaw.json: ${e.message}`);
    results.valid = false;
  }

  // Check agent directories
  const agentsDir = path.join(WORKSPACE, 'agents');
  if (fs.existsSync(agentsDir)) {
    const agents = fs.readdirSync(agentsDir);
    results.agentCount = agents.length;
  }

  return results;
}

function main() {
  const results = validateConfig();
  
  if (results.secretsFound.length > 0) {
    console.error('⚠️  SECRETS DETECTED — Export aborted');
    console.error(`Found ${results.secretsFound.length} secret(s) in source files`);
    process.exit(1);
  }

  if (!results.valid) {
    console.error('❌ Validation failed');
    results.errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log('✓ Config valid');
  console.log(`✓ ${results.agentCount || 0} agent(s) found`);
  results.warnings.forEach(w => console.log(`⚠ ${w}`));
}

main();
