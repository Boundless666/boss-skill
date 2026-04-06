#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
LOG_TAG="MATERIALIZE"

show_help() {
    cat << 'EOF'
Boss Harness - 状态物化

用法: materialize-state.sh <feature>

从 .boss/<feature>/.meta/events.jsonl 重建 execution.json。
这是事件溯源的"物化视图"生成器。

参数:
  feature   功能名称

示例:
  materialize-state.sh my-feature
EOF
}

[[ "$1" == "-h" || "$1" == "--help" ]] && { show_help; exit 0; }

FEATURE="$1"
[[ -z "$FEATURE" ]] && error "缺少 feature 参数"

EVENTS_FILE=".boss/$FEATURE/.meta/events.jsonl"
EXEC_JSON=".boss/$FEATURE/.meta/execution.json"
META_DIR=".boss/$FEATURE/.meta"

[[ -f "$EVENTS_FILE" ]] || error "未找到事件文件: $EVENTS_FILE"
command -v jq >/dev/null 2>&1 || error "需要 jq 工具（brew install jq）"

# 使用 jq 处理所有事件，生成最终状态
# 初始状态由 PipelineInitialized 事件提供，后续事件叠加修改

TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE" "${TMP_FILE}.out"' EXIT

# 用 jq 的 reduce 模式处理 JSONL
jq -s '
def apply_event(state; event):
  state |
  .updatedAt = event.timestamp |
  if event.type == "PipelineInitialized" then
    . * event.data.initialState
  elif event.type == "StageStarted" then
    .stages[event.data.stage | tostring].status = "running" |
    .status = "running" |
    (if .stages[event.data.stage | tostring].startTime == null then
      .stages[event.data.stage | tostring].startTime = event.timestamp
    else . end)
  elif event.type == "StageCompleted" then
    .stages[event.data.stage | tostring].status = "completed" |
    .stages[event.data.stage | tostring].endTime = event.timestamp
  elif event.type == "StageFailed" then
    .stages[event.data.stage | tostring].status = "failed" |
    .stages[event.data.stage | tostring].endTime = event.timestamp |
    .status = "failed" |
    (if event.data.reason then
      .stages[event.data.stage | tostring].failureReason = event.data.reason
    else . end)
  elif event.type == "StageRetrying" then
    .stages[event.data.stage | tostring].status = "retrying" |
    .stages[event.data.stage | tostring].retryCount += 1 |
    .metrics.retryTotal += 1
  elif event.type == "StageSkipped" then
    .stages[event.data.stage | tostring].status = "skipped" |
    .stages[event.data.stage | tostring].endTime = event.timestamp
  elif event.type == "ArtifactRecorded" then
    .stages[event.data.stage | tostring].artifacts += [event.data.artifact] |
    .stages[event.data.stage | tostring].artifacts |= unique
  elif event.type == "GateEvaluated" then
    .stages[event.data.stage | tostring].gateResults[event.data.gate] = {
      passed: event.data.passed,
      executedAt: event.timestamp
    } |
    .qualityGates[event.data.gate].status = "completed" |
    .qualityGates[event.data.gate].passed = event.data.passed |
    .qualityGates[event.data.gate].executedAt = event.timestamp
  elif event.type == "AgentStarted" then
    (if .stages[event.data.stage | tostring].agents then
      .stages[event.data.stage | tostring].agents[event.data.agent].status = "running"
    else . end)
  elif event.type == "AgentCompleted" then
    (if .stages[event.data.stage | tostring].agents then
      .stages[event.data.stage | tostring].agents[event.data.agent].status = "completed"
    else . end)
  elif event.type == "AgentFailed" then
    (if .stages[event.data.stage | tostring].agents then
      .stages[event.data.stage | tostring].agents[event.data.agent].status = "failed" |
      .stages[event.data.stage | tostring].agents[event.data.agent].failureReason = (event.data.reason // null)
    else . end)
  else . end;

# Start with empty state
reduce .[] as $event (
  {
    schemaVersion: "0.2.0",
    feature: "",
    createdAt: "",
    updatedAt: "",
    status: "initialized",
    parameters: {},
    stages: {},
    qualityGates: {},
    metrics: { totalDuration: null, stageTimings: {}, gatePassRate: null, retryTotal: 0 },
    plugins: [],
    humanInterventions: [],
    revisionRequests: [],
    feedbackLoops: { maxRounds: 2, currentRound: 0 }
  };
  apply_event(.; $event)
) |
# 检查是否全部阶段完成
(if ([.stages[].status] | all(. == "completed" or . == "skipped")) and (.stages | length > 0) then
  .status = "completed"
else . end) |
# 计算阶段耗时
.stages |= with_entries(
  if .value.startTime != null and .value.endTime != null then
    .
  else . end
)
' "$EVENTS_FILE" > "$TMP_FILE"

mv "$TMP_FILE" "$EXEC_JSON"
info "状态已从 $(wc -l < "$EVENTS_FILE" | tr -d ' ') 条事件物化到 $EXEC_JSON" >&2
