'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const GET_READY_ARTIFACTS_CLI = path.join(__dirname, '..', '..', 'runtime', 'cli', 'get-ready-artifacts.js');
const DAG_PATH = path.join(__dirname, '..', '..', 'harness', 'artifact-dag.json');

describe('artifact-dag', () => {
  let tmpDir;
  let origCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-dag-'));
    origCwd = process.cwd();
    process.chdir(tmpDir);

    const metaDir = path.join(tmpDir, '.boss', 'test-feat', '.meta');
    fs.mkdirSync(metaDir, { recursive: true });

    const initState = {
      schemaVersion: '0.2.0',
      feature: 'test-feat',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      status: 'running',
      parameters: { skipUI: false, skipDeploy: false },
      stages: {
        '1': { name: 'planning', status: 'pending', startTime: null, endTime: null, retryCount: 0, maxRetries: 2, failureReason: null, artifacts: [], gateResults: {} },
        '2': { name: 'review', status: 'pending', startTime: null, endTime: null, retryCount: 0, maxRetries: 2, failureReason: null, artifacts: [], gateResults: {} },
        '3': { name: 'development', status: 'pending', startTime: null, endTime: null, retryCount: 0, maxRetries: 2, failureReason: null, artifacts: [], gateResults: {} },
        '4': { name: 'deployment', status: 'pending', startTime: null, endTime: null, retryCount: 0, maxRetries: 2, failureReason: null, artifacts: [], gateResults: {} }
      },
      qualityGates: {
        gate0: { status: 'pending', passed: null, checks: [], executedAt: null },
        gate1: { status: 'pending', passed: null, checks: [], executedAt: null },
        gate2: { status: 'pending', passed: null, checks: [], executedAt: null }
      },
      metrics: { totalDuration: null, stageTimings: {}, gatePassRate: null, retryTotal: 0 },
      plugins: [],
      humanInterventions: [],
      revisionRequests: [],
      feedbackLoops: { maxRounds: 2, currentRound: 0 }
    };

    fs.writeFileSync(path.join(metaDir, 'execution.json'), JSON.stringify(initState, null, 2), 'utf8');
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runCli(args) {
    try {
      return execFileSync('node', [GET_READY_ARTIFACTS_CLI, ...args], {
        encoding: 'utf8',
        cwd: tmpDir,
        env: { ...process.env, PATH: process.env.PATH }
      }).trim();
    } catch (err) {
      if (err.status !== 0) throw new Error(err.stderr || err.message);
      return err.stdout ? err.stdout.trim() : '';
    }
  }

  it('DAG file is valid JSON with expected structure', () => {
    const dag = JSON.parse(fs.readFileSync(DAG_PATH, 'utf8'));
    assert.ok(dag.artifacts);
    assert.ok(dag.artifacts['prd.md']);
    assert.ok(dag.artifacts['architecture.md']);
    assert.ok(dag.artifacts['qa-report.md']);
    assert.deepEqual(dag.artifacts['prd.md'].inputs, ['design-brief']);
    assert.deepEqual(dag.artifacts['architecture.md'].inputs, ['prd.md']);
  });

  it('detects no circular dependencies in default DAG', () => {
    const dag = JSON.parse(fs.readFileSync(DAG_PATH, 'utf8'));
    // Simple topological sort to check for cycles
    const visited = new Set();
    const visiting = new Set();

    function visit(name) {
      if (visiting.has(name)) return false; // cycle!
      if (visited.has(name)) return true;
      visiting.add(name);
      const def = dag.artifacts[name];
      if (def && def.inputs) {
        for (const input of def.inputs) {
          if (dag.artifacts[input] && !visit(input)) return false;
        }
      }
      visiting.delete(name);
      visited.add(name);
      return true;
    }

    for (const name of Object.keys(dag.artifacts)) {
      assert.ok(visit(name), `Circular dependency detected involving ${name}`);
    }
  });

  it('--ready returns prd.md initially (design-brief is optional)', () => {
    const output = runCli(['test-feat', '--ready', '--dag', DAG_PATH, '--json']);
    const ready = JSON.parse(output);
    assert.ok(ready.includes('prd.md'), 'prd.md should be ready initially');
  });

  it('--ready returns architecture.md and ui-spec.md after prd.md done', () => {
    // Add prd.md to completed artifacts
    const execPath = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json');
    const data = JSON.parse(fs.readFileSync(execPath, 'utf8'));
    data.stages['1'].artifacts = ['prd.md'];
    fs.writeFileSync(execPath, JSON.stringify(data, null, 2), 'utf8');

    const output = runCli(['test-feat', '--ready', '--dag', DAG_PATH, '--json']);
    const ready = JSON.parse(output);
    assert.ok(ready.includes('architecture.md'));
    assert.ok(ready.includes('ui-spec.md'));
    assert.ok(!ready.includes('prd.md'), 'prd.md should not be in ready list (already done)');
  });

  it('--can-start checks dependency satisfaction', () => {
    // architecture.md depends on prd.md, which is not done
    assert.throws(() => {
      runCli(['test-feat', 'architecture.md', '--can-start', '--dag', DAG_PATH]);
    }, /缺少依赖/);
  });

  it('--can-start succeeds when dependencies are met', () => {
    const execPath = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json');
    const data = JSON.parse(fs.readFileSync(execPath, 'utf8'));
    data.stages['1'].artifacts = ['prd.md'];
    fs.writeFileSync(execPath, JSON.stringify(data, null, 2), 'utf8');

    const output = runCli(['test-feat', 'architecture.md', '--can-start', '--dag', DAG_PATH]);
    assert.ok(output.includes('可以开始'));
  });

  it('skips ui-spec.md when skipUI is true', () => {
    const execPath = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json');
    const data = JSON.parse(fs.readFileSync(execPath, 'utf8'));
    data.parameters.skipUI = true;
    data.stages['1'].artifacts = ['prd.md'];
    fs.writeFileSync(execPath, JSON.stringify(data, null, 2), 'utf8');

    const output = runCli(['test-feat', '--ready', '--dag', DAG_PATH, '--json']);
    const ready = JSON.parse(output);
    assert.ok(!ready.includes('ui-spec.md'), 'ui-spec.md should be skipped');
    assert.ok(ready.includes('architecture.md'));
  });
});
