'use strict';

const fs = require('fs');
const path = require('path');
const { findActiveFeature } = require('../lib/boss-utils');

function run(rawInput) {
  const input = JSON.parse(rawInput);
  const agentType = input.agent_type || '';
  const agentId = input.agent_id || '';
  const lastMsg = (input.last_assistant_message || '').slice(0, 500);
  const cwd = input.cwd || '';

  const active = findActiveFeature(cwd);

  const logDirName = active ? active.feature : '.harness-logs';
  const logDir = path.join(cwd, '.boss', logDirName, '.meta');

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch {
    return '';
  }

  const logFile = path.join(logDir, 'agent-log.jsonl');
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const entry = JSON.stringify({
    timestamp: now,
    agentType,
    agentId,
    event: 'stop',
    summary: lastMsg
  });

  try {
    fs.appendFileSync(logFile, entry + '\n', 'utf8');
  } catch {
  }

  return '';
}

module.exports = { run };
