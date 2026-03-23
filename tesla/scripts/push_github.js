'use strict';
/**
 * push_github.js
 * GitHub push operations for Tesla exports.
 *
 * Required environment variables:
 *   GITHUB_TOKEN    — personal access token with repo:write scope
 *   GITHUB_USERNAME — GitHub username (used to build remote URL if not overridden)
 *
 * Optional:
 *   GITHUB_REMOTE_ODIN_CORE   — override remote URL for full exports
 *   GITHUB_REMOTE_ODIN_AGENTS — override remote URL for agent exports
 *   GIT_EMAIL                 — git author email (default: tesla@openclaw.local)
 *   GIT_NAME                  — git author name  (default: Tesla Export Bot)
 *
 * NEVER logs or stores the authenticated URL — token stays in memory only.
 */

const { spawnSync } = require('child_process');
const fs            = require('fs');
const path          = require('path');

// ── Git helper ────────────────────────────────────────────────────────────────

/**
 * Run a git command in the given working directory.
 * @returns {{ ok, stdout, stderr, code }}
 */
function git(args, cwd, extraEnv) {
  extraEnv = extraEnv || {};
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout:  90_000,
    env:      Object.assign({}, process.env, extraEnv),
  });
  return {
    ok:     result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    code:   result.status,
  };
}

// ── Remote URL resolution ──────────────────────────────────────────────────────

/**
 * Resolve the public (non-authenticated) remote URL for a target.
 * Priority: env var override → construct from GITHUB_USERNAME + template.
 *
 * @param {object} target - entry from github_targets.json
 * @returns {string}      - public https URL (no token)
 * @throws if neither override nor GITHUB_USERNAME is set
 */
function resolvePublicUrl(target) {
  const envOverride = target.remote_env_var && process.env[target.remote_env_var];
  if (envOverride) return envOverride;

  const username = process.env.GITHUB_USERNAME;
  if (!username) {
    throw new Error(
      'GITHUB_USERNAME is not set and no remote URL override found. ' +
      `Set GITHUB_USERNAME or ${target.remote_env_var}.`
    );
  }

  return target.remote_template.replace('{GITHUB_USERNAME}', username);
}

/**
 * Embed GITHUB_TOKEN into a URL for authenticated push.
 * The returned string must NEVER be logged.
 *
 * @param {string} publicUrl
 * @returns {string}
 */
function buildAuthUrl(publicUrl) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is not set. Cannot push to GitHub.');
  }
  return publicUrl.replace('https://', `https://${token}@`);
}

// ── Push orchestration ────────────────────────────────────────────────────────

/**
 * Initialise an export directory as a git repo and push it to GitHub.
 *
 * @param {string}  exportDir  - prepared export directory (sanitized + validated)
 * @param {object}  target     - entry from github_targets.json
 * @param {string}  branch     - resolved branch name
 * @param {string}  commitMsg  - commit message
 * @param {boolean} dryRun     - if true, commit locally but skip push
 * @returns {{
 *   ok:         boolean,
 *   commitHash: string|null,
 *   branch:     string,
 *   remote:     string|null,
 *   dryRun:     boolean,
 *   stdout:     string,
 *   stderr:     string,
 * }}
 */
function pushToGitHub(exportDir, target, branch, commitMsg, dryRun) {
  dryRun = dryRun === true;

  // ── 1. git init ────────────────────────────────────────────────────────
  let r = git(['init'], exportDir);
  if (!r.ok) return fail(`git init failed: ${r.stderr}`);

  // ── 2. Configure identity ──────────────────────────────────────────────
  const email = process.env.GIT_EMAIL || 'tesla@openclaw.local';
  const name  = process.env.GIT_NAME  || 'Tesla Export Bot';
  git(['config', 'user.email', email], exportDir);
  git(['config', 'user.name',  name],  exportDir);

  // ── 3. Create branch ──────────────────────────────────────────────────
  r = git(['checkout', '-b', branch], exportDir);
  if (!r.ok) return fail(`branch creation failed: ${r.stderr}`);

  // ── 4. Stage all files ────────────────────────────────────────────────
  r = git(['add', '--all'], exportDir);
  if (!r.ok) return fail(`git add failed: ${r.stderr}`);

  // ── 5. Commit ─────────────────────────────────────────────────────────
  r = git(['commit', '--message', commitMsg], exportDir);
  if (!r.ok) {
    // Allow empty commits for dry-run verification
    r = git(['commit', '--allow-empty', '--message', commitMsg], exportDir);
    if (!r.ok) return fail(`git commit failed: ${r.stderr}`);
  }

  const hashResult = git(['rev-parse', 'HEAD'], exportDir);
  const commitHash = hashResult.ok ? hashResult.stdout : null;

  if (dryRun) {
    return { ok: true, commitHash, branch, remote: null, dryRun: true, stdout: 'Dry run — push skipped', stderr: '' };
  }

  // ── 6. Resolve remote & push ───────────────────────────────────────────
  let publicUrl;
  try {
    publicUrl = resolvePublicUrl(target);
  } catch (err) {
    return fail(err.message);
  }

  let authUrl;
  try {
    authUrl = buildAuthUrl(publicUrl);
  } catch (err) {
    return fail(err.message);
  }

  r = git(['remote', 'add', 'origin', authUrl], exportDir);
  if (!r.ok && !r.stderr.includes('already exists')) {
    return fail(`git remote add failed: ${r.stderr}`);
  }

  r = git(['push', '--force', 'origin', `HEAD:${branch}`], exportDir);

  // ── 7. Return (never expose auth URL) ─────────────────────────────────
  return {
    ok:         r.ok,
    commitHash,
    branch,
    remote:     publicUrl,   // safe: no token
    dryRun:     false,
    stdout:     r.stdout,
    stderr:     r.ok ? '' : r.stderr,
  };
}

function fail(msg) {
  return { ok: false, commitHash: null, branch: null, remote: null, dryRun: false, stdout: '', stderr: msg };
}

module.exports = { pushToGitHub, resolvePublicUrl };
