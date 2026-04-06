#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
LOG_TAG="HARNESS"

show_help() {
    cat << 'EOF'
Boss Harness - 阶段状态更新

用法: update-stage.sh <feature> <stage> <status> [options]

参数:
  feature   功能名称
  stage     阶段编号 (1-4)
  status    目标状态: pending | running | completed | failed | retrying | skipped

选项:
  --reason <text>        失败原因（status=failed 时使用）
  --artifact <name>      记录产出的产物文件名（可多次使用）
  --gate <name>          记录关联的 gate 名称
  --gate-passed          标记 gate 通过
  --gate-failed          标记 gate 未通过

示例:
  update-stage.sh my-feature 1 running
  update-stage.sh my-feature 1 completed --artifact prd.md --artifact architecture.md
  update-stage.sh my-feature 3 failed --reason "单元测试覆盖率不足"
  update-stage.sh my-feature 3 completed --gate gate1 --gate-passed
EOF
}

VALID_STATUSES="pending running completed failed retrying skipped"

FEATURE=""
STAGE=""
STATUS=""
REASON=""
ARTIFACTS=()
GATE_NAME=""
GATE_PASSED=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) show_help; exit 0 ;;
        --reason) REASON="$2"; shift 2 ;;
        --artifact) ARTIFACTS+=("$2"); shift 2 ;;
        --gate) GATE_NAME="$2"; shift 2 ;;
        --gate-passed) GATE_PASSED="true"; shift ;;
        --gate-failed) GATE_PASSED="false"; shift ;;
        -*)  error "未知选项: $1" ;;
        *)
            if [[ -z "$FEATURE" ]]; then FEATURE="$1"
            elif [[ -z "$STAGE" ]]; then STAGE="$1"
            elif [[ -z "$STATUS" ]]; then STATUS="$1"
            else error "多余的参数: $1"
            fi
            shift ;;
    esac
done

[[ -z "$FEATURE" ]] && error "缺少 feature 参数"
[[ -z "$STAGE" ]] && error "缺少 stage 参数"
[[ -z "$STATUS" ]] && error "缺少 status 参数"
[[ "$STAGE" =~ ^[1-4]$ ]] || error "stage 必须是 1-4"
echo "$VALID_STATUSES" | grep -qw "$STATUS" || error "无效状态: $STATUS（允许: $VALID_STATUSES）"

EXEC_JSON=".boss/$FEATURE/.meta/execution.json"
[[ -f "$EXEC_JSON" ]] || error "未找到执行文件: $EXEC_JSON"

command -v jq >/dev/null 2>&1 || error "需要 jq 工具（brew install jq）"

CURRENT_STATUS=$(jq -r ".stages[\"$STAGE\"].status" "$EXEC_JSON")

validate_transition() {
    local from="$1" to="$2"
    case "${from}:${to}" in
        pending:running|pending:skipped) return 0 ;;
        running:completed|running:failed) return 0 ;;
        failed:retrying) return 0 ;;
        retrying:running) return 0 ;;
        completed:running) return 0 ;;
        *) return 1 ;;
    esac
}

if ! validate_transition "$CURRENT_STATUS" "$STATUS"; then
    error "无效的状态转换: $CURRENT_STATUS → $STATUS（阶段 $STAGE）"
fi

# 事件溯源：追加事件 → 物化状态
EVENTS_FILE=".boss/$FEATURE/.meta/events.jsonl"

# 映射 status 到事件类型
EVENT_TYPE=""
case "$STATUS" in
    running)   EVENT_TYPE="StageStarted" ;;
    completed) EVENT_TYPE="StageCompleted" ;;
    failed)    EVENT_TYPE="StageFailed" ;;
    retrying)  EVENT_TYPE="StageRetrying" ;;
    skipped)   EVENT_TYPE="StageSkipped" ;;
esac

# 追加主事件
APPEND_ARGS=("$FEATURE" "$EVENT_TYPE" --stage "$STAGE")
if [[ -n "$REASON" ]]; then
    APPEND_ARGS+=(--reason "$REASON")
fi

"$SCRIPT_DIR/append-event.sh" "${APPEND_ARGS[@]}"

# 发射进度事件
PROGRESS_FILE=".boss/$FEATURE/.meta/progress.jsonl"
PROGRESS_TYPE=""
case "$STATUS" in
    running)   PROGRESS_TYPE="stage-start" ;;
    completed) PROGRESS_TYPE="stage-complete" ;;
    failed)    PROGRESS_TYPE="stage-failed" ;;
esac
if [[ -n "$PROGRESS_TYPE" ]]; then
    NOW_P="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "{\"timestamp\":\"$NOW_P\",\"type\":\"$PROGRESS_TYPE\",\"data\":{\"stage\":$STAGE}}" >> "$PROGRESS_FILE"
fi

# 追加产物事件
for artifact in "${ARTIFACTS[@]}"; do
    "$SCRIPT_DIR/append-event.sh" "$FEATURE" ArtifactRecorded --artifact "$artifact" --stage "$STAGE"
done

# 追加门禁事件
if [[ -n "$GATE_NAME" && -n "$GATE_PASSED" ]]; then
    "$SCRIPT_DIR/append-event.sh" "$FEATURE" GateEvaluated --gate "$GATE_NAME" --passed "$GATE_PASSED" --stage "$STAGE"
fi

# 物化状态
"$SCRIPT_DIR/materialize-state.sh" "$FEATURE"

success "阶段 $STAGE: $CURRENT_STATUS → $STATUS"
info "文件: $EXEC_JSON"
