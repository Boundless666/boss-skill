#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
LOG_TAG="FEEDBACK"

show_help() {
    cat << 'EOF'
Boss Harness - 反馈循环记录

用法: record-feedback.sh <feature> --from <agent> --to <agent> --artifact <name> --reason <text>

记录 Agent 间的反馈请求（REVISION_NEEDED），追加事件并物化反馈循环状态。

参数:
  feature   功能名称

选项:
  --from <agent>       发起修订请求的 Agent（如 boss-tech-lead）
  --to <agent>         需要修订的上游 Agent（如 boss-architect）
  --artifact <name>    需要修订的产物（如 architecture.md）
  --reason <text>      修订原因
  --priority <level>   优先级: critical | recommended（默认 recommended）

示例:
  record-feedback.sh my-feature --from boss-tech-lead --to boss-architect --artifact architecture.md --reason "缺少缓存策略"
  record-feedback.sh my-feature --from boss-qa --to boss-backend --artifact code --reason "API 返回格式不一致" --priority critical
EOF
}

FEATURE=""
FROM_AGENT=""
TO_AGENT=""
ARTIFACT=""
REASON=""
PRIORITY="recommended"

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) show_help; exit 0 ;;
        --from) FROM_AGENT="$2"; shift 2 ;;
        --to) TO_AGENT="$2"; shift 2 ;;
        --artifact) ARTIFACT="$2"; shift 2 ;;
        --reason) REASON="$2"; shift 2 ;;
        --priority) PRIORITY="$2"; shift 2 ;;
        -*)  error "未知选项: $1" ;;
        *)
            if [[ -z "$FEATURE" ]]; then FEATURE="$1"
            else error "多余的参数: $1"
            fi
            shift ;;
    esac
done

[[ -z "$FEATURE" ]] && error "缺少 feature 参数"
[[ -z "$FROM_AGENT" ]] && error "缺少 --from 参数"
[[ -z "$TO_AGENT" ]] && error "缺少 --to 参数"
[[ -z "$ARTIFACT" ]] && error "缺少 --artifact 参数"
[[ -z "$REASON" ]] && error "缺少 --reason 参数"

EXEC_JSON=".boss/$FEATURE/.meta/execution.json"
[[ -f "$EXEC_JSON" ]] || error "未找到执行文件: $EXEC_JSON"
command -v jq >/dev/null 2>&1 || error "需要 jq 工具"

# Check feedback loop limits
CURRENT_ROUND=$(jq -r '.feedbackLoops.currentRound // 0' "$EXEC_JSON")
MAX_ROUNDS=$(jq -r '.feedbackLoops.maxRounds // 2' "$EXEC_JSON")

if [[ "$CURRENT_ROUND" -ge "$MAX_ROUNDS" ]]; then
    error "反馈循环已达上限（$CURRENT_ROUND/$MAX_ROUNDS），不再接受修订请求。请向用户报告"
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

NEW_ROUND=$((CURRENT_ROUND + 1))

# Append event and re-materialize state
EVENT_DATA=$(jq -cn \
    --arg from "$FROM_AGENT" \
    --arg to "$TO_AGENT" \
    --arg artifact "$ARTIFACT" \
    --arg reason "$REASON" \
    --arg priority "$PRIORITY" \
    '{from: $from, to: $to, artifact: $artifact, reason: $reason, priority: $priority}')
"$SCRIPT_DIR/append-event.sh" "$FEATURE" RevisionRequested --data "$EVENT_DATA"
"$SCRIPT_DIR/materialize-state.sh" "$FEATURE" >/dev/null

info "反馈循环 #$NEW_ROUND/$MAX_ROUNDS: $FROM_AGENT → $TO_AGENT ($ARTIFACT)"
info "原因: $REASON"

if [[ "$NEW_ROUND" -ge "$MAX_ROUNDS" ]]; then
    warn "⚠️ 已达反馈循环上限，下次将无法再请求修订"
fi

success "修订请求已记录"
