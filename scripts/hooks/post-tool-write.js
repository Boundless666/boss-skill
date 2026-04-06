'use strict';

const fs = require('fs');
const path = require('path');
const { STAGE_MAP, writeJson } = require('../lib/boss-utils');
const { emitProgress } = require('../lib/progress-emitter');

function run(rawInput) {
  const input = JSON.parse(rawInput);
  const filePath = (input.tool_input || {}).file_path || '';
  const cwd = input.cwd || '';

  if (!filePath) return '';

  if (!filePath.includes('.boss/')) return '';

  const match = filePath.match(/\.boss\/([^/]+)\//);
  const artifact = path.basename(filePath);

  if (!match || !artifact) return '';

  if (artifact === 'execution.json' || artifact === 'summary-report.md' || artifact === 'summary-report.json') {
    return '';
  }

  const feature = match[1];
  const execJsonPath = path.join(cwd, '.boss', feature, '.meta', 'execution.json');

  if (!fs.existsSync(execJsonPath)) return '';

  const stage = STAGE_MAP[artifact];
  if (stage === undefined) return '';

  let data;
  try {
    data = JSON.parse(fs.readFileSync(execJsonPath, 'utf8'));
  } catch (err) {
    process.stderr.write('[boss-skill] post-tool-write/readExecJson: ' + err.message + '\n');
    return '';
  }

  const stages = data.stages || {};
  const stageData = stages[String(stage)] || {};
  const artifacts = stageData.artifacts || [];

  if (artifacts.includes(artifact)) return '';

  artifacts.push(artifact);
  const uniqueArtifacts = [...new Set(artifacts)];

  if (!data.stages) data.stages = {};
  if (!data.stages[String(stage)]) data.stages[String(stage)] = {};
  data.stages[String(stage)].artifacts = uniqueArtifacts;

  writeJson(execJsonPath, data);

  // 进度事件
  emitProgress(cwd, feature, {
    type: 'artifact-written',
    data: { artifact, stage }
  });

  // 事件溯源：追加 ArtifactRecorded 事件
  const eventsPath = path.join(cwd, '.boss', feature, '.meta', 'events.jsonl');
  try {
    let eventId = 1;
    if (fs.existsSync(eventsPath)) {
      const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean);
      eventId = lines.length + 1;
    }
    const event = JSON.stringify({
      id: eventId,
      type: 'ArtifactRecorded',
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      data: { artifact, stage }
    });
    fs.appendFileSync(eventsPath, event + '\n', 'utf8');
  } catch (err) {
    process.stderr.write('[boss-skill] post-tool-write/appendEvent: ' + err.message + '\n');
  }

  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `[Harness] 产物 ${artifact} 已自动记录到阶段 ${stage}`
    }
  });
}

module.exports = { run };
