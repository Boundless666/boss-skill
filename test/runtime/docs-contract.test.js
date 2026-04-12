'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('runtime docs contract', () => {
  it('describes evaluateGates as an event-sourced state transition', () => {
    const contract = read('docs/runtime-contract.md');

    assert.match(contract, /evaluateGates/);
    assert.match(contract, /GateEvaluated/);
    assert.match(contract, /read model/i);
    assert.doesNotMatch(contract, /evaluateGates[\s\S]*does not write state itself/i);
  });

  it('documents the phase-2 runtime CLI and shell compatibility surface', () => {
    const contract = read('docs/runtime-contract.md');
    const skill = read('SKILL.md');
    const readme = read('README.md');

    for (const command of [
      'init-pipeline.js',
      'get-ready-artifacts.js',
      'record-artifact.js',
      'update-stage.js',
      'update-agent.js',
      'evaluate-gates.js'
    ]) {
      assert.match(contract, new RegExp(command.replace('.', '\\.')));
    }

    assert.match(skill, /查询 ready artifacts/);
    assert.match(skill, /scripts\/harness\/check-artifact\.sh/);
    assert.match(skill, /runtime\/cli\/get-ready-artifacts\.js/);

    assert.match(readme, /canonical surface/);
    assert.match(readme, /runtime\/cli\/init-pipeline\.js/);
    assert.match(readme, /runtime\/cli\/get-ready-artifacts\.js/);
    assert.match(readme, /runtime\/cli\/record-artifact\.js/);
    assert.match(readme, /runtime\/cli\/update-stage\.js/);
    assert.match(readme, /runtime\/cli\/update-agent\.js/);
    assert.match(readme, /runtime\/cli\/evaluate-gates\.js/);
  });

  it('documents pack and plugin hook runtime events as structured state truth', () => {
    const contract = read('docs/runtime-contract.md');
    const skill = read('SKILL.md');
    const readme = read('README.md');

    assert.match(contract, /PackApplied/);
    assert.match(contract, /PluginHookExecuted/);
    assert.match(contract, /PluginHookFailed/);

    assert.match(readme, /PackApplied/);
    assert.match(readme, /PluginHookExecuted/);
    assert.match(readme, /run-plugin-hook\.js/);

    assert.match(skill, /runtime\/cli\/run-plugin-hook\.js/);
  });

  it('documents inspection CLIs as the phase-4 troubleshooting surface', () => {
    const contract = read('docs/runtime-contract.md');
    const readme = read('README.md');

    assert.match(contract, /inspect-pipeline\.js/);
    assert.match(contract, /inspect-events\.js/);
    assert.match(contract, /inspect-progress\.js/);
    assert.match(contract, /inspect-plugins\.js/);
    assert.match(contract, /check-stage\.js/);
    assert.match(contract, /replay-events\.js/);

    assert.match(readme, /inspect-pipeline\.js/);
    assert.match(readme, /inspect-events\.js/);
    assert.match(readme, /inspect-progress\.js/);
    assert.match(readme, /inspect-plugins\.js/);
    assert.match(readme, /check-stage\.js/);
    assert.match(readme, /replay-events\.js/);
  });

  it('documents runtime report generation as the phase-4 summary surface', () => {
    const contract = read('docs/runtime-contract.md');
    const readme = read('README.md');

    assert.match(contract, /generate-summary\.js/);
    assert.match(contract, /summary-model\.js/);
    assert.match(contract, /render-markdown\.js/);
    assert.match(contract, /render-json\.js/);
    assert.match(contract, /render-html\.js/);
    assert.match(contract, /render-diagnostics\.js/);

    assert.match(readme, /generate-summary\.js/);
    assert.match(readme, /summary-model\.js/);
    assert.match(readme, /render-diagnostics\.js/);
  });
});
