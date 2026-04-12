'use strict';

const fs = require('fs');
const path = require('path');
const { findActiveFeature, readExecJson, AGENT_STAGE_MAP } = require('../lib/boss-utils');
const { emitProgress } = require('../lib/progress-emitter');
const { execSync } = require('child_process');

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

  // Emit AgentStarted event if this is a known boss agent
  const agentType = input.agent_type || '';
  if (currentStage && AGENT_STAGE_MAP[agentType]) {
    emitProgress(cwd, active.feature, {
      type: 'agent-start',
      data: { agent: agentType, stage: parseInt(currentStage) }
    });
    try {
      const scriptPath = path.join(__dirname, '..', 'harness', 'update-agent.sh');
      execSync(`bash "${scriptPath}" "${active.feature}" "${currentStage}" "${agentType}" running`, {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (err) {
      process.stderr.write('[boss-skill] subagent-start/update-agent: ' + err.message + '\n');
    }
  }

  let context = `[Boss Harness] 当前流水线: ${active.feature}`;
  if (currentStage) {
    context += `, 活跃阶段: ${currentStage} (${stageName})`;
  }
  context += `\n子 Agent 类型: ${agentType}`;
  context += '\n请在最终消息中附带固定状态块：';
  context += '\n[BOSS_STATUS]';
  context += '\nstatus: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED';
  context += '\nreason: <optional>';
  context += '\n[/BOSS_STATUS]';

  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext: context
    }
  });
}

module.exports = { run };
