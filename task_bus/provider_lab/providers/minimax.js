'use strict';

const { post } = require('./http_client');
const { runClaude } = require('./claude');

const HOSTNAME = 'api.minimax.io';
const API_PATH = '/v1/text/chatcompletion_v2';
const MODEL    = 'minimax-m2.7';

async function runMiniMax(messages) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error('MiniMax: MINIMAX_API_KEY not set.');

  const data = await post({
    hostname: HOSTNAME,
    path:     API_PATH,
    apiKey,
    body: { model: MODEL, messages, temperature: 0.7 },
  });

  if (data.base_resp?.status_code !== 0) {
    throw new Error(`MiniMax API error: ${data.base_resp?.status_msg ?? 'Unknown error'}`);
  }

  return data.choices[0].message.content;
}

async function runModel(messages) {
  try {
    return await runMiniMax(messages);
  } catch (err) {
    console.log(`MiniMax failed (${err.message}), falling back to Claude.`);
    return await runClaude(messages);
  }
}

module.exports = { runMiniMax, runModel };
