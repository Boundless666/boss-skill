'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PKG_ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(PKG_ROOT, 'bin', 'boss-skill.js');

describe('boss-skill CLI', () => {
  it('--version prints correct version', () => {
    const output = execFileSync(process.execPath, [CLI, '--version'], {
      encoding: 'utf8'
    }).trim();
    const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
    assert.equal(output, pkg.version);
  });

  it('--help prints usage info', () => {
    const output = execFileSync(process.execPath, [CLI, '--help'], {
      encoding: 'utf8'
    });
    assert.ok(output.includes('boss-skill'));
  });

  it('path prints package root', () => {
    const output = execFileSync(process.execPath, [CLI, 'path'], {
      encoding: 'utf8'
    }).trim();
    assert.equal(output, PKG_ROOT);
  });
});

describe('version consistency', () => {
  it('all manifest versions match package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'));
    const version = pkg.version;

    const pluginJson = JSON.parse(
      fs.readFileSync(path.join(PKG_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
    );
    assert.equal(pluginJson.version, version, 'plugin.json version mismatch');

    const marketplaceJson = JSON.parse(
      fs.readFileSync(path.join(PKG_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')
    );
    assert.equal(marketplaceJson.version, version, 'marketplace.json outer version mismatch');
    assert.equal(
      marketplaceJson.plugins[0].version, version,
      'marketplace.json plugin version mismatch'
    );

    const skillMd = fs.readFileSync(path.join(PKG_ROOT, 'SKILL.md'), 'utf8');
    assert.ok(skillMd.includes(`version: ${version}`), 'SKILL.md version mismatch');
  });
});
