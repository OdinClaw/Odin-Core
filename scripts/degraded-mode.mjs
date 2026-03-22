#!/usr/bin/env node
/**
 * Odin Degraded-Mode Handler
 *
 * When all cloud providers are unavailable (Anthropic + Groq both down or
 * rate-limited), this module ensures the user NEVER sees raw "All models failed".
 *
 * Response priority (in order):
 *   1. Deterministic reply  — for status/health/heartbeat queries (no LLM needed)
 *   2. Cache hit            — serve a recent successful response from prompt-cache.json
 *   3. Fallback notice      — structured message explaining the degraded state
 *
 * Routing rules enforced:
 *   - Anthropic = primary (checked first on recovery)
 *   - Groq = fallback only (not promoted to primary here)
 *   - Ollama = infrastructure only (never used for response content)
 *   - Qwen = EXCLUDED from all routing
 *
 * Detection levels:
 *   - Hard degraded: provider-registry.json mode === "safe_mode"
 *   - Soft degraded: cron/jobs.json System Heartbeat consecutiveErrors ≥ 3
 *                    with lastError containing "All models failed"
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Paths ─────────────────────────────────────────────────────────────────────
const BASE_DIR      = path.join(os.homedir(), '.openclaw-odin');
const REGISTRY_FILE = path.join(BASE_DIR, 'scripts', 'provider-registry.json');
const CRON_FILE     = path.join(BASE_DIR, 'cron', 'jobs.json');
const CACHE_FILE    = path.join(BASE_DIR, 'scripts', 'prompt-cache.json');
const DM_LOG        = path.join(BASE_DIR, 'scripts', 'degraded-mode.log');

// ── Discord config (read from openclaw.json at call time) ─────────────────────
const OPENCLAW_JSON = path.join(BASE_DIR, 'openclaw.json');

// Hardened fallback channel for system status alerts
// #status-heartbeat in the Odin guild
const STATUS_HEARTBEAT_CHANNEL = '1477459673996198079';
// #loki — used when handling Loki heartbeat triggers
const LOKI_CHANNEL             = '1478591775558996122';

// Threshold for soft-degraded detection
const SOFT_DEGRADED_THRESHOLD = 3;  // consecutive errors

// Cache TTL for degraded mode (serve stale cache up to this age)
const DEGRADED_CACHE_MAX_AGE_MS = 30 * 60 * 1000;  // 30 minutes

// Deterministic query patterns — these never need an LLM
const DETERMINISTIC_PATTERNS = [
  /\bheartbeat\b/i,
  /\bhealth\s*check\b/i,
  /\bstatus\b/i,
  /\buptime\b/i,
  /\bping\b/i,
  /\bare\s+you\s+(there|online|alive)\b/i,
  /\bcron\s+list\b/i,
  /\bcron\s+status\b/i,
  /\bprovider\s+state\b/i,
  /\bcheck\s+cron\b/i,
  /\ball\s+ok\b/i,
];

// ── Logger ────────────────────────────────────────────────────────────────────
function dmlog(level, message, data = {}) {
  const entry = { ts: new Date().toISOString(), level, message, ...data };
  try { fs.appendFileSync(DM_LOG, JSON.stringify(entry) + '\n'); } catch { /* ignore */ }
  return entry;
}

// ── Data loaders ──────────────────────────────────────────────────────────────
function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')); }
  catch { return null; }
}

function loadCronJobs() {
  try { return JSON.parse(fs.readFileSync(CRON_FILE, 'utf8')); }
  catch { return null; }
}

function loadOpenclawConfig() {
  try { return JSON.parse(fs.readFileSync(OPENCLAW_JSON, 'utf8')); }
  catch { return null; }
}

// ── Bot token resolution ──────────────────────────────────────────────────────
function getDiscordToken(accountId = 'default') {
  const cfg = loadOpenclawConfig();
  return cfg?.channels?.discord?.accounts?.[accountId]?.token ?? null;
}

