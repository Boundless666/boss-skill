'use strict';

const fs = require('fs');
const path = require('path');

function run(rawInput) {
  const input = JSON.parse(rawInput);
  const cwd = input.cwd || '';

  if (!cwd) return '';

  const bossDir = path.join(cwd, '.boss');
  if (!fs.existsSync(bossDir)) return '';

  let entries;
  try {
    entries = fs.readdirSync(bossDir, { withFileTypes: true });
  } catch (err) {
    process.stderr.write('[boss-skill] session-resume/readdirSync: ' + err.message + '\n');
    return '';
  }

  let pendingFeatures = '';

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const execJsonPath = path.join(bossDir, entry.name, '.meta', 'execution.json');
    if (!fs.existsSync(execJsonPath)) continue;

    let data;
    try {
      data = JSON.parse(fs.readFileSync(execJsonPath, 'utf8'));
    } catch (err) {
      process.stderr.write('[boss-skill] session-resume/readExecJson: ' + err.message + '\n');
      continue;
    }

    const status = data.status || 'unknown';
    const feature = data.feature || entry.name;

    if (status === 'running' || status === 'initialized' || status === 'failed') {
      let nextStage = 'done';
      const stages = data.stages || {};
      for (let s = 1; s <= 4; s++) {
        const sStatus = (stages[String(s)] || {}).status || 'unknown';
        if (sStatus === 'pending' || sStatus === 'running' || sStatus === 'failed') {
          nextStage = String(s);
          break;
        }
      }
      pendingFeatures += `  - ${feature} (status: ${status}, next stage: ${nextStage})\n`;
    }
  }

  if (!pendingFeatures) return '';

  let context = `[Boss Harness] Session resumed. Unfinished pipelines:\n${pendingFeatures}`;
  context += '\nUse /boss <feature> --continue-from <stage> to resume.';

  const sessionStatePath = path.join(cwd, '.boss', '.session-state.json');
  let previousSession = null;
  if (fs.existsSync(sessionStatePath)) {
    try {
      previousSession = JSON.parse(fs.readFileSync(sessionStatePath, 'utf8'));
      context += '\n[Boss Harness] Previous session state loaded';
    } catch (err) {
      process.stderr.write('[boss-skill] session-resume/readSessionState: ' + err.message + '\n');
    }
  }

  const result = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context
    }
  };

  if (previousSession) {
    result.hookSpecificOutput.previousSessionState = previousSession;
  }

  return JSON.stringify(result);
}

module.exports = { run };
