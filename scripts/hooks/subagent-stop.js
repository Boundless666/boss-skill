'use strict';

const fs = require('fs');
const path = require('path');
const { findActiveFeature, readExecJson, AGENT_STAGE_MAP } = require('../lib/boss-utils');
const { emitProgress } = require('../lib/progress-emitter');
const { execSync } = require('child_process');

function run(rawInput) {
  const input = JSON.parse(rawInput);
  const agentType = input.agent_type || '';
  const agentId = input.agent_id || '';
  const lastMsg = (input.last_assistant_message || '').slice(0, 500);
  const cwd = input.cwd || '';

  const active = findActiveFeature(cwd);

  const logDirName = active ? active.feature : '.harness-logs';
  const logDir = path.join(cwd, '.boss', logDirName, '.meta');

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  } catch (err) {
    process.stderr.write('[boss-skill] subagent-stop/mkdirSync: ' + err.message + '\n');
    return '';
  }

  const logFile = path.join(logDir, 'agent-log.jsonl');
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const entry = JSON.stringify({
    timestamp: now,
    agentType,
    agentId,
    event: 'stop',
    summary: lastMsg
  });

  try {
    fs.appendFileSync(logFile, entry + '\n', 'utf8');
  } catch (err) {
    process.stderr.write('[boss-skill] subagent-stop/appendLog: ' + err.message + '\n');
  }

  // Emit AgentCompleted/AgentFailed event if this is a known boss agent
  if (active && AGENT_STAGE_MAP[agentType]) {
    const execData = readExecJson(cwd, active.feature);
    if (execData) {
      let currentStage = '';
      const stages = execData.stages || {};
      for (let s = 1; s <= 4; s++) {
        const stage = stages[String(s)] || {};
        if (stage.status === 'running') {
          currentStage = String(s);
          break;
        }
      }

      if (currentStage) {
        // Parse status from last message: look for DONE, DONE_WITH_CONCERNS, BLOCKED, NEEDS_CONTEXT, REVISION_NEEDED
        const statusMatch = lastMsg.match(/\b(REVISION_NEEDED|DONE_WITH_CONCERNS|DONE|BLOCKED|NEEDS_CONTEXT)\b/);
        const agentStatus = statusMatch && (statusMatch[1] === 'DONE' || statusMatch[1] === 'DONE_WITH_CONCERNS')
          ? 'completed' : 'failed';

        emitProgress(cwd, active.feature, {
          type: 'agent-complete',
          data: { agent: agentType, stage: parseInt(currentStage), status: agentStatus }
        });

        const reasonArg = agentStatus === 'failed' && statusMatch
          ? ` --reason "${statusMatch[1]}"` : '';

        try {
          const scriptPath = path.join(__dirname, '..', 'harness', 'update-agent.sh');
          execSync(`bash "${scriptPath}" "${active.feature}" "${currentStage}" "${agentType}" ${agentStatus}${reasonArg}`, {
            cwd,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
          });
        } catch (err) {
          process.stderr.write('[boss-skill] subagent-stop/update-agent: ' + err.message + '\n');
        }
      }
    }
  }

  return '';
}

module.exports = { run };