// ── Degraded mode detection ───────────────────────────────────────────────────
/**
 * Detect whether all cloud providers are effectively unavailable.
 *
 * Returns:
 *   { active: false }
 *   { active: true, severity: 'hard'|'soft', reason, details }
 */
export function isAllCloudFailed(reg, cronJobs) {
  if (!reg) return { active: false, reason: 'no_registry' };

  // ── Hard degraded: health monitor determined safe_mode ───────────────────
  if (reg.mode === 'safe_mode') {
    return {
      active:   true,
      severity: 'hard',
      reason:   'safe_mode',
      details:  {
        anthropic: reg.providers?.anthropic,
        groq:      reg.providers?.groq,
      },
    };
  }

  // ── Soft degraded: inference rate-limited (probe healthy, inference fails) ─
  // The Groq /models probe is not quota-counted, so it shows "healthy" even
  // when inference quota is exhausted. Detect via cron job consecutive errors.
  if (cronJobs) {
    const heartbeat = cronJobs.jobs?.find(j => j.agentId === 'main' && j.name === 'System Heartbeat');
    const memChan   = cronJobs.jobs?.find(j => j.agentId === 'main' && j.name === 'Update #memory channel');

    const allFailed = (job) =>
      job?.state?.consecutiveErrors >= SOFT_DEGRADED_THRESHOLD &&
      job?.state?.lastError?.includes('All models failed');

    if (allFailed(heartbeat) || allFailed(memChan)) {
      const job = allFailed(heartbeat) ? heartbeat : memChan;
      return {
        active:   true,
        severity: 'soft',
        reason:   'inference_rate_limited',
        details:  {
          jobName:           job.name,
          consecutiveErrors: job.state.consecutiveErrors,
          lastError:         job.state.lastError,
          anthropic:         reg.providers?.anthropic,
          groq:              reg.providers?.groq,
        },
      };
    }
  }

  return { active: false };
}

/**
 * Load current degraded state from disk.
 */
export function getDegradedState() {
  const reg      = loadRegistry();
  const cronJobs = loadCronJobs();
  const state    = isAllCloudFailed(reg, cronJobs);
  return { ...state, reg, cronJobs };
}

// ── Query classification ──────────────────────────────────────────────────────
export function isDeterministicQuery(message) {
  if (!message) return false;
  return DETERMINISTIC_PATTERNS.some(p => p.test(message));
}

// ── Response builders ─────────────────────────────────────────────────────────
/**
 * Build a rich heartbeat/status response from live registry data.
 * No LLM required — all data comes from provider-registry.json and cron/jobs.json.
 */
export function buildHeartbeatResponse(reg, cronJobs) {
  const ts     = new Date().toUTCString();
  const mode   = reg?.mode ?? 'unknown';
  const anth   = reg?.providers?.anthropic;
  const groq   = reg?.providers?.groq;
  const budget = reg?.budget;

  // Provider status lines
  const anthEmoji  = anth?.state === 'healthy'  ? '🟢' : anth?.state === 'cooldown' ? '🔴' : '🟡';
  const groqEmoji  = groq?.state === 'healthy'  ? '🟢' : groq?.state === 'cooldown' ? '🔴' : '🟡';

  const anthLine = `${anthEmoji} **Anthropic** · ${anth?.state ?? 'unknown'} · score ${anth?.score ?? '?'}/100` +
    (anth?.cooldownUntil ? ` · recovery ≈ ${new Date(anth.cooldownUntil).toISOString().replace('T', ' ').slice(0, 19)} UTC` : '');
  const groqLine = `${groqEmoji} **Groq** · ${groq?.state ?? 'unknown'} · score ${groq?.score ?? '?'}/100`;

  // Cron job summary
  const jobs    = cronJobs?.jobs?.filter(j => j.enabled) ?? [];
  const failing = jobs.filter(j => j.state?.lastStatus === 'error' || j.state?.consecutiveErrors > 0);
  const cronSummary = jobs.length === 0
    ? '(no jobs)'
    : failing.length === 0
    ? `✅ ${jobs.length} jobs OK`
    : `⚠️ ${failing.length}/${jobs.length} jobs with errors:\n` +
      failing.map(j => `  • **${j.name}** — ${j.state?.consecutiveErrors}x errors`).join('\n');

  // Budget
  const budgetLine = budget
    ? `💰 Daily spend: $${budget.daily?.spendUSD?.toFixed(4) ?? '0.0000'} / $${budget.daily?.limits?.hard ?? '1.50'} hard limit`
    : '';

  const modeLabel = {
    normal:        '🟢 Normal (Anthropic primary)',
    groq_fallback: '🟡 Groq Fallback (Anthropic in cooldown)',
    safe_mode:     '🔴 Safe Mode (local only)',
  }[mode] ?? `⚪ ${mode}`;

  return [
    `⚠️ **Odin — Degraded Mode** · <t:${Math.floor(Date.now() / 1000)}:T>`,
    '',
    `**Routing Mode:** ${modeLabel}`,
    '',
    '**Provider Status**',
    anthLine,
    groqLine,
    `⚙️ **Ollama** · local online (infrastructure only)`,
    '',
    '**Cron Jobs**',
    cronSummary,
    budgetLine ? `\n${budgetLine}` : '',
    '',
    '> I\'m **online and monitoring**. Cloud inference is temporarily unavailable.',
    '> Retrying automatically. Full service resumes when providers recover.',
  ].filter(Boolean).join('\n');
}

