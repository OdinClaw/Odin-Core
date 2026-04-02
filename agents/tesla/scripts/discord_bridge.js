#!/usr/bin/env node
'use strict';

const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const GENERATOR = path.join(HOME, '.openclaw-odin', 'tesla_v4', 'generate_template.js');
const AGENT_EXPORT_PATTERN = /^tesla\s+export\s+agent\s+([a-z0-9_-]+)\s*$/i;

function buildSuccessMessage(agentId, templateRoot) {
  return [
    `Tesla V4 agent export complete for ${agentId}.`,
    `Output path: ${templateRoot}`,
  ].join('\n');
}

function runAgentExport(agentId) {
  const stdout = execFileSync('node', [GENERATOR, '--agent', agentId], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch (_) {
    parsed = null;
  }

  const templateRoot = parsed && parsed.templateRoot
    ? parsed.templateRoot
    : path.join(HOME, '.openclaw-odin', `tesla_template_agent_${agentId}`);

  return buildSuccessMessage(agentId, templateRoot);
}

function handleCommand(input) {
  const message = String(input || '').trim();
  const match = message.match(AGENT_EXPORT_PATTERN);
  if (!match) {
    throw new Error('Unsupported Tesla command.');
  }

  const agentId = match[1].toLowerCase();
  return runAgentExport(agentId);
}

function main() {
  const input = process.argv.slice(2).join(' ').trim();
  if (!input) {
    console.error('Usage: node discord_bridge.js "tesla export agent <id>"');
    process.exit(1);
  }

  try {
    const output = handleCommand(input);
    process.stdout.write(`${output}\n`);
  } catch (error) {
    const reason = error && error.message ? error.message : String(error);
    process.stderr.write(`Tesla command failed: ${reason}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  handleCommand,
  runAgentExport,
};
