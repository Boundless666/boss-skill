'use strict';

const fs = require('fs');
const path = require('path');
const { EVENT_TYPES, EVENT_TYPE_VALUES } = require('../domain/event-types');
const {
  PIPELINE_STATUS,
  STAGE_STATUS,
  AGENT_STATUS,
  DEFAULT_SCHEMA_VERSION
} = require('../domain/state-constants');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return clone(override === undefined ? base : override);
  }

  if (!isObject(base) || !isObject(override)) {
    return clone(override === undefined ? base : override);
  }

  const result = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(override)]);
  for (const key of keys) {
    if (override[key] === undefined) {
      result[key] = clone(base[key]);
    } else if (base[key] === undefined) {
      result[key] = clone(override[key]);
    } else {
      result[key] = mergeDeep(base[key], override[key]);
    }
  }
  return result;
}

function defaultStageState(name = '') {
  return {
    name,
    status: STAGE_STATUS.PENDING,
    startTime: null,
    endTime: null,
    retryCount: 0,
    maxRetries: 2,
    failureReason: null,
    artifacts: [],
    gateResults: {}
  };
}

function defaultGateState() {
  return {
    status: STAGE_STATUS.PENDING,
    passed: null,
    checks: [],
    executedAt: null
  };
}

function defaultAgentState() {
  return {
    status: AGENT_STATUS.PENDING,
    startTime: null,
    endTime: null,
    retryCount: 0,
    maxRetries: 2,
    failureReason: null
  };
}

function defaultExecutionState(feature = '') {
  return {
    schemaVersion: DEFAULT_SCHEMA_VERSION,
    feature,
    createdAt: '',
    updatedAt: '',
    status: PIPELINE_STATUS.INITIALIZED,
    parameters: {},
    stages: {},
    qualityGates: {},
    metrics: {
      totalDuration: null,
      stageTimings: {},
      gatePassRate: null,
      retryTotal: 0
    },
    plugins: [],
    humanInterventions: [],
    revisionRequests: [],
    feedbackLoops: { maxRounds: 2, currentRound: 0 }
  };
}

function ensureStage(state, stageId) {
  const key = String(stageId);
  if (!state.stages[key]) {
    state.stages[key] = defaultStageState();
  }
  const stage = state.stages[key];
  stage.artifacts = Array.isArray(stage.artifacts) ? stage.artifacts : [];
  stage.gateResults = isObject(stage.gateResults) ? stage.gateResults : {};
  if (stage.retryCount == null) stage.retryCount = 0;
  if (stage.maxRetries == null) stage.maxRetries = 2;
  if (stage.failureReason === undefined) stage.failureReason = null;
  return stage;
}

function ensureGate(state, gateName) {
  if (!state.qualityGates[gateName]) {
    state.qualityGates[gateName] = defaultGateState();
  }
  const gate = state.qualityGates[gateName];
  gate.checks = Array.isArray(gate.checks) ? gate.checks : [];
  if (gate.executedAt === undefined) gate.executedAt = null;
  if (gate.passed === undefined) gate.passed = null;
  if (gate.status === undefined) gate.status = STAGE_STATUS.PENDING;
  return gate;
}

function ensureAgent(stage, agentName) {
  if (!stage.agents) stage.agents = {};
  if (!stage.agents[agentName]) {
    stage.agents[agentName] = defaultAgentState();
  }
  return stage.agents[agentName];
}

function uniqueArtifacts(artifacts) {
  return [...new Set(artifacts)];
}

function normalizePlugins(plugins) {
  if (!Array.isArray(plugins)) return [];
  const deduped = new Map();
  for (const plugin of plugins) {
    if (!plugin || typeof plugin !== 'object') continue;
    const key = `${plugin.name || ''}:${plugin.version || ''}:${plugin.type || ''}`;
    deduped.set(key, {
      name: plugin.name || '',
      version: plugin.version || '',
      type: plugin.type || ''
    });
  }
  return [...deduped.values()];
}

