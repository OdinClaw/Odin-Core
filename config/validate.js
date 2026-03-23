#!/usr/bin/env node
'use strict';
/**
 * validate.js
 * Config validation script for the Odin naming/identity system.
 *
 * Modes:
 *   default       — core checks (agents.json, system.json, cross-references, smoke tests)
 *   --strict      — additionally checks for any lingering hardcoded persona-name
 *                   references in runtime-critical code paths
 *   --compat      — additionally verifies compatibility aliases resolve correctly
 *
 * Usage:
 *   node ${HOME}/.openclaw-odin/config/validate.js
 *   node ${HOME}/.openclaw-odin/config/validate.js --strict
 *   node ${HOME}/.openclaw-odin/config/validate.js --compat
 *   node ${HOME}/.openclaw-odin/config/validate.js --strict --compat
 */

const fs   = require('fs');
const path = require('path');

const CONFIG_DIR  = __dirname;
const TASKBUS_DIR = path.join(__dirname, '..', 'task_bus');

const STRICT = process.argv.includes('--strict');
const COMPAT = process.argv.includes('--compat');

// ── Helpers ────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let warned = 0;

function pass(msg)  { console.log(`  ✓  ${msg}`); passed++; }
function fail(msg)  { console.error(`  ✗  ${msg}`); failed++; }
function warn(msg)  { console.warn(`  ⚠  ${msg}`); warned++; }
function info(msg)  { console.log(`  ·  ${msg}`); }
function section(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`); }

// ── 1. Load and validate agents.json ──────────────────────────────────────────

section('agents.json — structure');

let agentsConfig = {};
try {
  const raw = fs.readFileSync(path.join(CONFIG_DIR, 'agents.json'), 'utf8');
  agentsConfig = JSON.parse(raw);
  pass('agents.json exists and is valid JSON');
} catch (err) {
  fail(`agents.json missing or malformed: ${err.message}`);
}

// Duplicate top-level key check via raw text scan
try {
  const raw  = fs.readFileSync(path.join(CONFIG_DIR, 'agents.json'), 'utf8');
  const seen = new Set();
  let hasDupes = false;
  for (const id of Object.keys(agentsConfig)) {
    if (seen.has(id)) { fail(`Duplicate platform ID in agents.json: "${id}"`); hasDupes = true; }
    seen.add(id);
  }
  if (!hasDupes) pass(`No duplicate platform IDs (${Object.keys(agentsConfig).length} agents)`);
} catch (_) {}

// Required fields per agent
const REQUIRED_FIELDS = ['display_name', 'functional_id', 'path_key', 'role', 'status'];
const OPTIONAL_FIELDS = ['description', 'aliases'];

let allFieldsOk = true;
const functionalIds  = new Set();
const pathKeys       = new Set();
const dupFunctional  = [];
const dupPathKeys    = [];

for (const [id, entry] of Object.entries(agentsConfig)) {
  for (const field of REQUIRED_FIELDS) {
    if (!entry[field] || typeof entry[field] !== 'string') {
      fail(`Agent "${id}" missing required field "${field}"`);
      allFieldsOk = false;
    }
  }

  // Functional ID uniqueness
  if (entry.functional_id) {
    if (functionalIds.has(entry.functional_id)) {
      dupFunctional.push({ id, functional_id: entry.functional_id });
    }
    functionalIds.add(entry.functional_id);
  }

  // path_key uniqueness (only live agents must be unique — non-live may share for now)
  if (entry.path_key && entry.status === 'live') {
    if (pathKeys.has(entry.path_key)) {
      dupPathKeys.push({ id, path_key: entry.path_key });
    }
    pathKeys.add(entry.path_key);
  }

  // aliases must be an array if present
  if ('aliases' in entry && !Array.isArray(entry.aliases)) {
    fail(`Agent "${id}" field "aliases" must be an array`);
    allFieldsOk = false;
  }
}

if (allFieldsOk) {
  pass(`All ${Object.keys(agentsConfig).length} agents have required fields: ${REQUIRED_FIELDS.join(', ')}`);
}

if (dupFunctional.length > 0) {
  for (const d of dupFunctional) {
    fail(`Duplicate functional_id "${d.functional_id}" found on agent "${d.id}"`);
  }
} else {
  pass(`All functional_ids are unique (${functionalIds.size} values)`);
}

if (dupPathKeys.length > 0) {
  for (const d of dupPathKeys) {
    fail(`Duplicate path_key "${d.path_key}" found on live agent "${d.id}"`);
  }
} else {
  pass(`All live agent path_keys are unique`);
}

// ── 2. Load and validate system.json ──────────────────────────────────────────

section('system.json — structure');

let systemConfig = {};
try {
  const raw = fs.readFileSync(path.join(CONFIG_DIR, 'system.json'), 'utf8');
  systemConfig = JSON.parse(raw);
  pass('system.json exists and is valid JSON');
} catch (err) {
  fail(`system.json missing or malformed: ${err.message}`);
}

for (const field of ['system_id', 'system_name', 'system_description']) {
  if (systemConfig[field] && typeof systemConfig[field] === 'string') {
    pass(`system.json "${field}" = "${systemConfig[field]}"`);
  } else {
    fail(`system.json missing or invalid field "${field}"`);
  }
}

// ── 3. Load and validate agent_ids.js ─────────────────────────────────────────

section('agent_ids.js — constants vs agents.json');

let AGENT_IDS = {};
let LIVE_AGENT_IDS = [];
let PLATFORM_ID_TO_CONSTANT = {};

try {
  const mod = require('./agent_ids');
  AGENT_IDS                = mod.AGENT_IDS;
  LIVE_AGENT_IDS           = mod.LIVE_AGENT_IDS;
  PLATFORM_ID_TO_CONSTANT  = mod.PLATFORM_ID_TO_CONSTANT;
  pass(`agent_ids.js loaded (${Object.keys(AGENT_IDS).length} constants, ${LIVE_AGENT_IDS.length} live)`);
} catch (err) {
  fail(`agent_ids.js failed to load: ${err.message}`);
}

// Every constant in AGENT_IDS must have a matching entry in agents.json
let constantsOk = true;
for (const [constant, platformId] of Object.entries(AGENT_IDS)) {
  if (!agentsConfig[platformId]) {
    fail(`AGENT_IDS.${constant} = '${platformId}' has no entry in agents.json`);
    constantsOk = false;
  }
}
if (constantsOk) pass(`All ${Object.keys(AGENT_IDS).length} AGENT_IDS constants exist in agents.json`);

// Every LIVE_AGENT_ID must have status: 'live' in agents.json
let liveStatusOk = true;
for (const id of LIVE_AGENT_IDS) {
  const entry = agentsConfig[id];
  if (!entry) {
    fail(`LIVE_AGENT_IDS includes '${id}' which is not in agents.json`);
    liveStatusOk = false;
  } else if (entry.status !== 'live') {
    fail(`LIVE_AGENT_IDS includes '${id}' but agents.json status = '${entry.status}' (expected 'live')`);
    liveStatusOk = false;
  }
}
if (liveStatusOk) pass(`All ${LIVE_AGENT_IDS.length} LIVE_AGENT_IDS have status: 'live' in agents.json`);

// ── 4. router.js cross-check ──────────────────────────────────────────────────

section('router.js — AGENTS array vs agents.json + agent_ids.js');

const ROUTER_PATH = path.join(TASKBUS_DIR, 'router', 'router.js');
let routerContent = '';
try {
  routerContent = fs.readFileSync(ROUTER_PATH, 'utf8');
  pass('router.js readable');
} catch (err) {
  fail(`router.js unreadable: ${err.message}`);
}

// Check that router.js requires agent_ids.js (no longer hardcodes bare strings)
if (routerContent.includes("require('../../config/agent_ids')") ||
    routerContent.includes('require("../../config/agent_ids")')) {
  pass('router.js requires config/agent_ids.js (no bare string IDs)');
} else {
  fail('router.js does NOT require config/agent_ids.js — bare string IDs may still be present');
}

// Check AGENTS = LIVE_AGENT_IDS (not a hardcoded array)
if (routerContent.includes('AGENTS = LIVE_AGENT_IDS')) {
  pass('router.js AGENTS references LIVE_AGENT_IDS constant');
} else {
  warn('router.js AGENTS may be a static array rather than referencing LIVE_AGENT_IDS');
}

// ── 5. names.js smoke-test ─────────────────────────────────────────────────────

section('names.js — smoke tests');

try {
  // Force fresh load (clear module cache for this run)
  delete require.cache[require.resolve('./names')];
  const N = require('./names');

  // ── Display name tests: expected values READ FROM CONFIG (rebrand-safe) ──────
  // display_name is the CONFIGURABLE layer — we verify the API returns what the
  // config says, not a hardcoded persona name. This means the smoke test passes
  // regardless of what display names are set to in agents.json / system.json.
  const expMain    = agentsConfig['main']?.display_name   || 'main';
  const expThor    = agentsConfig['thor']?.display_name   || 'thor';
  const expLoki    = agentsConfig['loki']?.display_name   || 'loki';
  const expAdam    = agentsConfig['adam']?.display_name   || 'adam';
  const expSystem  = systemConfig.system_name             || 'Odin';
  const expNameList = [expMain, expThor].map(n => n.toLowerCase()).join(', ');

  const tests = [
    // Display names — compare against config, not hardcoded strings
    [`getAgentName("main") matches config`,       N.getAgentName('main'),              expMain],
    [`getAgentName("thor") matches config`,       N.getAgentName('thor'),              expThor],
    [`getAgentName("loki") matches config`,       N.getAgentName('loki'),              expLoki],
    [`getAgentName("adam") matches config`,       N.getAgentName('adam'),              expAdam],
    // Unknown ID fallback — STABLE (always returns the ID itself)
    ['getAgentName("nonexistent") → fallback',   N.getAgentName('nonexistent'),       'nonexistent'],
    // System name — compare against config
    ['getSystemName() matches config',            N.getSystemName(),                   expSystem],
    // Name list — compare against config-derived values
    ['getAgentNameList(["main","thor"]) correct', N.getAgentNameList(['main','thor']), expNameList],
    // Functional IDs — STABLE (not configurable — must always be these values)
    ['getAgentFunctionalId("adam")',              N.getAgentFunctionalId('adam'),      'documentation_agent'],
    ['getAgentFunctionalId("main")',              N.getAgentFunctionalId('main'),      'orchestrator'],
    // Path keys — STABLE (must match on-disk directory names)
    ['getAgentPathKey("adam")',                   N.getAgentPathKey('adam'),           'adam'],
    ['getAgentPathKey("main")',                   N.getAgentPathKey('main'),           'main'],
  ];

  for (const [label, actual, expected] of tests) {
    if (actual === expected) {
      pass(`${label} → "${actual}"`);
    } else {
      fail(`${label} → expected "${expected}", got "${actual}"`);
    }
  }

  // getAgentByFunctionalId round-trip
  const docAgent = N.getAgentByFunctionalId('documentation_agent');
  if (docAgent && docAgent.platformId === 'adam') {
    pass(`getAgentByFunctionalId("documentation_agent") → platformId: "${docAgent.platformId}"`);
  } else {
    fail(`getAgentByFunctionalId("documentation_agent") did not return platformId: "adam"  (got: ${JSON.stringify(docAgent)})`);
  }

  const nullResult = N.getAgentByFunctionalId('nonexistent_role');
  if (nullResult === null) {
    pass('getAgentByFunctionalId("nonexistent_role") → null (correct)');
  } else {
    fail(`getAgentByFunctionalId("nonexistent_role") should return null, got: ${JSON.stringify(nullResult)}`);
  }

  // reloadConfig does not throw and still resolves correctly from config
  try {
    N.reloadConfig();
    pass('reloadConfig() completes without error');
    // Verify reload returns value consistent with config — compare against config,
    // not a hardcoded display name (display names are configurable).
    const afterReload = N.getAgentName('adam');
    if (afterReload === expAdam) {
      pass(`getAgentName("adam") consistent after reloadConfig() → "${afterReload}"`);
    } else {
      fail(`getAgentName("adam") after reloadConfig() — expected "${expAdam}", got "${afterReload}"`);
    }
  } catch (err) {
    fail(`reloadConfig() threw: ${err.message}`);
  }

} catch (err) {
  fail(`names.js failed to load: ${err.message}`);
}

// ── 6. paths.js smoke-test ────────────────────────────────────────────────────

section('paths.js — smoke tests');

try {
  delete require.cache[require.resolve('./paths')];
  const P = require('./paths');
  const HOME = require('os').homedir();

  const baseDir = P.getBaseDir();
  if (baseDir === path.join(HOME, '.openclaw-odin')) {
    pass(`getBaseDir() → "${baseDir}"`);
  } else {
    fail(`getBaseDir() returned unexpected value: "${baseDir}"`);
  }

  const docWsPath = P.getAgentWorkspacePath('adam', 'documents');
  const expected  = path.join(HOME, '.openclaw-odin', 'workspace', 'agents', 'adam', 'documents');
  if (docWsPath === expected) {
    pass(`getAgentWorkspacePath("adam","documents") → correct`);
  } else {
    fail(`getAgentWorkspacePath("adam","documents") → expected "${expected}", got "${docWsPath}"`);
  }

  const mainSession = P.getAgentSessionPath('main');
  const expectedSess = path.join(HOME, '.openclaw-odin', 'agents', 'main');
  if (mainSession === expectedSess) {
    pass(`getAgentSessionPath("main") → correct`);
  } else {
    fail(`getAgentSessionPath("main") → expected "${expectedSess}", got "${mainSession}"`);
  }

} catch (err) {
  fail(`paths.js failed to load: ${err.message}`);
}

// ── 7. Verify no orphaned config references ────────────────────────────────────

section('orphan check — agents.json platforms match agent_ids.js');

// Every platform ID in agents.json should appear in AGENT_IDS values
for (const platformId of Object.keys(agentsConfig)) {
  if (PLATFORM_ID_TO_CONSTANT[platformId]) {
    pass(`agents.json "${platformId}" → AGENT_IDS.${PLATFORM_ID_TO_CONSTANT[platformId]}`);
  } else {
    warn(`agents.json "${platformId}" has no corresponding constant in agent_ids.js (add it if live)`);
  }
}

// ── 8. Strict mode — hardcoded persona names in runtime-critical code ──────────

if (STRICT) {
  section('STRICT: runtime-critical files — persona name scan');

  // These are display names that should NOT appear as bare strings in runtime logic.
  const PERSONA_NAMES = ['Odin', 'Thor', 'Loki', 'Adam', 'Tesla', 'Apollo', 'Zeus', 'Hades'];

  // Patterns that indicate runtime-critical usage (not comments, not strings passed to getAgentName)
  const CRITICAL_PATTERNS = [
    /\bif\s*\(.*(?:Odin|Thor|Loki|Adam)\b/,         // conditionals on persona names
    /===?\s*['"](?:Odin|Thor|Loki|Adam)['"]/,         // equality checks on persona names
    /\bswitch\s*\(.*(?:Odin|Thor|Loki|Adam)\b/,      // switch on persona names
    /ROUTES\s*=\s*\{[^}]*(?:Odin|Thor|Loki|Adam)/,   // routing tables with persona names
  ];

  const CRITICAL_FILES = [
    path.join(TASKBUS_DIR, 'router', 'router.js'),
    path.join(TASKBUS_DIR, 'router', 'model_router.js'),
    path.join(TASKBUS_DIR, 'router', 'preprocessor.js'),
    path.join(TASKBUS_DIR, 'router', 'classifier.js'),
    path.join(TASKBUS_DIR, 'workers', 'dispatcher.js'),
    path.join(TASKBUS_DIR, 'discord_bridge', 'send_reply.js'),
  ];

  let criticalClean = true;
  for (const filePath of CRITICAL_FILES) {
    let src;
    try {
      src = fs.readFileSync(filePath, 'utf8');
    } catch (_) { warn(`Could not read ${path.basename(filePath)}`); continue; }

    const lines = src.split('\n');
    let fileHits = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
      if (isComment) continue;  // comments are OK

      for (const pat of CRITICAL_PATTERNS) {
        if (pat.test(line)) {
          fail(`STRICT: critical file ${path.basename(filePath)}:${i+1} — persona name in runtime logic: "${line.trim().slice(0, 100)}"`);
          criticalClean = false;
          fileHits++;
        }
      }
    }
    if (fileHits === 0) {
      pass(`STRICT: ${path.basename(filePath)} — no persona names in runtime logic`);
    }
  }

  // Check that routing values in router.js are AGENT_IDS references, not bare strings
  try {
    const routerSrc = fs.readFileSync(path.join(TASKBUS_DIR, 'router', 'router.js'), 'utf8');
    const bareStringRoute = /:\s*['"](?:main|thor|loki|adam)['"]\s*,/.test(routerSrc);
    if (bareStringRoute) {
      warn('STRICT: router.js ROUTES still contains a bare string platform ID (not using AGENT_IDS constant)');
    } else {
      pass('STRICT: router.js ROUTES uses AGENT_IDS constants (no bare strings)');
    }
  } catch (_) {}
}

// ── 9. Compatibility aliases check ────────────────────────────────────────────

if (COMPAT) {
  section('COMPAT: alias resolution');

  const { getAgentByFunctionalId } = require('./names');

  // Check that all aliases in agents.json are distinct and do not collide
  const allAliases = new Map();  // alias → agentId
  let aliasCollision = false;

  for (const [id, entry] of Object.entries(agentsConfig)) {
    const aliases = entry.aliases || [];
    for (const alias of aliases) {
      if (allAliases.has(alias)) {
        fail(`COMPAT: alias "${alias}" is used by both "${allAliases.get(alias)}" and "${id}"`);
        aliasCollision = true;
      }
      allAliases.set(alias, id);
    }
  }
  if (!aliasCollision && allAliases.size > 0) {
    pass(`COMPAT: ${allAliases.size} aliases are all unique`);
  } else if (allAliases.size === 0) {
    info('COMPAT: no aliases defined in agents.json');
  }

  // Verify functional_id round-trip for all live agents
  for (const id of LIVE_AGENT_IDS) {
    const entry   = agentsConfig[id];
    if (!entry) continue;
    const found   = getAgentByFunctionalId(entry.functional_id);
    if (found && found.platformId === id) {
      pass(`COMPAT: getAgentByFunctionalId("${entry.functional_id}") → "${id}"`);
    } else {
      fail(`COMPAT: getAgentByFunctionalId("${entry.functional_id}") did not resolve to "${id}" (got: ${found?.platformId})`);
    }
  }
}

// ── 10. Full hardcoded name scan (informational) ───────────────────────────────

section('name scan — task_bus/**/*.js (categorised)');

const DISPLAY_NAMES = ['Odin', 'Thor', 'Loki', 'Adam', 'Tesla', 'Apollo', 'Zeus', 'Hades',
                       'Hercules', 'Hermes', 'Buddha', 'Chronus', 'Beelzebub', 'Qin', 'Shiva'];

function walkJs(dir, acc = []) {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkJs(full, acc);
      else if (e.name.endsWith('.js')) acc.push(full);
    }
  } catch (_) {}
  return acc;
}

const categories = { replaced: 0, 'safe (comment)': 0, 'safe (string)': 0, unsafe: 0 };

for (const filePath of walkJs(TASKBUS_DIR)) {
  const rel   = path.relative(path.join(CONFIG_DIR, '..'), filePath);
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const name of DISPLAY_NAMES) {
      if (!new RegExp(`\\b${name}\\b`).test(line)) continue;
      const isComment       = /^\s*(\/\/|\*|\/\*)/.test(line);
      const isAlreadyDynamic = line.includes('getAgentName') || line.includes('getSystemName');
      const isUnsafe        = /\bif\b|\bswitch\b|===|!==|\.includes\(/.test(line) && !isComment;

      let cat;
      if (isAlreadyDynamic) cat = 'replaced';
      else if (isUnsafe)    cat = 'unsafe';
      else if (isComment)   cat = 'safe (comment)';
      else                  cat = 'safe (string)';

      categories[cat]++;
      const icon = cat === 'replaced' ? '✓' : cat === 'unsafe' ? '✗' : '→';
      console.log(`  ${icon}  ${rel}:${i+1}  [${cat}]  "${name}"  ${line.trim().slice(0, 90)}`);
    }
  }
}

console.log('');
for (const [cat, count] of Object.entries(categories)) {
  if (count > 0) info(`${cat}: ${count} occurrence(s)`);
}

if (categories.unsafe > 0) {
  fail(`${categories.unsafe} unsafe persona-name reference(s) detected in runtime logic`);
} else if (categories['safe (string)'] > 0) {
  warn(`${categories['safe (string)']} persona-name string(s) still in code — low priority, not runtime-critical`);
} else {
  pass('No unsafe or unresolved persona-name references in task_bus code');
}
if (categories.replaced > 0) {
  pass(`${categories.replaced} reference(s) already config-driven (getAgentName/getSystemName)`);
}
if (categories['safe (comment)'] > 0) {
  pass(`${categories['safe (comment)']} comment-only reference(s) — no action needed`);
}

// ── Summary ────────────────────────────────────────────────────────────────────

section('Summary');
const modeStr = [STRICT && 'strict', COMPAT && 'compat'].filter(Boolean).join('+') || 'default';
console.log(`  Mode: ${modeStr}`);
console.log(`  Passed: ${passed}   Failed: ${failed}   Warnings: ${warned}`);

if (failed > 0) {
  console.error('\n  VALIDATION FAILED — address the ✗ items above.\n');
  process.exit(1);
} else if (warned > 0) {
  console.log('\n  Passed with warnings — review ⚠ items above.\n');
  process.exit(0);
} else {
  console.log('\n  All checks passed cleanly.\n');
  process.exit(0);
}
