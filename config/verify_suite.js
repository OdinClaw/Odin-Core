#!/usr/bin/env node
'use strict';
/**
 * verify_suite.js
 * POST-REFACTOR VERIFICATION SUITE — Phase 1 + Phase 2 naming/config refactor.
 *
 * Tests:
 *   T1  System name rebrand is fully config-driven
 *   T2  Single agent display name rebrand (documentation_agent)
 *   T3  Full live-agent rebrand (all 4 agents simultaneously)
 *   T4  Filesystem paths do NOT depend on display names
 *   T5  Routing logic does NOT depend on persona names
 *   T6  Functional ID round-trip survives display name change
 *   T7  Config hot-reload (reloadConfig) picks up changes without restart
 *   T8  Validation suite (--strict --compat) passes under full rebrand
 *
 * Safety contract:
 *   - Backups created BEFORE any test runs
 *   - Restore runs in finally block — guaranteed even on exception
 *   - Each test restores config before the next test modifies it
 */

const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const { execFileSync } = require('child_process');

const CONFIG_DIR  = path.join(os.homedir(), '.openclaw-odin', 'config');
const TASKBUS_DIR = path.join(os.homedir(), '.openclaw-odin', 'task_bus');

const SYSTEM_JSON = path.join(CONFIG_DIR, 'system.json');
const AGENTS_JSON = path.join(CONFIG_DIR, 'agents.json');
const SYSTEM_BAK  = path.join(CONFIG_DIR, 'system.backup.json');
const AGENTS_BAK  = path.join(CONFIG_DIR, 'agents.backup.json');

// ── Result tracking ────────────────────────────────────────────────────────────

const results = [];
let testsRun   = 0;
let testsPassed = 0;
let testsFailed = 0;

function record(name, passed, observations = [], issues = []) {
  results.push({ name, passed, observations, issues });
  testsRun++;
  if (passed) testsPassed++; else testsFailed++;
  const badge = passed ? '\x1b[32m✓ PASS\x1b[0m' : '\x1b[31m✗ FAIL\x1b[0m';
  console.log(`\n  [${badge}] ${name}`);
  for (const o of observations) console.log(`         ○  ${o}`);
  for (const i of issues)       console.error(`         ⚠  ${i}`);
}

function assert(condition, label) {
  if (!condition) throw new Error(`Assertion failed: ${label}`);
}

// ── Config helpers ─────────────────────────────────────────────────────────────

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJSON(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }

function restoreFromBackup() {
  fs.copyFileSync(SYSTEM_BAK, SYSTEM_JSON);
  fs.copyFileSync(AGENTS_BAK, AGENTS_JSON);
}

/**
 * Clear the Node.js module cache for config modules so the next require()
 * reads fresh from disk.  Must be called after writing config files.
 */
function clearConfigCache() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes('/config/names') ||
      key.includes('/config/paths') ||
      key.includes('/config/agent_ids') ||
      key.includes('/router/router')
    ) {
      delete require.cache[key];
    }
  }
}

function freshNames() {
  clearConfigCache();
  return require(path.join(CONFIG_DIR, 'names.js'));
}

function freshPaths() {
  clearConfigCache();
  return require(path.join(CONFIG_DIR, 'paths.js'));
}

function freshRouter() {
  clearConfigCache();
  return require(path.join(TASKBUS_DIR, 'router', 'router.js'));
}

// ── Backup ─────────────────────────────────────────────────────────────────────

let backupOk = false;

function createBackups() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  BACKUP PHASE');
  console.log('══════════════════════════════════════════════════════════');
  try {
    fs.copyFileSync(SYSTEM_JSON, SYSTEM_BAK);
    fs.copyFileSync(AGENTS_JSON, AGENTS_BAK);
    // Verify copies are readable and valid JSON
    const s = readJSON(SYSTEM_BAK);
    const a = readJSON(AGENTS_BAK);
    assert(s.system_name,             'backup system.json has system_name');
    assert(Object.keys(a).length > 0, 'backup agents.json is non-empty');
    backupOk = true;
    console.log('\n  ✓ system.json  → system.backup.json');
    console.log(`  ✓ agents.json  → agents.backup.json (${Object.keys(a).length} agents backed up)`);
    console.log(`  ✓ Original system_name: "${s.system_name}"`);
    console.log(`  ✓ Original live agent display names: ${
      ['main','loki','thor','adam'].map(id => `${id}="${a[id].display_name}"`).join(', ')
    }`);
  } catch (err) {
    console.error(`\n  ✗ BACKUP FAILED: ${err.message}`);
    console.error('  Cannot proceed without backup. Aborting.');
    process.exit(1);
  }
}