function applyEvent(currentState, event, feature) {
  const state = currentState;
  state.updatedAt = event.timestamp || state.updatedAt;

  switch (event.type) {
    case EVENT_TYPES.PIPELINE_INITIALIZED: {
      const initial = mergeDeep(defaultExecutionState(feature), event.data.initialState || {});
      initial.updatedAt = event.timestamp || initial.updatedAt;
      if (!initial.createdAt) initial.createdAt = event.timestamp || '';
      if (!initial.feature) initial.feature = feature;
      return initial;
    }

    case EVENT_TYPES.STAGE_STARTED: {
      const stage = ensureStage(state, event.data.stage);
      stage.status = STAGE_STATUS.RUNNING;
      if (!stage.startTime) stage.startTime = event.timestamp;
      state.status = PIPELINE_STATUS.RUNNING;
      return state;
    }

    case EVENT_TYPES.STAGE_COMPLETED: {
      const stage = ensureStage(state, event.data.stage);
      stage.status = STAGE_STATUS.COMPLETED;
      stage.endTime = event.timestamp;
      return state;
    }

    case EVENT_TYPES.STAGE_FAILED: {
      const stage = ensureStage(state, event.data.stage);
      stage.status = STAGE_STATUS.FAILED;
      stage.endTime = event.timestamp;
      stage.failureReason = event.data.reason || null;
      state.status = PIPELINE_STATUS.FAILED;
      return state;
    }

    case EVENT_TYPES.STAGE_RETRYING: {
      const stage = ensureStage(state, event.data.stage);
      stage.status = STAGE_STATUS.RETRYING;
      stage.retryCount += 1;
      state.metrics.retryTotal += 1;
      state.status = PIPELINE_STATUS.RUNNING;
      return state;
    }

    case EVENT_TYPES.STAGE_SKIPPED: {
      const stage = ensureStage(state, event.data.stage);
      stage.status = STAGE_STATUS.SKIPPED;
      stage.endTime = event.timestamp;
      return state;
    }

    case EVENT_TYPES.ARTIFACT_RECORDED: {
      const stage = ensureStage(state, event.data.stage);
      stage.artifacts = uniqueArtifacts(stage.artifacts.concat(event.data.artifact));
      return state;
    }

    case EVENT_TYPES.GATE_EVALUATED: {
      const stage = ensureStage(state, event.data.stage);
      const checks = Array.isArray(event.data.checks) ? clone(event.data.checks) : [];
      stage.gateResults[event.data.gate] = {
        passed: event.data.passed,
        executedAt: event.timestamp,
        checks
      };
      const gate = ensureGate(state, event.data.gate);
      gate.status = STAGE_STATUS.COMPLETED;
      gate.passed = event.data.passed;
      gate.executedAt = event.timestamp;
      gate.checks = checks;
      return state;
    }

    case EVENT_TYPES.AGENT_STARTED: {
      const stage = ensureStage(state, event.data.stage);
      const agent = ensureAgent(stage, event.data.agent);
      agent.status = AGENT_STATUS.RUNNING;
      if (!agent.startTime) agent.startTime = event.timestamp;
      return state;
    }

    case EVENT_TYPES.AGENT_COMPLETED: {
      const stage = ensureStage(state, event.data.stage);
      const agent = ensureAgent(stage, event.data.agent);
      agent.status = AGENT_STATUS.COMPLETED;
      agent.endTime = event.timestamp;
      return state;
    }

    case EVENT_TYPES.AGENT_FAILED: {
      const stageId = event.data.stage;
      if (stageId != null) {
        const stage = ensureStage(state, stageId);
        const agent = ensureAgent(stage, event.data.agent);
        agent.status = AGENT_STATUS.FAILED;
        agent.endTime = event.timestamp;
        agent.failureReason = event.data.reason || null;
      }
      return state;
    }

    case EVENT_TYPES.AGENT_RETRY_SCHEDULED: {
      const stage = ensureStage(state, event.data.stage);
      const agent = ensureAgent(stage, event.data.agent);
      agent.retryCount += 1;
      agent.status = 'retrying';
      agent.failureReason = null;
      return state;
    }

    case EVENT_TYPES.REVISION_REQUESTED: {
      if (!Array.isArray(state.revisionRequests)) state.revisionRequests = [];
      if (!state.feedbackLoops || typeof state.feedbackLoops !== 'object') {
        state.feedbackLoops = { maxRounds: 2, currentRound: 0 };
      }
      state.revisionRequests.push({
        from: event.data.from,
        to: event.data.to,
        artifact: event.data.artifact,
        reason: event.data.reason,
        priority: event.data.priority || 'recommended',
        timestamp: event.timestamp,
        resolved: false
      });
      state.feedbackLoops.currentRound = (state.feedbackLoops.currentRound || 0) + 1;
      return state;
    }

    case EVENT_TYPES.PLUGINS_REGISTERED: {
      state.plugins = normalizePlugins(event.data.plugins);
      return state;
    }

    default:
      return state;
  }
}

