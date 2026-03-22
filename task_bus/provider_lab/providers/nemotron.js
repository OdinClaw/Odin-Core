'use strict';
/**
 * nemotron.js
 * Provider adapter for NVIDIA's Nemotron models via the NVIDIA API Catalog.
 *
 * API: OpenAI-compatible  →  https://docs.api.nvidia.com
 * Endpoint: https://integrate.api.nvidia.com/v1/chat/completions
 *
 * Models:
 *   nvidia/llama-3.1-nemotron-70b-instruct  — flagship, best quality
 *   nvidia/llama-3.1-nemotron-51b-instruct  — mid-tier
 *   nvidia/nemotron-mini-4b-instruct        — lightweight, fast
 *
 * Required env var: NVIDIA_API_KEY  (or NEMOTRON_API_KEY as alias)
 *
 * Free tier available at: https://build.nvidia.com
 */

const { post, parseCompletion } = require('./http_client');

const PROVIDER_ID   = 'nemotron';
const HOSTNAME      = 'integrate.api.nvidia.com';
const API_PATH      = '/v1/chat/completions';
const DEFAULT_MODEL = 'nvidia/llama-3.1-nemotron-70b-instruct';

/**
 * Resolve API key from environment.
 * @returns {string|null}
 */
function getApiKey() {
  return process.env.NVIDIA_API_KEY
      || process.env.NEMOTRON_API_KEY
      || null;
}

/**
 * Call the NVIDIA Nemotron API with a single user message.
 *
 * @param {string} message    — user prompt
 * @param {object} [opts]
 * @param {string} [opts.model]        — override default model
 * @param {number} [opts.max_tokens]   — max completion tokens (default 2048)
 * @param {number} [opts.temperature]  — sampling temperature (default 0.7)
 * @param {boolean}[opts.stream]       — streaming not supported in bench mode (ignored)
 * @param {number} [opts.timeout_ms]   — HTTP timeout override
 * @returns {Promise<BenchResult>}
 */
async function call(message, opts = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      `${PROVIDER_ID}: API key not found. ` +
      'Set NVIDIA_API_KEY or NEMOTRON_API_KEY environment variable.'
    );
  }

  const model = opts.model || DEFAULT_MODEL;

  const requestBody = {
    model,
    messages: [{ role: 'user', content: message }],
    max_tokens:  opts.max_tokens  ?? 2048,
    temperature: opts.temperature ?? 0.7,
    stream:      false,   // bench mode always non-streaming for accurate latency
  };

  const startMs  = Date.now();
  const response = await post({
    hostname: HOSTNAME,
    path:     API_PATH,
    apiKey,
    body:     requestBody,
    timeout:  opts.timeout_ms ?? 90_000,
  });
  const latency_ms = Date.now() - startMs;

  const { content, usage, finish_reason, response_model } = parseCompletion(response);

  return {
    provider:    PROVIDER_ID,
    model:       response_model || model,
    latency_ms,
    token_count: {
      prompt:     usage.prompt,
      completion: usage.completion,
      total:      usage.total,
    },
    finish_reason,
    result:      content,
  };
}

/**
 * Return provider metadata (no API calls).
 */
function info() {
  return {
    id:            PROVIDER_ID,
    name:          'NVIDIA Nemotron',
    hostname:      HOSTNAME,
    default_model: DEFAULT_MODEL,
    models: [
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'nvidia/llama-3.1-nemotron-51b-instruct',
      'nvidia/nemotron-mini-4b-instruct',
    ],
    api_key_env:   ['NVIDIA_API_KEY', 'NEMOTRON_API_KEY'],
    available:     !!getApiKey(),
  };
}

module.exports = { call, info, PROVIDER_ID, DEFAULT_MODEL };
