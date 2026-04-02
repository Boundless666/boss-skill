'use strict';

const fs = require('fs');
const path = require('path');

function run(rawInput) {
  const input = JSON.parse(rawInput);
  const message = input.message || '';
  const notificationType = input.notification_type || '';
  const cwd = input.cwd || '';

  if (!message) return '';

  const bossDir = path.join(cwd, '.boss');
  if (!fs.existsSync(bossDir)) return '';

  let entries;
  try {
    entries = fs.readdirSync(bossDir, { withFileTypes: true });
  } catch {
    return '';
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const execJsonPath = path.join(bossDir, entry.name, '.meta', 'execution.json');
    if (!fs.existsSync(execJsonPath)) continue;

    let data;
    try {
      data = JSON.parse(fs.readFileSync(execJsonPath, 'utf8'));
    } catch {
      continue;
    }

    if (data.status === 'running') {
      const logFile = path.join(bossDir, entry.name, '.meta', 'notifications.jsonl');
      const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

      const logEntry = JSON.stringify({
        timestamp: now,
        type: notificationType,
        message
      });

      try {
        const logDir = path.dirname(logFile);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        fs.appendFileSync(logFile, logEntry + '\n', 'utf8');
      } catch {
      }
      break;
    }
  }

  return '';
}

module.exports = { run };
