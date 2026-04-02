'use strict';

const fs = require('fs');
const path = require('path');
const { findActiveFeature, readExecJson } = require('../lib/boss-utils');

function run(rawInput) {
  const input = JSON.parse(rawInput);
  const cwd = input.cwd || '';

  if (!cwd) return '';

  const active = findActiveFeature(cwd);
  if (!active) return '';

  const execData = readExecJson(cwd, active.feature);
  if (!execData) return '';

  let currentStage = '';
  let stageName = '';
  const stages = execData.stages || {};
  for (let s = 1; s <= 4; s++) {
    const stage = stages[String(s)] || {};
    if (stage.status === 'running') {
      currentStage = String(s);
      stageName = stage.name || 'unknown';
      break;
    }
  }

  let context = `[Boss Harness] 当前流水线: ${active.feature}`;
  if (currentStage) {
    context += `, 活跃阶段: ${currentStage} (${stageName})`;
  }
  const agentType = input.agent_type || '';
  context += `\n子 Agent 类型: ${agentType}`;

  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: context
    }
  });
}

module.exports = { run };
