#!/usr/bin/env node
'use strict';

const runtime = require('./lib/pipeline-runtime');

const [feature, artifact, stage] = process.argv.slice(2);
if (!feature || !artifact || !stage || stage === '-h' || stage === '--help') {
  process.stderr.write('用法: record-artifact.js <feature> <artifact> <stage>\n');
  process.exit(feature && artifact && stage ? 0 : 1);
}

try {
  const execution = runtime.recordArtifact(feature, artifact, Number(stage));
  const stageKey = String(stage);
  const artifacts = execution.stages && execution.stages[stageKey] ? execution.stages[stageKey].artifacts : [];
  process.stdout.write(JSON.stringify({ stage: stageKey, artifacts }) + '\n');
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
}
