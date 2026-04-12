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
      'runtime/cli/lib/pipeline-runtime.js',
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

  it('keeps runtime-first writer paths free of shell wrapper orchestration', () => {
    const runtimeFirstFiles = [
      'scripts/hooks/post-tool-write.js',
      'runtime/cli/lib/pipeline-runtime.js',
      'scripts/hooks/subagent-start.js',
      'scripts/hooks/subagent-stop.js'
    ];

    const wrapperPatterns = [
      /append-event\.sh/,
      /materialize-state\.sh/,
      /update-stage\.sh/,
      /update-agent\.sh/
    ];

    for (const relativePath of runtimeFirstFiles) {
      const source = read(relativePath);
      for (const pattern of wrapperPatterns) {
        assert.doesNotMatch(
          source,
          pattern,
          `${relativePath} should use runtime APIs directly instead of shell wrappers`
        );
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
  });
});
