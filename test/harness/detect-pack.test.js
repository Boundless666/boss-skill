'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'harness', 'detect-pack.sh');

describe('detect-pack.sh', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'boss-detect-pack-'));
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(projectDir, extraArgs) {
    const args = extraArgs || '';
    try {
      return execSync(`bash "${SCRIPT_PATH}" ${args} "${projectDir}"`, {
        encoding: 'utf8',
        env: { ...process.env, PATH: process.env.PATH }
      }).trim();
    } catch (err) {
      return err.stdout ? err.stdout.trim() : '';
    }
  }

  it('returns "default" when no pack matches', () => {
    const result = run(tmpDir);
    assert.equal(result, 'default');
  });

  it('detects solana-contract when Anchor.toml exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'Anchor.toml'), '[programs]\n', 'utf8');
    const result = run(tmpDir);
    assert.equal(result, 'solana-contract');
  });

  it('detects api-only when package.json exists but no frontend dirs', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test","dependencies":{}}', 'utf8');
    const result = run(tmpDir);
    assert.equal(result, 'api-only');
  });

  it('does not detect api-only when src/app exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}', 'utf8');
    fs.mkdirSync(path.join(tmpDir, 'src', 'app'), { recursive: true });
    const result = run(tmpDir);
    assert.equal(result, 'default');
  });

  it('prefers higher priority pack (solana-contract > api-only)', () => {
    // Both conditions met: Anchor.toml + package.json, no frontend dirs
    fs.writeFileSync(path.join(tmpDir, 'Anchor.toml'), '[programs]\n', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test"}', 'utf8');
    const result = run(tmpDir);
    assert.equal(result, 'solana-contract');
  });

  it('returns JSON when --json flag is used', () => {
    const result = run(tmpDir, '--json');
    const parsed = JSON.parse(result);
    assert.equal(parsed.detected, 'default');
    assert.ok(Array.isArray(parsed.matched));
  });
});
