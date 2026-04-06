#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
LOG_TAG="HARNESS"

show_help() {
    cat << 'EOF'
Boss Harness - Agent 状态更新

用法: update-agent.sh <feature> <stage> <agent-name> <status> [options]

参数:
  feature      功能名称
  stage        阶段编号 (1-4)
  agent-name   Agent 名称（如 boss-pm、boss-frontend）
  status       目标状态: pending | running | completed | failed

选项:
  --reason <text>   失败原因（status=failed 时使用）

示例:
  update-agent.sh my-feature 1 boss-pm running
  update-agent.sh my-feature 3 boss-qa failed --reason "测试覆盖率不足"
EOF
}

VALID_STATUSES="pending running completed failed"

FEATURE=""
STAGE=""
AGENT_NAME=""
STATUS=""
REASON=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) show_help; exit 0 ;;
        --reason) REASON="$2"; shift 2 ;;
        -*)  error "未知选项: $1" ;;
        *)
            if [[ -z "$FEATURE" ]]; then FEATURE="$1"
            elif [[ -z "$STAGE" ]]; then STAGE="$1"
            elif [[ -z "$AGENT_NAME" ]]; then AGENT_NAME="$1"
            elif [[ -z "$STATUS" ]]; then STATUS="$1"
            else error "多余的参数: $1"
            fi
            shift ;;
    esac
done

[[ -z "$FEATURE" ]] && error "缺少 feature 参数"
[[ -z "$STAGE" ]] && error "缺少 stage 参数"
[[ -z "$AGENT_NAME" ]] && error "缺少 agent-name 参数"
[[ -z "$STATUS" ]] && error "缺少 status 参数"
[[ "$STAGE" =~ ^[1-4]$ ]] || error "stage 必须是 1-4"
echo "$VALID_STATUSES" | grep -qw "$STATUS" || error "无效状态: $STATUS"

EXEC_JSON=".boss/$FEATURE/.meta/execution.json"
[[ -f "$EXEC_JSON" ]] || error "未找到执行文件: $EXEC_JSON"
command -v jq >/dev/null 2>&1 || error "需要 jq 工具"

# 映射 status 到事件类型
EVENT_TYPE=""
case "$STATUS" in
    running)   EVENT_TYPE="AgentStarted" ;;
    completed) EVENT_TYPE="AgentCompleted" ;;
    failed)    EVENT_TYPE="AgentFailed" ;;
esac

if [[ -n "$EVENT_TYPE" ]]; then
    APPEND_ARGS=("$FEATURE" "$EVENT_TYPE" --agent "$AGENT_NAME" --stage "$STAGE")
    if [[ -n "$REASON" ]]; then
        APPEND_ARGS+=(--reason "$REASON")
    fi
    "$SCRIPT_DIR/append-event.sh" "${APPEND_ARGS[@]}"
    "$SCRIPT_DIR/materialize-state.sh" "$FEATURE"
fi

success "Agent $AGENT_NAME (阶段 $STAGE): → $STATUS"
