#!/usr/bin/env node
/**
 * Odin Claude Subscription Usage Monitor
 * Fetches usage from claude.ai via Playwright, checks thresholds,
 * and sends Telegram alerts.
 */
import crypto from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Config ──────────────────────────────────────────────────────────────
// Credentials MUST be supplied via environment variables — no hardcoded fallbacks.
// Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in ~/.openclaw-odin/.env
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID   || '';
const STATE_FILE = path.join(os.homedir(), '.openclaw-odin/scripts/usage-monitor-state.json');

// Derive alert label from config/system.json (system_name), env override, or generic fallback.
// This avoids hardcoding the system display name in user-facing alert strings.
function loadSystemName() {
  try {
    const cfgPath = path.join(os.homedir(), '.openclaw-odin', 'config', 'system.json');
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const cfg = JSON.parse(raw);
    return (cfg && cfg.system_name) ? cfg.system_name : 'System';
  } catch (_) {
    return 'System';
  }
}
const SYSTEM_NAME = process.env.SYSTEM_NAME || loadSystemName();

const THRESHOLDS = [50, 75, 90, 95];

// ── Helpers ─────────────────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { sentAlerts: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getHighestThreshold(percent) {
  let highest = null;
  for (const t of THRESHOLDS) {
    if (percent >= t) highest = t;
  }
  return highest;
}

function formatDuration(ms) {
  if (ms <= 0) return 'now';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatResetTime(resetAtISO) {
  const resetDate = new Date(resetAtISO);
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();
  const duration = formatDuration(diffMs);
  const day = resetDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const time = resetDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  return { duration, day, time, resetDate };
}

// ── Decrypt Claude Desktop session key ──────────────────────────────────
function getSessionKey() {
  try {
    const safeStorageKey = execSync(
      'security find-generic-password -s "Claude Safe Storage" -w',
      { encoding: 'utf8' }
    ).trim();
    const key = crypto.pbkdf2Sync(safeStorageKey, 'saltysalt', 1003, 16, 'sha1');
    const dbPath = path.join(os.homedir(), 'Library/Application Support/Claude/Cookies');
    const hexOut = execSync(
      `sqlite3 "${dbPath}" "SELECT hex(encrypted_value) FROM cookies WHERE host_key='.claude.ai' AND name='sessionKey' LIMIT 1;"`,
      { encoding: 'utf8' }
    ).trim();
    if (!hexOut) return null;
    const encrypted = Buffer.from(hexOut, 'hex');
    const version = encrypted.slice(0, 3).toString('utf8');
    if (version !== 'v10' && version !== 'v11') return null;
    const iv = Buffer.alloc(16, ' ');
    const ciphertext = encrypted.slice(3);
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    const raw = decrypted.toString('utf8');
    const match = raw.match(/(sk-ant-sid\d+-[A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  } catch (e) {
    log(`Failed to decrypt session key: ${e.message}`);
    return null;
  }
}

// ── Fetch usage via Playwright ──────────────────────────────────────────
async function fetchUsagePlaywright(sessionKey) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.178 Safari/537.36'
    });
    await context.addCookies([{
      name: 'sessionKey',
      value: sessionKey,
      domain: '.claude.ai',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax'
    }]);

    const page = await context.newPage();

    // First get org ID
    const orgResponse = await page.goto('https://claude.ai/api/organizations', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const orgText = await orgResponse.text();
    let orgs;
    try {
      orgs = JSON.parse(orgText);
    } catch {
      log(`Failed to parse orgs response: ${orgText.substring(0, 200)}`);
      return null;
    }

    const orgId = orgs?.[0]?.uuid;
    if (!orgId) {
      log('No org ID found');
      return null;
    }

    // Then get usage
    const usageResponse = await page.goto(`https://claude.ai/api/organizations/${orgId}/usage`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const usageText = await usageResponse.text();
    let usage;
    try {
      usage = JSON.parse(usageText);
    } catch {
      log(`Failed to parse usage response: ${usageText.substring(0, 200)}`);
      return null;
    }

    return usage;
  } finally {
    await browser.close();
  }
}

// ── Send Telegram message ───────────────────────────────────────────────
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping alert');
    return false;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML'
    })
  });
  const result = await response.json();
  if (!result.ok) {
    log(`Telegram error: ${JSON.stringify(result)}`);
  }
  return result.ok;
}

