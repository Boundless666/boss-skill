'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('runtime report generation', () => {
  let tmpDir;
  let cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-report-'));
    cwd = process.cwd();
    process.chdir(tmpDir);

    const featureDir = path.join(tmpDir, '.boss', 'test-feat');
    const metaDir = path.join(featureDir, '.meta');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(featureDir, 'prd.md'), '# PRD\n', 'utf8');
    fs.writeFileSync(path.join(featureDir, 'architecture.md'), '# Architecture\n', 'utf8');

    const execution = {
      schemaVersion: '0.2.0',
      feature: 'test-feat',
      createdAt: '2026-04-12T00:00:00.000Z',
      updatedAt: '2026-04-12T00:05:00.000Z',
      status: 'running',
      parameters: {
        pipelinePack: 'api-only'
      },
      stages: {
        '1': {
          name: 'planning',
          status: 'completed',
          startTime: '2026-04-12T00:00:30.000Z',
          endTime: '2026-04-12T00:02:00.000Z',
          retryCount: 0,
          maxRetries: 2,
          failureReason: null,
          artifacts: ['prd.md', 'architecture.md'],
          gateResults: {}
        },
        '2': {
          name: 'review',
          status: 'running',
          startTime: '2026-04-12T00:03:00.000Z',
          endTime: null,
          retryCount: 1,
          maxRetries: 2,
          failureReason: null,
          artifacts: [],
          gateResults: {}
        },
        '3': {
          name: 'development',
          status: 'pending',
          startTime: null,
          endTime: null,
          retryCount: 0,
          maxRetries: 2,
          failureReason: null,
          artifacts: [],
          gateResults: {
            gate1: {
              passed: true,
              executedAt: '2026-04-12T00:04:00.000Z',
              checks: [{ name: 'unit', passed: true, detail: 'ok' }]
            }
          }
        },
        '4': {
          name: 'deployment',
          status: 'pending',
          startTime: null,
          endTime: null,
          retryCount: 0,
          maxRetries: 2,
          failureReason: null,
          artifacts: [],
          gateResults: {}
        }
      },
      qualityGates: {
        gate0: { status: 'pending', passed: null, checks: [], executedAt: null },
        gate1: {
          status: 'completed',
          passed: true,
          checks: [{ name: 'unit', passed: true, detail: 'ok' }],
          executedAt: '2026-04-12T00:04:00.000Z'
        },
        gate2: {
          status: 'completed',
          passed: false,
          checks: [{ name: 'perf', passed: false, detail: 'slow' }],
          executedAt: '2026-04-12T00:04:30.000Z'
        }
      },
      metrics: {
        totalDuration: 300,
        stageTimings: { '1': 90 },
        gatePassRate: 50,
        retryTotal: 1,
        agentSuccessCount: 2,
        agentFailureCount: 1,
        meanRetriesPerStage: 0.25,
        revisionLoopCount: 2,
        pluginFailureCount: 1
      },
      plugins: [],
      pluginLifecycle: {
        discovered: [],
        activated: [],
        executed: [],
        failed: [{ plugin: { name: 'test-plugin', version: '1.0.0', type: 'gate' }, hook: 'gate', stage: 3, exitCode: 1, timestamp: '2026-04-12T00:04:45.000Z' }]
      },
      humanInterventions: [],
      revisionRequests: [],
      feedbackLoops: { maxRounds: 2, currentRound: 0 }
    };

    fs.writeFileSync(path.join(metaDir, 'execution.json'), JSON.stringify(execution, null, 2), 'utf8');
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runNode(script, args) {
    return spawnSync('node', [script, ...args], {
      cwd: tmpDir,
      encoding: 'utf8'
    });
  }

  it('generate-summary runtime CLI emits machine-readable JSON via stdout', () => {
    const cliPath = path.join(REPO_ROOT, 'runtime', 'cli', 'generate-summary.js');
    const result = runNode(cliPath, ['test-feat', '--json', '--stdout']);

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.feature, 'test-feat');
    assert.equal(payload.status, 'running');
    assert.equal(payload.pack.name, 'api-only');
    assert.equal(payload.metrics.gatePassRate, 50);
    assert.equal(payload.metrics.agentSuccessCount, 2);
    assert.equal(payload.metrics.pluginFailureCount, 1);
    assert.equal(payload.stages[0].artifacts.length, 2);
    assert.equal(payload.qualityGates.gate2.passed, false);
  });

  it('generate-summary runtime CLI emits markdown via stdout', () => {
    const cliPath = path.join(REPO_ROOT, 'runtime', 'cli', 'generate-summary.js');
    const result = runNode(cliPath, ['test-feat', '--stdout']);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /# 流水线执行报告/);
    assert.match(result.stdout, /test-feat/);
    assert.match(result.stdout, /api-only/);
    assert.match(result.stdout, /Gate 2 \(性能\)/);
    assert.match(result.stdout, /插件失败次数/);
  });

  it('render-diagnostics runtime CLI emits an html diagnostics page', () => {
    const cliPath = path.join(REPO_ROOT, 'runtime', 'cli', 'render-diagnostics.js');
    const result = runNode(cliPath, ['test-feat', '--stdout']);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /<!doctype html>/i);
    assert.match(result.stdout, /test-feat/);
    assert.match(result.stdout, /recent events/i);
    assert.match(result.stdout, /progress flow/i);
  });

  it('shell wrapper remains compatible and writes markdown/json report files', () => {
    const scriptPath = path.join(REPO_ROOT, 'scripts', 'report', 'generate-summary.sh');

    const mdResult = spawnSync('bash', [scriptPath, 'test-feat'], {
      cwd: tmpDir,
      encoding: 'utf8'
    });
    assert.equal(mdResult.status, 0, mdResult.stderr);
    const markdownPath = path.join(tmpDir, '.boss', 'test-feat', 'summary-report.md');
    assert.equal(fs.existsSync(markdownPath), true);
    assert.match(fs.readFileSync(markdownPath, 'utf8'), /# 流水线执行报告/);

    const jsonResult = spawnSync('bash', [scriptPath, 'test-feat', '--json'], {
      cwd: tmpDir,
      encoding: 'utf8'
    });
    assert.equal(jsonResult.status, 0, jsonResult.stderr);
    const jsonPath = path.join(tmpDir, '.boss', 'test-feat', 'summary-report.json');
    assert.equal(fs.existsSync(jsonPath), true);
    const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.equal(payload.feature, 'test-feat');
    assert.equal(payload.pack.name, 'api-only');
  });
});
