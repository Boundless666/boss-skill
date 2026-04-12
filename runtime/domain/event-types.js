'use strict';

const EVENT_TYPES = Object.freeze({
  PIPELINE_INITIALIZED: 'PipelineInitialized',
  STAGE_STARTED: 'StageStarted',
  STAGE_COMPLETED: 'StageCompleted',
  STAGE_FAILED: 'StageFailed',
  STAGE_RETRYING: 'StageRetrying',
  STAGE_SKIPPED: 'StageSkipped',
  ARTIFACT_RECORDED: 'ArtifactRecorded',
  GATE_EVALUATED: 'GateEvaluated',
  AGENT_STARTED: 'AgentStarted',
  AGENT_COMPLETED: 'AgentCompleted',
  AGENT_FAILED: 'AgentFailed',
  AGENT_RETRY_SCHEDULED: 'AgentRetryScheduled',
  REVISION_REQUESTED: 'RevisionRequested',
  PLUGINS_REGISTERED: 'PluginsRegistered'
});

const EVENT_TYPE_VALUES = Object.freeze(Object.values(EVENT_TYPES));

module.exports = {
  EVENT_TYPES,
  EVENT_TYPE_VALUES
};