// ── Build alert messages ────────────────────────────────────────────────
function buildAlertMessage(windowLabel, percent, threshold, resetInfo) {
  const icon = threshold >= 95 ? '\u{1F6A8}' : threshold >= 90 ? '\u{26A0}\u{FE0F}' : threshold >= 75 ? '\u{1F4CA}' : '\u{2139}\u{FE0F}';
  const label = windowLabel === '5h' ? 'Session (5h)' : windowLabel === 'Week' ? 'Weekly (7-day)' : windowLabel;

  let msg = `${icon} <b>${SYSTEM_NAME} Usage Alert</b>\n`;
  msg += `\n<b>${label} limit:</b> ${percent.toFixed(1)}%`;
  msg += `\n<b>Threshold:</b> ${threshold}%`;

  if (threshold >= 95 && resetInfo) {
    const { duration, day, time } = formatResetTime(resetInfo);
    if (windowLabel === '5h') {
      msg += `\n\n<b>Resets in:</b> ${duration}`;
    } else {
      msg += `\n\n<b>Resets in:</b> ${duration}`;
      msg += `\n<b>Reset date:</b> ${day}`;
      msg += `\n<b>Reset time:</b> ${time}`;
    }
  }

  return msg;
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  log('Starting usage check...');

  const sessionKey = getSessionKey();
  if (!sessionKey) {
    log('ERROR: Could not get Claude session key. Is Claude Desktop installed?');
    process.exit(1);
  }
  log('Got session key from Claude Desktop');

  const usage = await fetchUsagePlaywright(sessionKey);
  if (!usage) {
    log('ERROR: Could not fetch usage data');
    process.exit(1);
  }
  log(`Raw usage: ${JSON.stringify(usage)}`);

  const state = loadState();
  const now = Date.now();

  // Process each usage window
  const windows = [];
  if (usage.five_hour?.utilization !== undefined) {
    windows.push({
      label: '5h',
      percent: Math.min(100, Math.max(0, usage.five_hour.utilization)),
      resetAt: usage.five_hour.resets_at
    });
  }
  if (usage.seven_day?.utilization !== undefined) {
    windows.push({
      label: 'Week',
      percent: Math.min(100, Math.max(0, usage.seven_day.utilization)),
      resetAt: usage.seven_day.resets_at
    });
  }

  log(`Windows: ${windows.map(w => `${w.label}=${w.percent.toFixed(1)}%`).join(', ')}`);

  for (const win of windows) {
    const threshold = getHighestThreshold(win.percent);
    if (!threshold) continue;

    const alertKey = `${win.label}:${threshold}`;
    const lastSent = state.sentAlerts[alertKey];

    // Reset alert state if usage dropped below threshold or enough time passed
    // For 5h window: reset after 5 hours. For weekly: reset after 24 hours.
    const resetMs = win.label === '5h' ? 5 * 3600000 : 24 * 3600000;
    const shouldSend = !lastSent || (now - lastSent > resetMs);

    if (shouldSend) {
      const msg = buildAlertMessage(win.label, win.percent, threshold, win.resetAt);
      log(`Sending alert: ${win.label} at ${threshold}% (actual: ${win.percent.toFixed(1)}%)`);
      const sent = await sendTelegram(msg);
      if (sent) {
        state.sentAlerts[alertKey] = now;
        // Clear lower threshold alerts for this window
        for (const t of THRESHOLDS) {
          if (t < threshold) {
            delete state.sentAlerts[`${win.label}:${t}`];
          }
        }
      }
    } else {
      log(`Already sent ${alertKey} alert recently, skipping`);
    }
  }

  // Clean up alerts for windows that dropped below all thresholds
  for (const win of windows) {
    if (win.percent < THRESHOLDS[0]) {
      for (const t of THRESHOLDS) {
        delete state.sentAlerts[`${win.label}:${t}`];
      }
    }
  }

  saveState(state);
  log('Done');
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
