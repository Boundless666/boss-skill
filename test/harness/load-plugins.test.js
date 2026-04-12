'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const LOAD_PLUGINS_SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'harness', 'load-plugins.sh');

describe('load-plugins wrapper compatibility', () => {
  let tmpDir;
  let origCwd;

  function writeLocalPlugin(dirName, manifest, scripts = {}) {
    const pluginDir = path.join(tmpDir, 'harness', 'plugins', dirName);
    fs.mkdirSync(pluginDir, { recursive: true });
    for (const [fileName, content] of Object.entries(scripts)) {
      fs.writeFileSync(path.join(pluginDir, fileName), content, 'utf8');
    }
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf8');
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-plugins-'));
    origCwd = process.cwd();
    process.chdir(tmpDir);

    const metaDir = path.join(tmpDir, '.boss', 'test-feat', '.meta');
    fs.mkdirSync(metaDir, { recursive: true });

    const initState = {
      schemaVersion: '0.2.0',
      feature: 'test-feat',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      status: 'initialized',
      parameters: {},
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
    fs.writeFileSync(path.join(metaDir, 'events.jsonl'), JSON.stringify({
      id: 1,
      type: 'PipelineInitialized',
      timestamp: '2024-01-01T00:00:00Z',
      data: { initialState: initState }
    }) + '\n', 'utf8');
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runScript(args) {
    try {
      return execSync(`bash "${LOAD_PLUGINS_SCRIPT}" ${args}`, {
        encoding: 'utf8',
        cwd: tmpDir,
        env: { ...process.env, PATH: process.env.PATH }
      }).trim();
    } catch (err) {
      if (err.status !== 0) {
        throw new Error(err.stderr || err.message);
      }
      return err.stdout ? err.stdout.trim() : '';
    }
  }

  it('appends a plugin registration event and materializes plugins', () => {
    runScript('--register test-feat');

    const events = fs.readFileSync(path.join(tmpDir, '.boss', 'test-feat', '.meta', 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));

    assert.ok(events.length >= 2);
    assert.ok(events.some(event => event.type === 'PluginDiscovered'));
    assert.ok(events.some(event => event.type === 'PluginActivated'));
    const registeredEvent = events.find(event => event.type === 'PluginsRegistered');
    assert.ok(registeredEvent);
    assert.equal(Array.isArray(registeredEvent.data.plugins), true);
    assert.ok(registeredEvent.data.plugins.some(plugin => plugin.name === 'security-audit'));

    const execJson = JSON.parse(fs.readFileSync(
      path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json'),
      'utf8'
    ));
    assert.deepEqual(execJson.plugins, registeredEvent.data.plugins);
  });

  it('supports --list via runtime wrapper', () => {
    const output = runScript('--list');
    assert.match(output, /security-audit@1\.0\.0 \(gate\)/);
    assert.match(output, /共发现 \d+ 个插件/);
  });

  it('supports --validate via runtime wrapper', () => {
    const output = runScript('--validate');
    assert.match(output, /security-audit@1\.0\.0 \(gate\) — 有效/);
    assert.match(output, /所有插件验证通过/);
  });

  it('runs cwd-local plugin hook through shell wrapper', () => {
    writeLocalPlugin('local-hook', {
      name: 'local-hook',
      version: '1.0.0',
      type: 'agent',
      hooks: { 'pre-stage': 'pre-stage.sh' },
      stages: [1]
    }, {
      'pre-stage.sh': '#!/bin/bash\necho \"$1:$2\" > .boss/test-feat/.meta/local-hook.log\n'
    });

    runScript('--run-hook pre-stage test-feat 1');

    const marker = path.join(tmpDir, '.boss', 'test-feat', '.meta', 'local-hook.log');
    assert.equal(fs.existsSync(marker), true);
    assert.equal(fs.readFileSync(marker, 'utf8').trim(), 'test-feat:1');
  });

  it('preserves plugin union across sequential filtered registration via wrapper', () => {
    writeLocalPlugin('local-gate', {
      name: 'local-gate',
      version: '1.0.0',
      type: 'gate',
      hooks: { gate: 'gate.sh' }
    }, { 'gate.sh': '#!/bin/bash\nexit 0\n' });
    writeLocalPlugin('local-reporter', {
      name: 'local-reporter',
      version: '1.0.0',
      type: 'reporter',
      hooks: { report: 'report.sh' }
    }, { 'report.sh': '#!/bin/bash\nexit 0\n' });

    runScript('--register test-feat --type gate');
    runScript('--register test-feat --type reporter');

    const execJson = JSON.parse(fs.readFileSync(
      path.join(tmpDir, '.boss', 'test-feat', '.meta', 'execution.json'),
      'utf8'
    ));
    assert.deepEqual(execJson.plugins.map((plugin) => plugin.name), ['local-gate', 'local-reporter']);
  });
});