// ── Restore ────────────────────────────────────────────────────────────────────

let restoreOk = false;

function performRestore() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  RESTORE PHASE');
  console.log('══════════════════════════════════════════════════════════');
  try {
    restoreFromBackup();
    clearConfigCache();

    // Verify exact match
    const origSys   = readJSON(SYSTEM_BAK);
    const restoredSys = readJSON(SYSTEM_JSON);
    const origAg    = readJSON(AGENTS_BAK);
    const restoredAg  = readJSON(AGENTS_JSON);

    const sysMatch = JSON.stringify(origSys) === JSON.stringify(restoredSys);
    const agMatch  = JSON.stringify(origAg)  === JSON.stringify(restoredAg);

    if (!sysMatch) throw new Error('system.json does not match backup after restore');
    if (!agMatch)  throw new Error('agents.json does not match backup after restore');

    // Verify no test values remain
    const N = freshNames();
    assert(N.getSystemName() === origSys.system_name,   'system_name restored');
    assert(N.getAgentName('adam') === origAg.adam.display_name, 'adam display_name restored');
    assert(N.getAgentName('main') === origAg.main.display_name, 'main display_name restored');

    restoreOk = true;
    console.log('\n  ✓ system.json restored and verified');
    console.log(`  ✓ system_name: "${N.getSystemName()}"`);
    console.log(`  ✓ agents.json restored and verified`);
    console.log(`  ✓ Live agent names: ${
      ['main','loki','thor','adam'].map(id => `${id}="${N.getAgentName(id)}"`).join(', ')
    }`);
  } catch (err) {
    restoreOk = false;
    console.error(`\n  ✗ RESTORE ERROR: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

function runTests() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  TEST SUITE  (8 tests)');
  console.log('══════════════════════════════════════════════════════════');

  // ── T1: System name rebrand is fully config-driven ────────────────────────
  {
    const T = 'T1: System name rebrand is config-driven';
    const obs = [], issues = [];
    let passed = true;
    try {
      const origSys = readJSON(SYSTEM_BAK);

      // Apply rebrand
      const rebranded = { ...origSys, system_name: 'Nexus_AI', system_id: 'nexus_core' };
      writeJSON(SYSTEM_JSON, rebranded);

      const N = freshNames();

      // Verify new system name is picked up
      const name = N.getSystemName();
      assert(name === 'Nexus_AI', `getSystemName() === "Nexus_AI" (got "${name}")`);
      obs.push(`getSystemName() → "${name}" ✓`);

      // Verify system config object reflects change
      const cfg = N.getSystemConfig();
      assert(cfg.system_name === 'Nexus_AI',   'getSystemConfig().system_name');
      assert(cfg.system_id   === 'nexus_core', 'getSystemConfig().system_id');
      obs.push(`getSystemConfig().system_id → "${cfg.system_id}" ✓`);

      // Verify original is NOT returned
      assert(name !== origSys.system_name, 'old name not returned after rebrand');
      obs.push(`Old name "${origSys.system_name}" is NOT returned ✓`);

      // Restore and verify rollback
      restoreFromBackup();
      const N2 = freshNames();
      assert(N2.getSystemName() === origSys.system_name, 'rollback restores original');
      obs.push(`Rollback to "${origSys.system_name}" ✓`);

    } catch (err) {
      passed = false;
      issues.push(err.message);
      restoreFromBackup();
    }
    record(T, passed, obs, issues);
  }

  // ── T2: Single agent display name rebrand (documentation_agent) ───────────
  {
    const T = 'T2: Single agent rebrand — documentation_agent (adam)';
    const obs = [], issues = [];
    let passed = true;
    try {
      const origAg = readJSON(AGENTS_BAK);
      const NEW_NAME = 'Penelope';

      // Apply single-agent rebrand
      const rebranded = { ...origAg, adam: { ...origAg.adam, display_name: NEW_NAME } };
      writeJSON(AGENTS_JSON, rebranded);

      const N = freshNames();

      // Target agent returns new name
      const name = N.getAgentName('adam');
      assert(name === NEW_NAME, `getAgentName("adam") === "${NEW_NAME}"`);
      obs.push(`getAgentName("adam") → "${name}" ✓`);

      // Name list uses new name (lowercase)
      const list = N.getAgentNameList(['main', 'thor', 'loki', 'adam']);
      assert(list.includes(NEW_NAME.toLowerCase()), `name list contains "${NEW_NAME.toLowerCase()}"`);
      assert(!list.includes(origAg.adam.display_name.toLowerCase()), 'old name NOT in list');
      obs.push(`getAgentNameList includes "${NEW_NAME.toLowerCase()}", excludes "adam" ✓`);

      // Other agents unchanged
      for (const id of ['main', 'loki', 'thor']) {
        const n = N.getAgentName(id);
        assert(n === origAg[id].display_name, `${id} unchanged: "${n}"`);
      }
      obs.push('Other live agents unchanged ✓');

      // functional_id unchanged by display_name change
      assert(N.getAgentFunctionalId('adam') === 'documentation_agent', 'functional_id unchanged');
      obs.push(`functional_id still "documentation_agent" ✓`);

      // path_key unchanged
      assert(N.getAgentPathKey('adam') === 'adam', 'path_key unchanged');
      obs.push(`path_key still "adam" ✓`);

      restoreFromBackup();
    } catch (err) {
      passed = false;
      issues.push(err.message);
      restoreFromBackup();
    }
    record(T, passed, obs, issues);
  }

  // ── T3: Full live-agent rebrand (all 4 simultaneously) ────────────────────
  {
    const T = 'T3: Full live-agent rebrand — all 4 agents simultaneously';
    const obs = [], issues = [];
    let passed = true;
    try {
      const origAg = readJSON(AGENTS_BAK);
      const REBRAND = {
        main: 'Athena',
        loki: 'Hermes',    // note: 'hermes' is also a workspace agent but different ID
        thor: 'Minerva',
        adam: 'Cassandra',
      };

      // Build rebranded agents config
      const rebranded = { ...origAg };
      for (const [id, newName] of Object.entries(REBRAND)) {
        rebranded[id] = { ...origAg[id], display_name: newName };
      }
      writeJSON(AGENTS_JSON, rebranded);

      const N = freshNames();

      // All 4 return new names
      for (const [id, newName] of Object.entries(REBRAND)) {
        const n = N.getAgentName(id);
        assert(n === newName, `getAgentName("${id}") === "${newName}"`);
        obs.push(`getAgentName("${id}") → "${n}" ✓`);
      }

      // All functional IDs are unchanged
      const funcMap = {
        main: 'orchestrator',
        loki: 'monitor_agent',
        thor: 'reasoning_engine',
        adam: 'documentation_agent',
      };
      for (const [id, fid] of Object.entries(funcMap)) {
        assert(N.getAgentFunctionalId(id) === fid, `${id} functional_id still "${fid}"`);
      }
      obs.push('All functional_ids unchanged ✓');

      // All path_keys unchanged
      for (const id of Object.keys(REBRAND)) {
        assert(N.getAgentPathKey(id) === id, `${id} path_key unchanged`);
      }
      obs.push('All path_keys unchanged ✓');

      // getAgentNameList reflects all new names
      const list = N.getAgentNameList(['main', 'thor', 'loki', 'adam']);
      for (const newName of Object.values(REBRAND)) {
        assert(list.includes(newName.toLowerCase()), `list contains "${newName.toLowerCase()}"`);
      }
      obs.push(`Name list → "${list}" ✓`);

      restoreFromBackup();
    } catch (err) {
      passed = false;
      issues.push(err.message);
      restoreFromBackup();
    }
    record(T, passed, obs, issues);
  }

  // ── T4: Filesystem paths do NOT depend on display names ───────────────────
  {
    const T = 'T4: Filesystem paths are independent of display names';
    const obs = [], issues = [];
    let passed = true;
    try {
      const origAg = readJSON(AGENTS_BAK);
      const HOME   = os.homedir();
      const NEW_DISPLAY = 'Persephone';

      // Change display name but NOT path_key
      const rebranded = {
        ...origAg,
        adam: { ...origAg.adam, display_name: NEW_DISPLAY },
      };
      writeJSON(AGENTS_JSON, rebranded);

      const P = freshPaths();

      // Path resolves from path_key ("adam"), not display_name ("Persephone")
      const wsPath = P.getAgentWorkspacePath('adam', 'documents');
      const expected = path.join(HOME, '.openclaw-odin', 'workspace', 'agents', 'adam', 'documents');

      assert(wsPath === expected, `workspace path matches expected`);
      assert(!wsPath.includes(NEW_DISPLAY),                'path does NOT contain new display name');
      assert(!wsPath.includes(NEW_DISPLAY.toLowerCase()),  'path does NOT contain lowercase display name');
      assert(wsPath.includes(`agents${path.sep}adam`),     'path contains stable path_key "adam"');
      obs.push(`getAgentWorkspacePath("adam","documents") → correct ✓`);
      obs.push(`Path: ${wsPath}`);
      obs.push(`"${NEW_DISPLAY}" NOT in path ✓`);
      obs.push(`Stable path_key "adam" preserved in path ✓`);

      // Session path also unaffected
      const sessPath = P.getAgentSessionPath('main');
      const expectedSess = path.join(HOME, '.openclaw-odin', 'agents', 'main');
      assert(sessPath === expectedSess, 'session path is correct');
      obs.push(`getAgentSessionPath("main") → correct ✓`);

      // Change path_key and verify path DOES change (proves path_key drives layout)
      const rebrandedWithNewKey = {
        ...origAg,
        adam: { ...origAg.adam, display_name: 'Persephone', path_key: 'adam_v2' },
      };
      writeJSON(AGENTS_JSON, rebrandedWithNewKey);
      const P2 = freshPaths();
      const newKeyPath = P2.getAgentWorkspacePath('adam', 'documents');
      assert(newKeyPath.includes('adam_v2'), 'path_key change DOES change path');
      assert(!newKeyPath.includes('/adam/'), 'old path_key no longer in path');
      obs.push(`path_key change correctly updates path → contains "adam_v2" ✓`);

      restoreFromBackup();
    } catch (err) {
      passed = false;
      issues.push(err.message);
      restoreFromBackup();
    }
    record(T, passed, obs, issues);
  }

  // ── T5: Routing logic does NOT depend on persona names ────────────────────
  {
    const T = 'T5: Routing logic does not depend on persona/display names';
    const obs = [], issues = [];
    let passed = true;
    try {
      const origAg = readJSON(AGENTS_BAK);

      // Apply radical display name changes — routing must be unaffected
      const rebranded = { ...origAg };
      rebranded.main = { ...origAg.main, display_name: 'ALPHA' };
      rebranded.thor = { ...origAg.thor, display_name: 'BETA' };
      rebranded.loki = { ...origAg.loki, display_name: 'GAMMA' };
      rebranded.adam = { ...origAg.adam, display_name: 'DELTA' };
      writeJSON(AGENTS_JSON, rebranded);

      const R = freshRouter();
      const { AGENT_IDS } = require(path.join(CONFIG_DIR, 'agent_ids.js'));

      // All task classes still route to correct platform IDs
      const routeExpected = {
        orchestration: AGENT_IDS.ORCHESTRATOR,        // 'main'
        reasoning:     AGENT_IDS.REASONING_ENGINE,    // 'thor'
        monitoring:    AGENT_IDS.MONITOR_AGENT,        // 'loki'
        documentation: AGENT_IDS.DOCUMENTATION_AGENT, // 'adam'
        system_event:  AGENT_IDS.DOCUMENTATION_AGENT, // 'adam'
      };
      for (const [cls, expectedId] of Object.entries(routeExpected)) {
        const got = R.route(cls);
        assert(got === expectedId, `route("${cls}") === "${expectedId}" (got "${got}")`);
        obs.push(`route("${cls}") → "${got}" ✓`);
      }

      // Fallback chains are correct
      const fbChain = R.routeWithFallbacks('reasoning');
      assert(fbChain[0] === 'thor', 'primary for reasoning is "thor"');
      assert(fbChain.includes('main'), 'fallback for reasoning includes "main"');
      obs.push(`routeWithFallbacks("reasoning") → [${fbChain.join(', ')}] ✓`);

      // Unknown task class defaults to orchestrator
      const unknown = R.route('completely_unknown_type');
      assert(unknown === AGENT_IDS.ORCHESTRATOR, `unknown class defaults to ORCHESTRATOR`);
      obs.push(`Unknown class defaults to ORCHESTRATOR ("${unknown}") ✓`);

      // AGENTS list is correct platform IDs, not display names
      const badNames = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'Odin', 'Thor', 'Loki', 'Adam'];
      for (const bad of badNames) {
        assert(!R.AGENTS.includes(bad), `AGENTS does not contain display name "${bad}"`);
      }
      obs.push(`AGENTS list contains only platform IDs [${R.AGENTS.join(', ')}] ✓`);

      restoreFromBackup();
    } catch (err) {
      passed = false;
      issues.push(err.message);
      restoreFromBackup();
    }
    record(T, passed, obs, issues);
  }

  // ── T6: Functional ID round-trip survives display name change ─────────────
  {
    const T = 'T6: Functional ID round-trip survives display name change';
    const obs = [], issues = [];
    let passed = true;
    try {
      const origAg = readJSON(AGENTS_BAK);

      // Change display names but preserve functional_id and role
      const rebranded = { ...origAg };
      rebranded.thor = { ...origAg.thor, display_name: 'Minerva' };
      rebranded.adam = { ...origAg.adam, display_name: 'Pythia'  };
      writeJSON(AGENTS_JSON, rebranded);

      const N = freshNames();

      // getAgentByFunctionalId resolves to correct platform ID
      const thorEntry = N.getAgentByFunctionalId('reasoning_engine');
      assert(thorEntry !== null,             'reasoning_engine found');
      assert(thorEntry.platformId === 'thor', 'platformId is "thor"');
      assert(thorEntry.display_name === 'Minerva', 'display_name reflects change');
      obs.push(`getAgentByFunctionalId("reasoning_engine") → platformId="thor", display_name="Minerva" ✓`);

      const adamEntry = N.getAgentByFunctionalId('documentation_agent');
      assert(adamEntry !== null,             'documentation_agent found');
      assert(adamEntry.platformId === 'adam', 'platformId is "adam"');
      assert(adamEntry.display_name === 'Pythia', 'display_name reflects change');
      obs.push(`getAgentByFunctionalId("documentation_agent") → platformId="adam", display_name="Pythia" ✓`);

      // Lookup for unknown functional_id returns null (does not throw)
      const missing = N.getAgentByFunctionalId('completely_unknown_role');
      assert(missing === null, 'unknown functional_id returns null');
      obs.push('Unknown functional_id → null (no throw) ✓');

      // Functional ID does NOT change when display_name changes
      assert(N.getAgentFunctionalId('thor') === 'reasoning_engine', 'thor functional_id stable');
      assert(N.getAgentFunctionalId('adam') === 'documentation_agent', 'adam functional_id stable');
      obs.push('Functional IDs stable across display name changes ✓');

      restoreFromBackup();
    } catch (err) {
      passed = false;
      issues.push(err.message);
      restoreFromBackup();
    }
    record(T, passed, obs, issues);
  }

  // ── T7: Config hot-reload (reloadConfig) ──────────────────────────────────
  {
    const T = 'T7: Config hot-reload — reloadConfig() picks up changes without module restart';
    const obs = [], issues = [];
    let passed = true;
    try {
      // Start with original config loaded into names.js
      restoreFromBackup();
      const N = freshNames();

      const origName = N.getAgentName('adam');
      assert(origName === 'Adam', `initial name is "Adam" (got "${origName}")`);
      obs.push(`Initial getAgentName("adam") → "${origName}" ✓`);

      // Write new value while same module instance is loaded
      const agents = readJSON(AGENTS_JSON);
      agents.adam.display_name = 'Helios';
      writeJSON(AGENTS_JSON, agents);

      // Before reload: still sees old cached value (cache not yet flushed)
      const beforeReload = N.getAgentName('adam');
      // (May be "Adam" if TTL not expired — that's the expected behavior)
      obs.push(`Before reloadConfig(): "${beforeReload}" (cache behavior — expected old value)`);

      // After explicit reload: picks up new value
      N.reloadConfig();
      const afterReload = N.getAgentName('adam');
      assert(afterReload === 'Helios', `after reload → "Helios" (got "${afterReload}")`);
      obs.push(`After reloadConfig(): getAgentName("adam") → "${afterReload}" ✓`);

      // Restore config and reload again — should revert
      restoreFromBackup();
      N.reloadConfig();
      const afterRestore = N.getAgentName('adam');
      assert(afterRestore === 'Adam', `after restore → "Adam" (got "${afterRestore}")`);
      obs.push(`After restore + reloadConfig(): → "${afterRestore}" ✓`);

      // Verify system name reload too
      const sys = readJSON(SYSTEM_JSON);
      sys.system_name = 'RELOAD_TEST';
      writeJSON(SYSTEM_JSON, sys);
      N.reloadConfig();
      const sysReloaded = N.getSystemName();
      assert(sysReloaded === 'RELOAD_TEST', `system name reloads (got "${sysReloaded}")`);
      obs.push(`getSystemName() reloads: → "${sysReloaded}" ✓`);

      restoreFromBackup();
      N.reloadConfig();

    } catch (err) {
      passed = false;
      issues.push(err.message);
      restoreFromBackup();
    }
    record(T, passed, obs, issues);
  }

  // ── T8: Validation suite passes under full rebrand ────────────────────────
  {
    const T = 'T8: Validation suite (--strict --compat) passes under full rebrand';
    const obs = [], issues = [];
    let passed = true;
    try {
      const origSys = readJSON(SYSTEM_BAK);
      const origAg  = readJSON(AGENTS_BAK);

      // Apply radical full rebrand
      const newSys = {
        ...origSys,
        system_name:        'ArcOS',
        system_id:          'arc_core',
        system_description: 'Autonomous Reasoning and Coordination Operating System',
      };
      const newAg = { ...origAg };
      const rebrandMap = {
        main: 'Nexus',
        loki: 'Sentinel',
        thor: 'Oracle',
        adam: 'Scribe',
      };
      for (const [id, name] of Object.entries(rebrandMap)) {
        newAg[id] = { ...origAg[id], display_name: name };
      }

      writeJSON(SYSTEM_JSON, newSys);
      writeJSON(AGENTS_JSON, newAg);

      obs.push(`Applied rebrand: system="ArcOS", main="Nexus", loki="Sentinel", thor="Oracle", adam="Scribe"`);

      // Run validate.js in a subprocess (fully fresh module load)
      let stdout = '';
      let exitCode = 0;
      try {
        stdout = execFileSync(
          process.execPath,
          [path.join(CONFIG_DIR, 'validate.js'), '--strict', '--compat'],
          { encoding: 'utf8', timeout: 30_000 }
        );
      } catch (execErr) {
        stdout   = execErr.stdout || '';
        exitCode = execErr.status  || 1;
      }

      // Check pass count vs fail count in output
      const passMatch  = stdout.match(/Passed:\s*(\d+)/);
      const failMatch  = stdout.match(/Failed:\s*(\d+)/);
      const warnMatch  = stdout.match(/Warnings:\s*(\d+)/);
      const passCount  = passMatch  ? parseInt(passMatch[1],  10) : null;
      const failCount  = failMatch  ? parseInt(failMatch[1],  10) : null;
      const warnCount  = warnMatch  ? parseInt(warnMatch[1],  10) : null;

      obs.push(`validate.js exit code: ${exitCode}`);
      if (passCount !== null) obs.push(`Checks passed: ${passCount}`);
      if (failCount !== null) obs.push(`Checks failed: ${failCount}`);
      if (warnCount !== null) obs.push(`Warnings: ${warnCount}`);

      // Verify validate passes with 0 failures
      assert(exitCode === 0, `validate.js exited 0 (got ${exitCode})`);
      assert(failCount === 0, `0 validation failures (got ${failCount})`);
      obs.push('Validation suite passes under full rebrand ✓');

      // Verify the rebranded names appear correctly in validate output
      assert(stdout.includes('ArcOS') || stdout.includes('arc_core'), 'rebranded system_name in output');
      obs.push('Rebranded system name visible in validate output ✓');

      restoreFromBackup();
    } catch (err) {
      passed = false;
      issues.push(err.message);
      restoreFromBackup();
    }
    record(T, passed, obs, issues);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════════════════════════');
console.log('  POST-REFACTOR VERIFICATION SUITE');
console.log('  OpenClaw/Odin — Naming & Config Refactor Phase 1+2');
console.log(`  ${new Date().toISOString()}`);
console.log('══════════════════════════════════════════════════════════');

createBackups();

try {
  runTests();
} finally {
  // GUARANTEED restore — runs even if an exception escapes runTests()
  performRestore();
}

// ── Final output ──────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log('  GLOBAL SUMMARY');
console.log('══════════════════════════════════════════════════════════');

for (const r of results) {
  const badge = r.passed ? '✓' : '✗';
  console.log(`  ${badge}  ${r.name}`);
  if (!r.passed) for (const i of r.issues) console.error(`       ⚠  ${i}`);
}

console.log('');
console.log(`  Tests run:    ${testsRun}`);
console.log(`  Passed:       ${testsPassed}`);
console.log(`  Failed:       ${testsFailed}`);

// System health assessment
const allPassed = testsFailed === 0;
const criticalTests = results.slice(0, 5);  // T1-T5 are critical
const criticalPassed = criticalTests.every(r => r.passed);

console.log('\n── Backup / Restore Status ─────────────────────────────────');
console.log(`  Backup created:    ${backupOk ? 'YES ✓' : 'NO ✗'}`);
console.log(`  Restore complete:  ${restoreOk ? 'YES ✓' : 'NO ✗'}`);
if (restoreOk) {
  console.log('\n  ✓ CONFIG RESTORED SUCCESSFULLY');
} else {
  console.error('\n  ✗ RESTORE FAILED — manual intervention required');
  console.error(`    Restore from: ${SYSTEM_BAK}`);
  console.error(`    Restore from: ${AGENTS_BAK}`);
}

// Risks
console.log('\n── Risks ────────────────────────────────────────────────────');
const knownRisks = [
  'Platform IDs (main, adam, thor, loki) are bound to live OpenClaw sessions — platform-level migration required to rename them',
  'preprocessor.js system prompts are computed at module-load time — display name changes require process restart to appear in prompt text',
  'path_key must stay in sync with on-disk directory names — update both together or paths break',
  'LIVE_AGENT_IDS in agent_ids.js must be manually updated when agent status changes',
];
for (const r of knownRisks) console.log(`  ·  ${r}`);

// Inconsistencies
console.log('\n── Inconsistencies ──────────────────────────────────────────');
const failedTests = results.filter(r => !r.passed);
if (failedTests.length === 0) {
  console.log('  None detected.');
} else {
  for (const r of failedTests) {
    console.log(`  ✗  ${r.name}`);
    for (const i of r.issues) console.log(`     ${i}`);
  }
}

// Final verdict
console.log('\n══════════════════════════════════════════════════════════');
console.log('  FINAL VERDICT');
console.log('══════════════════════════════════════════════════════════');

const confidence = allPassed ? 97 : criticalPassed ? 80 : 50;

console.log(`\n  Rebranding safety:      ${allPassed ? '✓ SAFE' : '⚠ PARTIAL'}`);
console.log(`  Export readiness:       ${allPassed ? '✓ READY' : '⚠ REVIEW REQUIRED'}`);
console.log(`  Tesla integration:      ${allPassed ? '✓ SAFE (add entry to agents.json)' : '⚠ RESOLVE FAILURES FIRST'}`);
console.log(`\n  Confidence:             ${confidence}%`);

if (allPassed) {
  console.log('\n  The system is fully config-driven, path-safe, routing-stable,');
  console.log('  and rebrand-ready. No persona-name dependencies in runtime code.\n');
} else {
  console.log('\n  Resolve failed tests before marking system export-ready.\n');
}

process.exit(allPassed && restoreOk ? 0 : 1);
