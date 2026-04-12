'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const INIT_PIPELINE_CLI = path.join(REPO_ROOT, 'runtime', 'cli', 'init-pipeline.js');
const GET_READY_ARTIFACTS_CLI = path.join(REPO_ROOT, 'runtime', 'cli', 'get-ready-artifacts.js');
const RECORD_ARTIFACT_CLI = path.join(REPO_ROOT, 'runtime', 'cli', 'record-artifact.js');
const UPDATE_STAGE_CLI = path.join(REPO_ROOT, 'runtime', 'cli', 'update-stage.js');
const UPDATE_AGENT_CLI = path.join(REPO_ROOT, 'runtime', 'cli', 'update-agent.js');
const EVALUATE_GATES_CLI = path.join(REPO_ROOT, 'runtime', 'cli', 'evaluate-gates.js');
const CHECK_STAGE_CLI = path.join(REPO_ROOT, 'runtime', 'cli', 'check-stage.js');
const REPLAY_EVENTS_CLI = path.join(REPO_ROOT, 'runtime', 'cli', 'replay-events.js');
const INSPECT_PROGRESS_CLI = path.join(REPO_ROOT, 'runtime', 'cli', 'inspect-progress.js');
const RENDER_DIAGNOSTICS_CLI = path.join(REPO_ROOT, 'runtime', 'cli', 'render-diagnostics.js');

describe('runtime CLI contract', () => {
  let tmpDir;
  let cwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-runtime-cli-'));
    cwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(cwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runCli(script, args) {
    return spawnSync('node', [script, ...args], {
      cwd: tmpDir,
      encoding: 'utf8'
    });
  }

  it('get-ready-artifacts CLI does not depend on runtime internal exports', () => {
    const source = fs.readFileSync(
      path.join(REPO_ROOT, 'runtime', 'cli', 'get-ready-artifacts.js'),
      'utf8'
    );

    assert.doesNotMatch(source, /\._internal\b/);
  });

  it('init-pipeline CLI exposes help text and stable JSON fields', () => {
    const help = runCli(INIT_PIPELINE_CLI, ['--help']);
    assert.equal(help.status, 0);
    assert.match(help.stderr, /用法: init-pipeline\.js <feature>/);

    const result = runCli(INIT_PIPELINE_CLI, ['test-feat']);
    assert.equal(result.status, 0, result.stderr);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.feature, 'test-feat');
    assert.equal(payload.status, 'initialized');
    assert.equal(payload.executionPath, '.boss/test-feat/.meta/execution.json');
  });

  it('record-artifact CLI exposes help text and stable JSON fields', () => {
    const runtime = require('../../runtime/cli/lib/pipeline-runtime.js');
    runtime.initPipeline('test-feat', { cwd: tmpDir });

    const help = runCli(RECORD_ARTIFACT_CLI, ['--help']);
    assert.equal(help.status, 0);
    assert.match(help.stderr, /用法: record-artifact\.js <feature> <artifact> <stage>/);

    const result = runCli(RECORD_ARTIFACT_CLI, ['test-feat', 'prd.md', '1']);
    assert.equal(result.status, 0, result.stderr);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.feature, 'test-feat');
    assert.equal(payload.artifact, 'prd.md');
    assert.equal(payload.stage, 1);
    assert.deepEqual(payload.artifacts, ['prd.md']);
  });

  it('get-ready-artifacts CLI exposes help text and stable ready-artifact JSON', () => {
    const runtime = require('../../runtime/cli/lib/pipeline-runtime.js');
    runtime.initPipeline('test-feat', { cwd: tmpDir });

    const help = runCli(GET_READY_ARTIFACTS_CLI, ['--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /用法: get-ready-artifacts\.js <feature> <artifact> \[options\]/);

    const result = runCli(GET_READY_ARTIFACTS_CLI, ['test-feat', '--ready', '--json']);
    assert.equal(result.status, 0, result.stderr);

    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload, ['prd.md']);
  });

  it('evaluate-gates CLI exposes help text and stable JSON fields', () => {
    const runtime = require('../../runtime/cli/lib/pipeline-runtime.js');
    runtime.initPipeline('test-feat', { cwd: tmpDir });

    const help = runCli(EVALUATE_GATES_CLI, ['--help']);
    assert.equal(help.status, 0);
    assert.match(help.stderr, /用法: evaluate-gates\.js <feature> <gate-name> \[options\]/);

    const result = runCli(EVALUATE_GATES_CLI, ['test-feat', 'gate1', '--dry-run']);
    assert.equal(result.status, 0, result.stderr);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.feature, 'test-feat');
    assert.equal(payload.gate, 'gate1');
    assert.equal(typeof payload.passed, 'boolean');
    assert.equal(Array.isArray(payload.checks), true);
    assert.equal(payload.dryRun, true);
    assert.equal(typeof payload.skipped, 'boolean');
  });

  it('update-stage and update-agent CLIs expose runtime-first help text', () => {
    const stageHelp = runCli(UPDATE_STAGE_CLI, ['--help']);
    assert.equal(stageHelp.status, 0);
    assert.match(stageHelp.stderr, /用法: update-stage\.js <feature> <stage> <status> \[options\]/);

    const agentHelp = runCli(UPDATE_AGENT_CLI, ['--help']);
    assert.equal(agentHelp.status, 0);
    assert.match(agentHelp.stderr, /用法: update-agent\.js <feature> <stage> <agent-name> <status> \[options\]/);
  });

  it('check-stage, replay-events, inspect-progress, and render-diagnostics expose help text', () => {
    const stageHelp = runCli(CHECK_STAGE_CLI, ['--help']);
    assert.equal(stageHelp.status, 0);
    assert.match(stageHelp.stdout + stageHelp.stderr, /用法: check-stage\.js <feature>/);

    const replayHelp = runCli(REPLAY_EVENTS_CLI, ['--help']);
    assert.equal(replayHelp.status, 0);
    assert.match(replayHelp.stdout + replayHelp.stderr, /用法: replay-events\.js <feature>/);

    const progressHelp = runCli(INSPECT_PROGRESS_CLI, ['--help']);
    assert.equal(progressHelp.status, 0);
    assert.match(progressHelp.stdout + progressHelp.stderr, /用法: inspect-progress\.js <feature>/);

    const diagnosticsHelp = runCli(RENDER_DIAGNOSTICS_CLI, ['--help']);
    assert.equal(diagnosticsHelp.status, 0);
    assert.match(diagnosticsHelp.stdout + diagnosticsHelp.stderr, /用法: render-diagnostics\.js <feature>/);
  });
});
