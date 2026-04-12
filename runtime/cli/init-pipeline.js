#!/usr/bin/env node
'use strict';

const runtime = require('./lib/pipeline-runtime');

const [feature] = process.argv.slice(2);
if (!feature || feature === '-h' || feature === '--help') {
  process.stderr.write('用法: init-pipeline.js <feature>\n');
  process.exit(feature ? 0 : 1);
}

try {
  const execution = runtime.initPipeline(feature);
  process.stdout.write(JSON.stringify({ feature: execution.feature, status: execution.status }) + '\n');
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
}
