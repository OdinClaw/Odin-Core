#!/usr/bin/env node
/**
 * architecture_watcher.js
 * Watches OpenClaw config files and agent workspace for architecture changes.
 * On change: debounces 60s, diffs config state, emits system.architecture.changed
 * events to Adam with structured per-field change descriptions.
 *
 * Delivery (dual path):
 *   1. openclaw agent --agent adam  (direct agent invocation via gateway)
 *   2. Handoff file in adam/handoffs/ (offline fallback)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execFile } = require('child_process');

// ── Paths ────────────────────────────────────────────────────────────────────

const HOME          = os.homedir();
const STATE_DIR     = path.join(HOME, '.openclaw-odin');
const LOG_FILE      = path.join(STATE_DIR, 'logs', 'architecture_watcher.log');
const SNAPSHOTS_DIR = path.join(STATE_DIR, 'system_watchers', 'snapshots');

// Portable binary resolution: honour OPENCLAW_BIN env override (e.g. for non-Homebrew
// or non-macOS installs), then fall back to bare 'openclaw' and let PATH resolve it.
const OPENCLAW = process.env.OPENCLAW_BIN || 'openclaw';

// Resolved via paths.js so this path tracks path_key in agents.json, not a hardcoded string.
const { getAgentWorkspacePath } = require('../config/paths');
const HANDOFFS = getAgentWorkspacePath('adam', 'handoffs');

// The two openclaw.json files we diff (in addition to watching agent workspace)
const ODIN_CONFIG    = path.join(STATE_DIR, 'openclaw.json');
const DEFAULT_CONFIG = path.join(HOME, '.openclaw', 'openclaw.json');

const WATCHED = [
  ODIN_CONFIG,
  DEFAULT_CONFIG,
  path.join(STATE_DIR, 'workspace/agents'),
];

// ── Debounce ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 60_000;   // 60 seconds
let debounceTimer = null;
let pendingChanges = [];       // accumulate paths changed during the window

// ── Logging ──────────────────────────────────────────────────────────────────

// When run as a LaunchAgent, stdout IS the log file (StandardOutPath).
// Only append directly to the log file when running interactively (TTY).
const IS_TTY = process.stdout.isTTY;

function log(level, msg) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}\n`;
  process.stdout.write(line);
  if (IS_TTY) {
    try {
      fs.appendFileSync(LOG_FILE, line);
    } catch (_) { /* log dir may not exist yet */ }
  }
}

// ── Snapshot helpers ──────────────────────────────────────────────────────────

/**
 * Load and parse a JSON file. Returns parsed object or null on error.
 */
function loadJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    log('WARN', `Could not load JSON from ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Return the snapshot file path for a given config path.
 * e.g. ${HOME}/.openclaw-odin/openclaw.json
 *   → ${HOME}/.openclaw-odin/system_watchers/snapshots/openclaw-odin.openclaw.json
 */
function snapshotPath(configPath) {
  // Create a safe filename from the config path
  const rel  = configPath.startsWith(HOME) ? configPath.slice(HOME.length + 1) : configPath;
  const safe = rel.replace(/[\/\\]/g, '.').replace(/^\./, '');
  return path.join(SNAPSHOTS_DIR, safe);
}

/**
 * Read the snapshot for a config file. Returns parsed object or null.
 */
function readSnapshot(configPath) {
  return loadJSON(snapshotPath(configPath));
}

/**
 * Write a new snapshot for a config file.
 */
function writeSnapshot(configPath, data) {
  try {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    fs.writeFileSync(snapshotPath(configPath), JSON.stringify(data, null, 2));
  } catch (err) {
    log('ERROR', `Failed to write snapshot for ${configPath}: ${err.message}`);
  }
}

// ── Deep diff utilities ───────────────────────────────────────────────────────

/**
 * Safely get a nested value from an object using a dot-path.
 */
function getPath(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

/**
 * Stringify a value for display in event messages.
 * Returns a short, human-readable representation.
 */
function display(val) {
  if (val === undefined || val === null) return String(val);
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return `[${val.join(', ')}]`;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

/**
 * Simple equality check (JSON-serialisation based for objects/arrays).
 */
function equal(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Config differ ─────────────────────────────────────────────────────────────

/**
 * Compute a list of structured change objects by comparing prev and curr configs.
 * Each change has the shape:
 *   {
 *     event:     'system.architecture.changed',
 *     source:    'odin',
 *     component: <string>,       // e.g. 'agent_model', 'gateway_port'
 *     agent?:    <string>,       // only for per-agent changes
 *     previous:  <any>,
 *     current:   <any>,
 *     timestamp: <ISO string>,
 *   }
 */
function diffConfigs(prev, curr, sourceLabel) {
  const changes = [];
  const ts = new Date().toISOString();

  function emit(component, previous, current, extra = {}) {
    changes.push({
      event:     'system.architecture.changed',
      source:    'odin',
      component,
      ...extra,
      previous:  display(previous),
      current:   display(current),
      timestamp: ts,
      config:    sourceLabel,
    });
  }

  if (!prev || !curr) {
    // Can't diff — treat as a generic change
    changes.push({
      event:     'system.architecture.changed',
      source:    'odin',
      component: 'config_file',
      previous:  prev ? '<exists>' : '<missing>',
      current:   curr ? '<exists>' : '<missing>',
      timestamp: ts,
      config:    sourceLabel,
    });
    return changes;
  }

  // ── 1. Agents list ──────────────────────────────────────────────────────────
  // agents.list is an array of objects: [{id, model, name, workspace, ...}, ...]

  const prevAgentArr = getPath(prev, 'agents', 'list') || [];
  const currAgentArr = getPath(curr, 'agents', 'list') || [];

  // Index by id for easy lookup
  const prevAgents = Object.fromEntries(prevAgentArr.map(a => [a.id, a]));
  const currAgents = Object.fromEntries(currAgentArr.map(a => [a.id, a]));

  const allAgentIds = new Set([
    ...Object.keys(prevAgents),
    ...Object.keys(currAgents),
  ]);

  for (const agentId of allAgentIds) {
    const p = prevAgents[agentId];
    const c = currAgents[agentId];

    if (!p && c) {
      emit('agent_added', null, agentId, { agent: agentId });
      if (c.model) {
        emit('agent_model', null, c.model, { agent: agentId });
      }
      continue;
    }

    if (p && !c) {
      emit('agent_removed', agentId, null, { agent: agentId });
      continue;
    }

    // Agent exists in both — check per-field
    if (!equal(p.model, c.model)) {
      emit('agent_model', p.model, c.model, { agent: agentId });
    }
    if (!equal(p.status, c.status)) {
      emit('agent_status', p.status, c.status, { agent: agentId });
    }
    if (!equal(p.agentDir, c.agentDir)) {
      emit('agent_dir', p.agentDir, c.agentDir, { agent: agentId });
    }
  }

  // ── 1b. Allowed-models registry ─────────────────────────────────────────────

  const prevModels = Object.keys(getPath(prev, 'agents', 'defaults', 'models') || {}).sort();
  const currModels = Object.keys(getPath(curr, 'agents', 'defaults', 'models') || {}).sort();
  const addedModels   = currModels.filter(m => !prevModels.includes(m));
  const removedModels = prevModels.filter(m => !currModels.includes(m));
  for (const m of addedModels)   emit('model_allowlist_added',   null, m);
  for (const m of removedModels) emit('model_allowlist_removed', m,   null);

  // ── 2. Default model routing ────────────────────────────────────────────────

  const prevPrimary  = getPath(prev, 'agents', 'defaults', 'model', 'primary');
  const currPrimary  = getPath(curr, 'agents', 'defaults', 'model', 'primary');
  if (!equal(prevPrimary, currPrimary)) {
    emit('default_model_primary', prevPrimary, currPrimary);
  }

  const prevFallbacks = getPath(prev, 'agents', 'defaults', 'model', 'fallbacks') || [];
  const currFallbacks = getPath(curr, 'agents', 'defaults', 'model', 'fallbacks') || [];
  if (!equal(prevFallbacks, currFallbacks)) {
    emit('default_model_fallbacks', prevFallbacks, currFallbacks);
  }

  const prevSubagents = getPath(prev, 'agents', 'defaults', 'model', 'subagents');
  const currSubagents = getPath(curr, 'agents', 'defaults', 'model', 'subagents');
  if (!equal(prevSubagents, currSubagents)) {
    emit('default_model_subagents', prevSubagents, currSubagents);
  }

  // ── 3. Auth / provider configuration ───────────────────────────────────────

  const prevAuthOrder = getPath(prev, 'auth', 'order') || {};
  const currAuthOrder = getPath(curr, 'auth', 'order') || {};
  const allProviders  = new Set([
    ...Object.keys(prevAuthOrder),
    ...Object.keys(currAuthOrder),
  ]);

  for (const provider of allProviders) {
    const p = prevAuthOrder[provider];
    const c = currAuthOrder[provider];
    if (!equal(p, c)) {
      emit('auth_order', p, c, { agent: provider });
    }
  }

  // Detect provider additions/removals in channels config (e.g. groq, openai)
  const prevChanKeys = Object.keys(getPath(prev, 'channels') || {});
  const currChanKeys = Object.keys(getPath(curr, 'channels') || {});
  const addedChans   = currChanKeys.filter(k => !prevChanKeys.includes(k));
  const removedChans = prevChanKeys.filter(k => !currChanKeys.includes(k));
  for (const ch of addedChans)   emit('channel_provider_added',   null, ch);
  for (const ch of removedChans) emit('channel_provider_removed', ch,   null);

  // ── 4. Discord accounts ─────────────────────────────────────────────────────

  const prevDiscord = getPath(prev, 'channels', 'discord', 'accounts') || {};
  const currDiscord = getPath(curr, 'channels', 'discord', 'accounts') || {};
  const allDiscordIds = new Set([
    ...Object.keys(prevDiscord),
    ...Object.keys(currDiscord),
  ]);

  for (const accountId of allDiscordIds) {
    const p = prevDiscord[accountId];
    const c = currDiscord[accountId];

    if (!p && c) {
      emit('discord_account_added', null, accountId, { agent: accountId });
      continue;
    }
    if (p && !c) {
      emit('discord_account_removed', accountId, null, { agent: accountId });
      continue;
    }

    // Both exist — check token (redacted in logs), guilds, channels
    if (p.token !== c.token) {
      emit('discord_token_changed', '<redacted>', '<redacted>', { agent: accountId });
    }

    const prevGuildIds = Object.keys(p.guilds || {}).sort();
    const currGuildIds = Object.keys(c.guilds || {}).sort();
    if (!equal(prevGuildIds, currGuildIds)) {
      emit('discord_guilds', prevGuildIds, currGuildIds, { agent: accountId });
    }

    // Diff channels across all guilds (channels is a dict keyed by channel ID)
    const prevChannelIds = prevGuildIds.flatMap(
      gid => Object.keys(getPath(p, 'guilds', gid, 'channels') || {})
    ).sort();
    const currChannelIds = currGuildIds.flatMap(
      gid => Object.keys(getPath(c, 'guilds', gid, 'channels') || {})
    ).sort();
    if (!equal(prevChannelIds, currChannelIds)) {
      const added   = currChannelIds.filter(id => !prevChannelIds.includes(id));
      const removed = prevChannelIds.filter(id => !currChannelIds.includes(id));
      if (added.length)   emit('discord_channel_added',   null, added,   { agent: accountId });
      if (removed.length) emit('discord_channel_removed', removed, null, { agent: accountId });
    }
  }

  // ── 5. Gateway settings ─────────────────────────────────────────────────────

  const prevGw = getPath(prev, 'gateway') || {};
  const currGw = getPath(curr, 'gateway') || {};

  const gwFields = ['port', 'host', 'auth', 'tls'];
  for (const field of gwFields) {
    if (!equal(prevGw[field], currGw[field])) {
      emit(`gateway_${field}`, prevGw[field], currGw[field]);
    }
  }

  // ── 6. Bindings ─────────────────────────────────────────────────────────────

  const prevBindings = getPath(prev, 'bindings') || [];
  const currBindings = getPath(curr, 'bindings') || [];
  if (!equal(prevBindings, currBindings)) {
    // Summarise additions/removals by agentId
    const prevIds = prevBindings.map(b => b.agentId).filter(Boolean);
    const currIds = currBindings.map(b => b.agentId).filter(Boolean);
    const added   = currIds.filter(id => !prevIds.includes(id));
    const removed = prevIds.filter(id => !currIds.includes(id));
    for (const id of added)   emit('binding_added',   null, id, { agent: id });
    for (const id of removed) emit('binding_removed', id,   null, { agent: id });
    // If same agents but different match rules, emit generic
    if (added.length === 0 && removed.length === 0) {
      emit('bindings_modified', prevBindings, currBindings);
    }
  }

  return changes;
}

// ── Event emission ────────────────────────────────────────────────────────────

function buildGenericEvent(components) {
  return {
    event:     'system.architecture.changed',
    source:    'odin',
    timestamp: new Date().toISOString(),
    component: components.length === 1 ? components[0] : components,
    change:    'configuration modified',
  };
}

function writeHandoff(event) {
  try {
    fs.mkdirSync(HANDOFFS, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const slug = `arch-change-${Date.now()}`;
    const file = path.join(HANDOFFS, `${date}_${slug}.json`);
    fs.writeFileSync(file, JSON.stringify(event, null, 2));
    log('INFO', `Handoff written: ${file}`);
    return file;
  } catch (err) {
    log('ERROR', `Failed to write handoff: ${err.message}`);
    return null;
  }
}

/**
 * Format a list of structured change objects into a human-readable message
 * for Adam to use when creating architecture notes.
 */
function formatChangesForAdam(changes, handoffFile) {
  const lines = [
    `[system.architecture.changed]`,
    `Timestamp: ${changes[0]?.timestamp || new Date().toISOString()}`,
    `Changes detected: ${changes.length}`,
    `Handoff: ${handoffFile || 'n/a'}`,
    '',
  ];

  for (const ch of changes) {
    const agentPart = ch.agent ? ` [${ch.agent}]` : '';
    lines.push(`  • ${ch.component}${agentPart}: ${ch.previous} → ${ch.current}  (${ch.config || 'workspace'})`);
  }

  lines.push('');
  lines.push('Please create an architecture note documenting these changes.');
  lines.push('Use templates/architecture_template.txt.');
  lines.push('Store in documents/architecture/.');
  lines.push('Update memory/knowledge_index.json and post confirmation to #adam.');

  return lines.join('\n');
}

function emitToAdam(msg, eventPayload) {
  log('INFO', `Invoking Adam agent with ${msg.split('\n').length} line message`);

  execFile(
    OPENCLAW,
    [
      '--profile', 'odin',
      'agent',
      '--agent', 'adam',
      '--message', msg,
    ],
    { timeout: 30_000 },
    (err, stdout, stderr) => {
      if (err) {
        log('WARN', `adam agent invocation failed (${err.message}) — handoff file is fallback`);
      } else {
        log('INFO', `Adam invocation OK: ${stdout.trim().slice(0, 120)}`);
      }
      if (stderr && stderr.trim()) {
        log('DEBUG', `agent stderr: ${stderr.trim().slice(0, 120)}`);
      }
    }
  );
}

// ── Core handler ──────────────────────────────────────────────────────────────

function handleChange(filePath) {
  let label = filePath;
  if (label.startsWith(HOME)) {
    label = '~' + label.slice(HOME.length);
  }

  log('INFO', `Change detected: ${label}`);

  if (!pendingChanges.includes(label)) {
    pendingChanges.push(label);
  }

  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    const components  = [...pendingChanges];
    pendingChanges    = [];
    debounceTimer     = null;

    log('INFO', `Debounce elapsed — processing changes for: ${components.join(', ')}`);

    // ── Diff config files that changed ──────────────────────────────────────

    const allChanges = [];

    // Check each openclaw.json in the pending list
    const configFiles = [
      { abs: ODIN_CONFIG,    label: '~/.openclaw-odin/openclaw.json' },
      { abs: DEFAULT_CONFIG, label: '~/.openclaw/openclaw.json' },
    ];

    for (const { abs, label: cfgLabel } of configFiles) {
      const normalised = '~' + abs.slice(HOME.length);
      if (!components.includes(normalised)) continue;

      log('INFO', `Diffing config: ${cfgLabel}`);

      const prev = readSnapshot(abs);
      const curr = loadJSON(abs);

      const diffs = diffConfigs(prev, curr, cfgLabel);
      log('INFO', `  → ${diffs.length} change(s) found`);

      for (const d of diffs) {
        const agentStr = d.agent ? ` [${d.agent}]` : '';
        log('INFO', `    ${d.component}${agentStr}: ${d.previous} → ${d.current}`);
      }

      allChanges.push(...diffs);

      // Persist updated snapshot
      if (curr) {
        writeSnapshot(abs, curr);
        log('INFO', `  Snapshot updated: ${cfgLabel}`);
      }
    }

    // ── Workspace (agent dir) changes → generic events ───────────────────────

    const workspaceChanges = components.filter(c =>
      !c.endsWith('openclaw.json')
    );

    if (workspaceChanges.length > 0) {
      log('INFO', `Workspace changes: ${workspaceChanges.join(', ')}`);
      const genericEvent = buildGenericEvent(workspaceChanges);
      allChanges.push({
        ...genericEvent,
        previous: null,
        current:  workspaceChanges.join(', '),
        config:   'workspace',
      });
    }

    if (allChanges.length === 0) {
      log('INFO', 'No structural changes detected — skipping Adam notification');
      return;
    }

    // Write a single consolidated handoff file
    const handoffPayload = {
      event:     'system.architecture.changed',
      source:    'odin',
      timestamp: new Date().toISOString(),
      changes:   allChanges,
    };

    const handoffFile = writeHandoff(handoffPayload);

    // Format and send to Adam
    const msg = formatChangesForAdam(allChanges, handoffFile);
    emitToAdam(msg, handoffPayload);

  }, DEBOUNCE_MS);

  log('DEBUG', `Debounce timer reset (fires in ${DEBOUNCE_MS / 1000}s)`);
}

// ── Watchers ──────────────────────────────────────────────────────────────────

const IGNORED_SUBSTRINGS = [
  'handoffs/',
  '.jsonl',
  '.log',
  'workspace-state',
  'sessions/',
  '.DS_Store',
  'snapshots/',   // don't trigger on our own snapshot writes
];

function shouldIgnore(filePath) {
  return IGNORED_SUBSTRINGS.some(s => filePath.includes(s));
}

function watchPath(target) {
  try {
    const stat  = fs.statSync(target);
    const isDir = stat.isDirectory();
    const opts  = isDir
      ? { recursive: true, persistent: true }
      : { persistent: true };

    const watcher = fs.watch(target, opts, (_eventType, filename) => {
      const full = isDir && filename ? path.join(target, filename) : target;
      if (shouldIgnore(full)) return;
      handleChange(full);
    });

    watcher.on('error', (err) => {
      log('ERROR', `Watcher error on ${target}: ${err.message}`);
      setTimeout(() => watchPath(target), 5_000);
    });

    log('INFO', `Watching: ${target.replace(HOME, '~')}${stat.isDirectory() ? '/**' : ''}`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      log('WARN', `Path not found (will retry in 30s): ${target}`);
      setTimeout(() => watchPath(target), 30_000);
    } else {
      log('ERROR', `Cannot watch ${target}: ${err.message}`);
    }
  }
}

// ── Startup ───────────────────────────────────────────────────────────────────

function main() {
  try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch (_) {}
  try { fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true }); } catch (_) {}

  log('INFO', '─────────────────────────────────────────────');
  log('INFO', 'architecture_watcher started (with config diffing)');
  log('INFO', `PID: ${process.pid}`);
  log('INFO', `Debounce: ${DEBOUNCE_MS / 1000}s`);
  log('INFO', `Log: ${LOG_FILE}`);
  log('INFO', `Handoff dir: ${HANDOFFS}`);
  log('INFO', `Snapshots: ${SNAPSHOTS_DIR}`);

  // Seed snapshots on startup (so first change always has a baseline to diff against)
  for (const { abs, label } of [
    { abs: ODIN_CONFIG,    label: '~/.openclaw-odin/openclaw.json' },
    { abs: DEFAULT_CONFIG, label: '~/.openclaw/openclaw.json' },
  ]) {
    const snap = snapshotPath(abs);
    if (!fs.existsSync(snap)) {
      const data = loadJSON(abs);
      if (data) {
        writeSnapshot(abs, data);
        log('INFO', `Initial snapshot seeded: ${label}`);
      }
    } else {
      log('INFO', `Snapshot exists: ${label}`);
    }
  }

  for (const p of WATCHED) {
    watchPath(p);
  }

  log('INFO', 'Watching. Waiting for changes…');

  process.stdin.resume();

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      log('INFO', `${sig} received — shutting down`);
      if (debounceTimer) clearTimeout(debounceTimer);
      process.exit(0);
    });
  }

  setInterval(() => {
    log('INFO', `Heartbeat — watching ${WATCHED.length} paths, ${pendingChanges.length} pending changes`);
  }, 30 * 60 * 1000);
}

main();