/**
 * Build a brief fallback notice when no deterministic response is possible.
 */
export function buildFallbackNotice(state) {
  const { severity, reason, details } = state;
  const anth = details?.anthropic;
  const recoveryNote = anth?.cooldownUntil
    ? `Anthropic recovers ≈ ${new Date(anth.cooldownUntil).toISOString().slice(11, 19)} UTC.`
    : 'Providers recovering automatically.';

  return [
    `⚠️ **Odin — Temporarily Unavailable** · <t:${Math.floor(Date.now() / 1000)}:T>`,
    '',
    severity === 'hard'
      ? '🔴 All cloud providers are in cooldown (safe mode active).'
      : '🟡 Cloud inference quota exhausted (Anthropic + Groq rate-limited).',
    '',
    `${recoveryNote} Ollama is running locally for infrastructure tasks.`,
    '',
    '> **Your request was not processed.** Please retry in a few minutes.',
    '> Odin is online — this message was sent without an LLM.',
  ].join('\n');
}

// ── Cache proxy ───────────────────────────────────────────────────────────────
/**
 * Check prompt-cache.json for a recent response to this message.
 * Returns the cached result string, or null if no valid hit.
 */
export function checkCache(message, bucket = 'cheap_routine') {
  if (!message) return null;
  try {
    const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const entries   = cacheData.entries ?? {};
    const now       = Date.now();

    // Build a rough cache key: first 120 chars normalised
    const normalised = message
      .replace(/\b\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?\b/g, '')
      .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b/gi, '')
      .replace(/\b(today|yesterday|now|just\s+now|recently|right\s+now)\b/gi, '')
      .replace(/\s+/g, ' ').trim();
    const prefix = normalised.slice(0, 120).toLowerCase();

    for (const entry of Object.values(entries)) {
      if (entry.bucket !== bucket && entry.bucket !== 'utility_local') continue;
      const age = now - new Date(entry.storedAt ?? 0).getTime();
      if (age > DEGRADED_CACHE_MAX_AGE_MS) continue;  // too stale

      const entryPrefix = (entry.prompt ?? '').slice(0, 120).toLowerCase();
      // Simple similarity: prefix overlap ≥ 0.7
      const maxLen = Math.max(prefix.length, entryPrefix.length);
      let matches = 0;
      for (let i = 0; i < Math.min(prefix.length, entryPrefix.length); i++) {
        if (prefix[i] === entryPrefix[i]) matches++;
      }
      if (maxLen > 0 && matches / maxLen >= 0.70) {
        dmlog('info', 'Cache hit in degraded mode', {
          ageMs: age, bucket: entry.bucket, prefix: prefix.slice(0, 60),
        });
        return entry.result ?? null;
      }
    }
  } catch { /* cache read failure is non-fatal */ }
  return null;
}

