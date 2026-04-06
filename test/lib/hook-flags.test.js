'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('hook-flags', () => {
  const originalEnv = {};

  beforeEach(() => {
    originalEnv.BOSS_HOOK_PROFILE = process.env.BOSS_HOOK_PROFILE;
    originalEnv.BOSS_DISABLED_HOOKS = process.env.BOSS_DISABLED_HOOKS;
    delete process.env.BOSS_HOOK_PROFILE;
    delete process.env.BOSS_DISABLED_HOOKS;
  });

  afterEach(() => {
    if (originalEnv.BOSS_HOOK_PROFILE !== undefined) {
      process.env.BOSS_HOOK_PROFILE = originalEnv.BOSS_HOOK_PROFILE;
    } else {
      delete process.env.BOSS_HOOK_PROFILE;
    }
    if (originalEnv.BOSS_DISABLED_HOOKS !== undefined) {
      process.env.BOSS_DISABLED_HOOKS = originalEnv.BOSS_DISABLED_HOOKS;
    } else {
      delete process.env.BOSS_DISABLED_HOOKS;
    }
  });

  function loadFlags() {
    delete require.cache[require.resolve('../../scripts/lib/hook-flags')];
    return require('../../scripts/lib/hook-flags');
  }

  it('isHookEnabled returns true when no restrictions (default standard profile)', () => {
    const flags = loadFlags();
    assert.equal(flags.isHookEnabled('session:start', {}), true);
  });

  it('isHookEnabled returns false when hook is disabled', () => {
    process.env.BOSS_DISABLED_HOOKS = 'session:start,session:end';
    const flags = loadFlags();
    assert.equal(flags.isHookEnabled('session:start', {}), false);
    assert.equal(flags.isHookEnabled('other:hook', {}), true);
  });

  it('isHookEnabled respects profile filtering with standard (default)', () => {
    const flags = loadFlags();
    // default profile is standard
    assert.equal(flags.isHookEnabled('test', { profiles: 'standard,strict' }), true);
    assert.equal(flags.isHookEnabled('test', { profiles: 'strict' }), false);
  });

  it('isHookEnabled respects minimal profile', () => {
    process.env.BOSS_HOOK_PROFILE = 'minimal';
    const flags = loadFlags();
    assert.equal(flags.isHookEnabled('test', { profiles: 'standard,strict' }), false);
    assert.equal(flags.isHookEnabled('test', { profiles: 'minimal,standard' }), true);
  });

  it('isHookEnabled respects strict profile', () => {
    process.env.BOSS_HOOK_PROFILE = 'strict';
    const flags = loadFlags();
    assert.equal(flags.isHookEnabled('test', { profiles: 'strict' }), true);
    assert.equal(flags.isHookEnabled('test', { profiles: 'minimal' }), false);
  });

  it('isHookEnabled allows all when no profiles specified', () => {
    const flags = loadFlags();
    assert.equal(flags.isHookEnabled('any-hook', { profiles: '' }), true);
    assert.equal(flags.isHookEnabled('any-hook', {}), true);
  });

  it('isHookEnabled falls back to standard for invalid profile', () => {
    process.env.BOSS_HOOK_PROFILE = 'invalid';
    const flags = loadFlags();
    // invalid profile falls back to standard
    assert.equal(flags.isHookEnabled('test', { profiles: 'standard' }), true);
    assert.equal(flags.isHookEnabled('test', { profiles: 'minimal' }), false);
  });
});
