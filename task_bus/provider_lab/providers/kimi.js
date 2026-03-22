'use strict';
/**
 * kimi.js
 * Provider adapter for Moonshot AI's Kimi models.
 *
 * API: OpenAI-compatible  →  https://platform.moonshot.cn/docs/api-reference
 * Endpoint: https://api.moonshot.cn/v1/chat/completions
 *
 * Models:
 *   moonshot-v1-8k   — 8k context, fast
 *   moonshot-v1-32k  — 32k context, standard
 *   moonshot-v1-128k — 128k context, large
 *
 * Required env var: KIMI_API_KEY  (or MOONSHOT_API_KEY as alias)
 */

const { post, parseCompletion } = require('./http_client');

const PROVIDER_ID = 'kimi';
const HOSTNAME    = 'api.moonshot.cn';
const API_PATH    = '/v1/chat/completions';
const DEFAULT_MODEL = 'moonshot-v1-8k';

/**
 * Resolve API key from environment.
 * @returns {string|null}
 */
function getApiKey() {
  return process.env.KIMI_API_KEY
      || process.env.MOONSHOT_API_KEY
      || null;
}

/**
 * Call the Kimi API with a single user message.
 *
 * @param {string} message    — user prompt
 * @param {object} [opts]
 * @param {string} [opts.model]        — override default model
 * @param {number} [opts.max_tokens]   — max completion tokens (default 2048)
 * @param {number} [opts.temperature]  — sampling temperature (default 0.7)
 * @param {number} [opts.timeout_ms]   — HTTP timeout override
 * @returns {Promise<BenchResult>}
 */
async function call(message, opts = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      `${PROVIDER_ID}: API key not found. ` +
      'Set KIMI_API_KEY or MOONSHOT_API_KEY environment variable.'
    );
  }

  const model = opts.model || DEFAULT_MODEL;

  const requestBody = {
    model,
    messages: [{ role: 'user', content: message }],
    max_tokens:  opts.max_tokens  ?? 2048,
    temperature: opts.temperature ?? 0.7,
  };

  const startMs   = Date.now();
  const response  = await post({
    hostname: HOSTNAME,
    path:     API_PATH,
    apiKey,
    body:     requestBody,
    timeout:  opts.timeout_ms ?? 90_000,
  });
  const latency_ms = Date.now() - startMs;

  const { content, usage, finish_reason, response_model } = parseCompletion(response);

  return {
    provider:     PROVIDER_ID,
    model:        response_model || model,
    latency_ms,
    token_count: {
      prompt:     usage.prompt,
      completion: usage.completion,
      total:      usage.total,
    },
    finish_reason,
    result:       content,
  };
}

/**
 * Return provider metadata (no API calls).
 */
function info() {
  return {
    id:           PROVIDER_ID,
    name:         'Moonshot AI (Kimi)',
    hostname:     HOSTNAME,
    default_model: DEFAULT_MODEL,
    models:       ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    api_key_env:  ['KIMI_API_KEY', 'MOONSHOT_API_KEY'],
    available:    !!getApiKey(),
  };
}

module.exports = { call, info, PROVIDER_ID, DEFAULT_MODEL };
