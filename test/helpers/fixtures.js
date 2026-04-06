'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function createTempBossDir(feature, execData) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-test-'));
  const metaDir = path.join(tmpDir, '.boss', feature, '.meta');
  fs.mkdirSync(metaDir, { recursive: true });

  if (execData) {
    fs.writeFileSync(
      path.join(metaDir, 'execution.json'),
      JSON.stringify(execData, null, 2) + '\n',
      'utf8'
    );
  }

  return tmpDir;
}

function createExecData(overrides) {
  return {
    feature: 'test-feature',
    status: 'running',
    version: '3.2.0',
    stages: {
      '1': { name: 'Planning', status: 'completed', artifacts: [] },
      '2': { name: 'Review', status: 'running', artifacts: [] },
      '3': { name: 'Development', status: 'pending', artifacts: [] },
      '4': { name: 'Deployment', status: 'pending', artifacts: [] }
    },
    ...overrides
  };
}

function cleanupTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { createTempBossDir, createExecData, cleanupTempDir };
