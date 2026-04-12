'use strict';

const fs = require('fs');
const path = require('path');
const { STAGE_MAP } = require('../lib/boss-utils');
const { emitProgress } = require('../lib/progress-emitter');
const runtime = require('../../runtime/cli/lib/pipeline-runtime');

function hasArtifactInEventLog(eventsPath, artifact, stage) {
  if (!fs.existsSync(eventsPath)) return false;

  try {
    const lines = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean);
    return lines.some(line => {
      const event = JSON.parse(line);
      if (event.type === 'ArtifactRecorded' && event.data) {
        return event.data.artifact === artifact && String(event.data.stage) === String(stage);
      }

      if (event.type === 'PipelineInitialized' && event.data && event.data.initialState) {
        const stages = event.data.initialState.stages || {};
        const artifacts = ((stages[String(stage)] || {}).artifacts) || [];
        return artifacts.includes(artifact);
      }

      return false;
    });
  } catch (err) {
    process.stderr.write('[boss-skill] post-tool-write/readEvents: ' + err.message + '\n');
    return false;
  }
}

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
  const eventsPath = path.join(cwd, '.boss', feature, '.meta', 'events.jsonl');

  if (!fs.existsSync(execJsonPath)) return '';

  const stage = STAGE_MAP[artifact];
  if (stage === undefined) return '';

  if (hasArtifactInEventLog(eventsPath, artifact, stage)) return '';

  // 进度事件
  emitProgress(cwd, feature, {
    type: 'artifact-written',
    data: { artifact, stage }
  });

  try {
    runtime.recordArtifact(feature, artifact, stage, { cwd });
  } catch (err) {
    process.stderr.write('[boss-skill] post-tool-write/materialize: ' + err.message + '\n');
    return '';
  }

  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `[Harness] 产物 ${artifact} 已通过事件记录到阶段 ${stage}`
    }
  });
}

module.exports = { run };
