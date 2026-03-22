'use strict';
/**
 * http_client.js
 * Shared HTTPS POST helper for OpenAI-compatible provider APIs.
 * Zero external dependencies — uses Node's built-in https module.
 */

const https = require('https');

const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * POST JSON to an OpenAI-compatible chat completions endpoint.
 *
 * @param {object} opts
 * @param {string}  opts.hostname   — e.g. 'api.moonshot.cn'
 * @param {string}  opts.path       — e.g. '/v1/chat/completions'
 * @param {string}  opts.apiKey     — Bearer token
 * @param {object}  opts.body       — request payload (will be JSON-stringified)
 * @param {number}  [opts.timeout]  — ms before aborting (default 90s)
 * @returns {Promise<object>}       — parsed response JSON
 */
function post(opts) {
  const { hostname, path, apiKey, body, timeout = DEFAULT_TIMEOUT_MS } = opts;
  const raw = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'Authorization':  `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(raw),
          'User-Agent':     'openclaw-task-bus/1.0',
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (_) {
            return reject(new Error(
              `Non-JSON response (HTTP ${res.statusCode}): ${data.slice(0, 300)}`
            ));
          }

          if (res.statusCode >= 400) {
            const msg = parsed?.error?.message || JSON.stringify(parsed).slice(0, 200);
            return reject(new Error(`HTTP ${res.statusCode}: ${msg}`));
          }

          resolve(parsed);
        });
      }
    );

    req.setTimeout(timeout, () => {
      req.destroy(new Error(`Request to ${hostname} timed out after ${timeout}ms`));
    });

    req.on('error', reject);
    req.write(raw);
    req.end();
  });
}

/**
 * Extract standardised fields from an OpenAI-compatible chat completion response.
 * Returns { content, usage: { prompt, completion, total } }.
 */
function parseCompletion(response) {
  const content = response?.choices?.[0]?.message?.content ?? '';
  const usage   = response?.usage ?? {};
  return {
    content,
    usage: {
      prompt:     usage.prompt_tokens     ?? 0,
      completion: usage.completion_tokens ?? 0,
      total:      usage.total_tokens      ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
    },
    finish_reason: response?.choices?.[0]?.finish_reason ?? null,
    response_model: response?.model ?? null,
  };
}

module.exports = { post, parseCompletion };
