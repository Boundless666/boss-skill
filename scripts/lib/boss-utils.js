'use strict';

const fs = require('fs');
const path = require('path');

const STAGE_MAP = {
  'prd.md': 1,
  'architecture.md': 1,
  'ui-spec.md': 1,
  'tech-review.md': 2,
  'tasks.md': 2,
  'qa-report.md': 3,
  'deploy-report.md': 4
};

function readExecJson(cwd, feature) {
  const execPath = path.join(cwd, '.boss', feature, '.meta', 'execution.json');
  try {
    const raw = fs.readFileSync(execPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function findActiveFeature(cwd) {
  const bossDir = path.join(cwd, '.boss');
  if (!fs.existsSync(bossDir)) {
    return null;
  }

  let entries;
  try {
    entries = fs.readdirSync(bossDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const execJsonPath = path.join(bossDir, entry.name, '.meta', 'execution.json');
    if (!fs.existsSync(execJsonPath)) continue;

    try {
      const raw = fs.readFileSync(execJsonPath, 'utf8');
      const data = JSON.parse(raw);
      const status = data.status || 'unknown';
      if (status === 'running' || status === 'initialized') {
        return {
          feature: data.feature || entry.name,
          execJsonPath,
          status
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

module.exports = {
  STAGE_MAP,
  readExecJson,
  findActiveFeature,
  writeJson
};
