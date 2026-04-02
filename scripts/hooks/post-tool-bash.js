'use strict';

const fs = require('fs');
const path = require('path');
const { findActiveFeature } = require('../lib/boss-utils');

function isGateCommand(command) {
  return /gate-runner\.sh|gate0-|gate1-|gate2-/.test(command);
}

function isHarnessCommand(command) {
  return /update-stage\.sh|check-stage\.sh|retry-stage\.sh|generate-summary\.sh|load-plugins\.sh/.test(command);
}

function isTestCommand(command) {
  return /npm test|npx vitest|npx jest|pytest|cargo test|go test|npx playwright|npx cypress/.test(command);
}

function run(rawInput) {
  const input = JSON.parse(rawInput);
  const command = (input.tool_input || {}).command || '';
  const cwd = input.cwd || '';

  if (!command) return '';

  let context = '';

  if (isGateCommand(command)) {
    context = '[Harness] 门禁命令已执行，结果已写入 execution.json';
  }

  if (isHarnessCommand(command)) {
    context = '[Harness] 流水线状态已更新';
  }

  if (isTestCommand(command)) {
    const active = findActiveFeature(cwd);
    if (active) {
      context = `[Harness] 测试命令在活跃流水线 '${active.feature}' 上下文中执行`;
    }
  }

  if (!context) return '';

  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: context
    }
  });
}

module.exports = { run };