function computeDurationSeconds(start, end) {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return Math.round((endMs - startMs) / 1000);
}

function finalizeState(state) {
  const stageTimings = {};
  for (const [stageId, stage] of Object.entries(state.stages || {})) {
    const duration = computeDurationSeconds(stage.startTime, stage.endTime);
    if (duration != null) {
      stageTimings[stageId] = duration;
    }
    if (Array.isArray(stage.artifacts)) {
      stage.artifacts = uniqueArtifacts(stage.artifacts);
    } else {
      stage.artifacts = [];
    }
    stage.gateResults = isObject(stage.gateResults) ? stage.gateResults : {};
  }

  state.metrics.stageTimings = stageTimings;
  state.metrics.totalDuration = computeDurationSeconds(state.createdAt, state.updatedAt);

  const completedGates = Object.values(state.qualityGates || {}).filter(gate => gate.status === STAGE_STATUS.COMPLETED);
  if (completedGates.length > 0) {
    const passedCount = completedGates.filter(gate => gate.passed === true).length;
    state.metrics.gatePassRate = Number(((passedCount * 100) / completedGates.length).toFixed(2));
  } else {
    state.metrics.gatePassRate = null;
  }

  const stageStatuses = Object.values(state.stages || {}).map(stage => stage.status);
  if (stageStatuses.length > 0 && stageStatuses.every(status => status === STAGE_STATUS.COMPLETED || status === STAGE_STATUS.SKIPPED)) {
    state.status = PIPELINE_STATUS.COMPLETED;
  } else if (stageStatuses.some(status => status === STAGE_STATUS.RUNNING || status === STAGE_STATUS.RETRYING)) {
    state.status = PIPELINE_STATUS.RUNNING;
  }

  state.plugins = normalizePlugins(state.plugins);
  return state;
}

function readEvents(eventsFile) {
  const raw = fs.readFileSync(eventsFile, 'utf8').trim();
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(event => EVENT_TYPE_VALUES.includes(event.type));
}

function materializeState(feature, cwd = process.cwd()) {
  if (!feature) {
    throw new Error('缺少 feature 参数');
  }

  const metaDir = path.join(cwd, '.boss', feature, '.meta');
  const eventsFile = path.join(metaDir, 'events.jsonl');
  const execJsonPath = path.join(metaDir, 'execution.json');

  if (!fs.existsSync(eventsFile)) {
    throw new Error(`未找到事件文件: ${path.relative(cwd, eventsFile)}`);
  }

  const events = readEvents(eventsFile);
  let state = defaultExecutionState(feature);

  for (const event of events) {
    state = applyEvent(state, event, feature);
  }

  state = finalizeState(state);
  fs.writeFileSync(execJsonPath, JSON.stringify(state, null, 2) + '\n', 'utf8');

  return {
    eventCount: events.length,
    execJsonPath,
    state
  };
}

function runCli(argv = process.argv.slice(2)) {
  const [feature] = argv;
  if (!feature || feature === '-h' || feature === '--help') {
    process.stderr.write('用法: materialize-state.js <feature>\n');
    process.exit(feature ? 0 : 1);
  }

  try {
    const result = materializeState(feature, process.cwd());
    process.stderr.write(`[MATERIALIZE] 状态已从 ${result.eventCount} 条事件物化到 ${path.relative(process.cwd(), result.execJsonPath)}\n`);
  } catch (err) {
    process.stderr.write(`[MATERIALIZE] ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  materializeState,
  defaultExecutionState,
  finalizeState,
  applyEvent
};
