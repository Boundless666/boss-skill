'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('node:child_process');
const runtime = require('../../runtime/cli/lib/pipeline-runtime');

describe('evaluateGates', () => {
  let tmpDir;
  let cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-gate-cli-'));
    cwd = process.cwd();
    process.chdir(tmpDir);
    runtime.initPipeline('test-feat', { cwd: tmpDir });
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns gate result data and materializes qualityGates', () => {
    const result = runtime.evaluateGates('test-feat', 'gate1', { cwd: tmpDir });
    assert.equal(typeof result.passed, 'boolean');
    assert.equal(Array.isArray(result.checks), true);
    assert.equal(result.execution.qualityGates.gate1.status, 'completed');
  });

  it('resolves plugin gates from cwd-local harness/plugins', () => {
    const pluginDir = path.join(tmpDir, 'harness', 'plugins', 'local-gate');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'gate.sh'), '#!/bin/bash\necho "[]"\nexit 0\n', 'utf8');
    fs.chmodSync(path.join(pluginDir, 'gate.sh'), 0o755);

    const result = runtime.evaluateGates('test-feat', 'local-gate', { cwd: tmpDir });
    assert.equal(result.passed, true);
    assert.equal(result.execution.qualityGates['local-gate'].status, 'completed');
  });

  it('dry-run does not append gate results', () => {
    const result = runtime.evaluateGates('test-feat', 'gate1', { cwd: tmpDir, dryRun: true });
    assert.equal(typeof result.passed, 'boolean');

    const executionPath = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json');
    const execution = JSON.parse(fs.readFileSync(executionPath, 'utf8'));
    assert.equal(execution.qualityGates.gate1.status, 'pending');

    const eventsPath = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl');
    const events = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const hasGateEvaluated = events.some(event => event.type === 'GateEvaluated');
    assert.equal(hasGateEvaluated, false);
  });

  it('skip-on-error ignores missing gates', () => {
    const result = runtime.evaluateGates('test-feat', 'missing-gate', { cwd: tmpDir, skipOnError: true });
    assert.equal(result.skipped, true);
    assert.equal(result.passed, true);

    const executionPath = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json');
    const execution = JSON.parse(fs.readFileSync(executionPath, 'utf8'));
    assert.equal(execution.qualityGates['missing-gate'], undefined);
  });

  it('returns non-zero exit for failing gate via gate-runner', () => {
    const pluginDir = path.join(tmpDir, 'harness', 'plugins', 'fail-gate');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'gate.sh'), '#!/bin/bash\necho "[]"\nexit 1\n', 'utf8');
    fs.chmodSync(path.join(pluginDir, 'gate.sh'), 0o755);

    const gateRunner = path.join(__dirname, '..', '..', 'scripts', 'gates', 'gate-runner.sh');
    const result = spawnSync('bash', [gateRunner, 'test-feat', 'fail-gate'], { cwd: tmpDir, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
  });

  it('uses cwd-local plugin stage metadata when materializing gate results', () => {
    const pluginDir = path.join(tmpDir, 'harness', 'plugins', 'stage-gate');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'gate.sh'), '#!/bin/bash\necho "[]"\nexit 0\n', 'utf8');
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), '{ "stages": [2] }\n', 'utf8');
    fs.chmodSync(path.join(pluginDir, 'gate.sh'), 0o755);

    const result = runtime.evaluateGates('test-feat', 'stage-gate', { cwd: tmpDir });
    assert.equal(result.execution.stages['2'].gateResults['stage-gate'].passed, true);
    assert.equal(result.execution.stages['3'].gateResults['stage-gate'], undefined);
  });

  it('reports missing args at shell boundary for gate-runner', () => {
    const gateRunner = path.join(__dirname, '..', '..', 'scripts', 'gates', 'gate-runner.sh');
    const result = spawnSync('bash', [gateRunner], { cwd: tmpDir, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /evaluate-gates\.js/);
  });

  it('records stderr-only gate checks', () => {
    const pluginDir = path.join(tmpDir, 'harness', 'plugins', 'stderr-gate');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'gate.sh'),
      '#!/bin/bash\necho "[{\\"name\\":\\"stderr-only\\",\\"passed\\":true}]" 1>&2\nexit 0\n',
      'utf8'
    );
    fs.chmodSync(path.join(pluginDir, 'gate.sh'), 0o755);

    const result = runtime.evaluateGates('test-feat', 'stderr-gate', { cwd: tmpDir });
    assert.equal(result.execution.qualityGates['stderr-gate'].checks[0].name, 'stderr-only');
  });

  it('falls back to stage 3 when plugin stage metadata is invalid', () => {
    const pluginDir = path.join(tmpDir, 'harness', 'plugins', 'bad-stage-gate');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'gate.sh'), '#!/bin/bash\necho "[]"\nexit 0\n', 'utf8');
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), '{ "stages": [9] }\n', 'utf8');
    fs.chmodSync(path.join(pluginDir, 'gate.sh'), 0o755);

    const result = runtime.evaluateGates('test-feat', 'bad-stage-gate', { cwd: tmpDir });
    assert.equal(result.execution.stages['3'].gateResults['bad-stage-gate'].passed, true);
  });

  it('falls back to repo-root plugins when cwd-local plugin is missing', () => {
    const repoPluginDir = path.join(__dirname, '..', '..', 'harness', 'plugins', 'repo-gate');
    fs.mkdirSync(repoPluginDir, { recursive: true });
    fs.writeFileSync(path.join(repoPluginDir, 'gate.sh'), '#!/bin/bash\necho "[]"\nexit 0\n', 'utf8');
    fs.chmodSync(path.join(repoPluginDir, 'gate.sh'), 0o755);

    try {
      const result = runtime.evaluateGates('test-feat', 'repo-gate', { cwd: tmpDir });
      assert.equal(result.passed, true);
    } finally {
      fs.rmSync(repoPluginDir, { recursive: true, force: true });
    }
  });
});
