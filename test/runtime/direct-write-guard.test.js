'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('phase-1 direct-write guard', () => {
  it('keeps critical writer paths free of direct execution.json mutations', () => {
    const criticalFiles = [
      'scripts/hooks/post-tool-write.js',
      'scripts/gates/gate-runner.sh',
      'runtime/cli/evaluate-gates.js',
      'runtime/cli/register-plugins.js',
      'scripts/harness/load-plugins.sh'
    ];

    const forbiddenPatterns = [
      /writeFileSync\([^\n]*execution\.json/,
      /appendFileSync\([^\n]*execution\.json/,
      /jq[^\n]*execution\.json/,
      /\b(?:cat|echo|printf|jq)[^\n>]*>\s*[^\n]*execution\.json/,
      /\btee\b[^\n]*execution\.json/
    ];

    for (const relativePath of criticalFiles) {
      const source = read(relativePath);
      for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(source, pattern, `${relativePath} should not directly mutate execution.json`);
      }
    }
  });

  it('plugin registration help describes event-sourced read-model semantics', () => {
    const registerPluginsCli = path.join(REPO_ROOT, 'runtime', 'cli', 'register-plugins.js');
    const registerResult = spawnSync('node', [registerPluginsCli, '--help'], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    });
    assert.equal(registerResult.status, 0, registerResult.stderr);
    assert.match(registerResult.stdout, /事件/);
    assert.match(registerResult.stdout, /read model/);

    const loadPluginsWrapper = path.join(REPO_ROOT, 'scripts', 'harness', 'load-plugins.sh');
    const wrapperResult = spawnSync('bash', [loadPluginsWrapper, '--help'], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    });
    assert.equal(wrapperResult.status, 0, wrapperResult.stderr);
    assert.match(wrapperResult.stdout, /事件/);
    assert.match(wrapperResult.stdout, /read model/);
  });
});
