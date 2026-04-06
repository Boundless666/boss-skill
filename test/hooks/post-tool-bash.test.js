'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

describe('post-tool-bash hook', () => {
  let hook;

  beforeEach(() => {
    delete require.cache[require.resolve('../../scripts/hooks/post-tool-bash')];
    hook = require('../../scripts/hooks/post-tool-bash');
  });

  it('returns empty string for empty command', () => {
    const result = hook.run(JSON.stringify({
      tool_input: { command: '' },
      cwd: '/tmp'
    }));
    assert.equal(result, '');
  });

  it('returns empty string for non-harness commands', () => {
    const result = hook.run(JSON.stringify({
      tool_input: { command: 'ls -la' },
      cwd: '/tmp'
    }));
    assert.equal(result, '');
  });

  it('detects gate commands', () => {
    const result = hook.run(JSON.stringify({
      tool_input: { command: 'bash scripts/gates/gate-runner.sh my-feat gate0' },
      cwd: '/tmp'
    }));
    assert.ok(result.length > 0);
    const parsed = JSON.parse(result);
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('门禁'));
  });

  it('detects harness commands', () => {
    const result = hook.run(JSON.stringify({
      tool_input: { command: 'bash scripts/harness/update-stage.sh my-feat 1 running' },
      cwd: '/tmp'
    }));
    assert.ok(result.length > 0);
    const parsed = JSON.parse(result);
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('流水线'));
  });
});