// ── Discord poster ────────────────────────────────────────────────────────────
/**
 * Post a message directly to Discord via the REST API.
 * Bypasses OpenClaw entirely — works even when all LLM providers are down.
 *
 * @param {string} channelId  Discord channel snowflake
 * @param {string} botToken   Bot token (from openclaw.json)
 * @param {string} content    Message text (≤ 2000 chars)
 * @returns {Promise<boolean>}
 */
export async function postToDiscord(channelId, botToken, content) {
  if (!channelId || !botToken || !content) {
    dmlog('warn', 'postToDiscord: missing params', { channelId: !!channelId, hasToken: !!botToken, hasContent: !!content });
    return false;
  }

  // Truncate to Discord's 2000-char limit
  const truncated = content.length > 1990
    ? content.slice(0, 1987) + '…'
    : content;

  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method:  'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type':  'application/json',
        'User-Agent':    'OdinDegradedMode/1.0',
      },
      body: JSON.stringify({ content: truncated }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      dmlog('info', 'Discord message posted', { channelId, length: truncated.length });
      return true;
    }
    const err = await res.text().catch(() => '');
    dmlog('warn', 'Discord post failed', { channelId, status: res.status, body: err.slice(0, 200) });
    return false;
  } catch (e) {
    dmlog('warn', 'Discord post error', { channelId, error: e.message });
    return false;
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────
/**
 * Handle a request in degraded mode.
 *
 * @param {object} opts
 *   - message     {string}  The original user/cron message
 *   - channelId   {string}  Discord channel to post the response
 *   - botToken    {string}  Bot token to use for posting
 *   - bucket      {string}  Task bucket (for cache lookup)
 *   - dryRun      {boolean} If true, return response without posting
 *
 * @returns {Promise<{ served, method, content }>}
 *   method: 'deterministic' | 'cache' | 'fallback_notice' | 'none'
 */
export async function handleDegradedRequest({ message, channelId, botToken, bucket = 'utility_local', dryRun = false }) {
  const reg      = loadRegistry();
  const cronJobs = loadCronJobs();
  const state    = isAllCloudFailed(reg, cronJobs);

  if (!state.active) {
    dmlog('info', 'handleDegradedRequest called but not in degraded mode — no-op');
    return { served: false, method: 'none', content: null };
  }

  dmlog('warn', 'Degraded mode handler invoked', {
    severity:  state.severity,
    reason:    state.reason,
    message:   message?.slice(0, 80),
    channelId,
    bucket,
  });

  let content = null;
  let method  = 'none';

  // ── Step 1: Deterministic reply (no LLM needed) ────────────────────────────
  if (isDeterministicQuery(message)) {
    content = buildHeartbeatResponse(reg, cronJobs);
    method  = 'deterministic';
    dmlog('info', 'Serving deterministic response', { reason: state.reason });
  }

  // ── Step 2: Cache hit ──────────────────────────────────────────────────────
  if (!content) {
    const cached = checkCache(message, bucket);
    if (cached) {
      content = `📦 *[Cached response — providers temporarily unavailable]*\n\n${cached}`;
      method  = 'cache';
      dmlog('info', 'Serving cache hit in degraded mode');
    }
  }

  // ── Step 3: Fallback notice ────────────────────────────────────────────────
  if (!content) {
    content = buildFallbackNotice(state);
    method  = 'fallback_notice';
    dmlog('warn', 'Serving fallback notice (no deterministic or cache match)', { reason: state.reason });
  }

  // ── Post to Discord ────────────────────────────────────────────────────────
  let posted = false;
  if (!dryRun && channelId && botToken) {
    posted = await postToDiscord(channelId, botToken, content);
  }

  dmlog('info', 'Degraded response dispatched', { method, posted, length: content.length });
  return { served: true, method, content, posted };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const cmd = process.argv[2];

  switch (cmd) {

    case 'check': {
      // Exit 0 = NOT degraded (normal operation)
      // Exit 1 = DEGRADED (trigger script should use degraded handler)
      const state = getDegradedState();
      console.log(JSON.stringify({ active: state.active, severity: state.severity ?? null, reason: state.reason ?? null }));
      process.exit(state.active ? 1 : 0);
      break;
    }

    case 'status': {
      const state = getDegradedState();
      const reg   = state.reg;
      console.log(JSON.stringify({
        degraded:     state.active,
        severity:     state.severity ?? null,
        reason:       state.reason ?? null,
        mode:         reg?.mode,
        anthropic:    reg?.providers?.anthropic,
        groq:         reg?.providers?.groq,
        details:      state.details,
      }, null, 2));
      break;
    }

    case 'handle-heartbeat': {
      // Called by trigger-heartbeat.sh when degraded.
      // Posts a deterministic heartbeat response to #loki using Loki's bot.
      const lokiToken = getDiscordToken('loki');
      if (!lokiToken) {
        dmlog('error', 'handle-heartbeat: could not resolve Loki bot token');
        console.error('ERROR: Loki bot token not found in openclaw.json');
        process.exit(1);
      }
      const HEARTBEAT_MSG = 'Read HEARTBEAT.md. Check cron list. For each failed job: report name, error status, last error message, and specific fix. If all OK, post OK. Post findings to #loki.';
      const result = await handleDegradedRequest({
        message:   HEARTBEAT_MSG,
        channelId: LOKI_CHANNEL,
        botToken:  lokiToken,
        bucket:    'utility_local',
      });
      console.log(JSON.stringify({ method: result.method, posted: result.posted }));
      process.exit(result.served ? 0 : 1);
      break;
    }

    case 'handle-status': {
      // Post degraded status to #status-heartbeat via Odin's bot.
      const odinToken = getDiscordToken('default');
      if (!odinToken) {
        dmlog('error', 'handle-status: could not resolve Odin bot token');
        process.exit(1);
      }
      const result = await handleDegradedRequest({
        message:   'status',
        channelId: STATUS_HEARTBEAT_CHANNEL,
        botToken:  odinToken,
        bucket:    'utility_local',
      });
      console.log(JSON.stringify({ method: result.method, posted: result.posted }));
      process.exit(result.served ? 0 : 1);
      break;
    }

    case 'test-discord': {
      // Dry run: build and print the heartbeat response without posting.
      const reg      = loadRegistry();
      const cronJobs = loadCronJobs();
      const content  = buildHeartbeatResponse(reg, cronJobs);
      console.log('--- DEGRADED HEARTBEAT RESPONSE (dry run) ---');
      console.log(content);
      console.log('--- length:', content.length, 'chars ---');
      break;
    }

    case 'post-alert': {
      // Manually post a degraded alert to #status-heartbeat (for testing or manual trigger).
      const odinToken = getDiscordToken('default');
      if (!odinToken) { console.error('No Odin token'); process.exit(1); }
      const state    = getDegradedState();
      const reg      = state.reg;
      const cronJobs = state.cronJobs;
      const content  = state.active
        ? buildHeartbeatResponse(reg, cronJobs)
        : '✅ **Odin — All providers healthy.** No degraded mode active.';
      const posted = await postToDiscord(STATUS_HEARTBEAT_CHANNEL, odinToken, content);
      console.log(JSON.stringify({ posted, channelId: STATUS_HEARTBEAT_CHANNEL }));
      break;
    }

    default:
      console.log([
        'Odin Degraded Mode Handler',
        '',
        'Commands:',
        '  check              Exit 0 if healthy, exit 1 if degraded (for bash gate)',
        '  status             Print full degraded state as JSON',
        '  handle-heartbeat   Post deterministic heartbeat to #loki (Loki bot)',
        '  handle-status      Post degraded notice to #status-heartbeat (Odin bot)',
        '  test-discord       Dry-run: print heartbeat response without posting',
        '  post-alert         Manually post alert to #status-heartbeat',
      ].join('\n'));
  }
}
