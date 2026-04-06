#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
LOG_TAG="HARNESS"

show_help() {
    cat << 'EOF'
Boss Harness - Agent 重试

用法: retry-agent.sh <feature> <stage> <agent-name>

重试指定阶段中失败的单个 Agent，不重跑整个阶段。

参数:
  feature      功能名称
  stage        阶段编号 (1-4)
  agent-name   Agent 名称

示例:
  retry-agent.sh my-feature 3 boss-qa
EOF
}

if [[ $# -lt 3 ]]; then
    show_help
    exit 1
fi

FEATURE="$1"
STAGE="$2"
AGENT_NAME="$3"

[[ "$STAGE" =~ ^[1-4]$ ]] || error "stage 必须是 1-4"

EXEC_JSON=".boss/$FEATURE/.meta/execution.json"
[[ -f "$EXEC_JSON" ]] || error "未找到执行文件: $EXEC_JSON"
command -v jq >/dev/null 2>&1 || error "需要 jq 工具"

# 检查 agent 状态
AGENT_STATUS=$(jq -r --arg s "$STAGE" --arg a "$AGENT_NAME" \
    '.stages[$s].agents[$a].status // "unknown"' "$EXEC_JSON")
RETRY_COUNT=$(jq -r --arg s "$STAGE" --arg a "$AGENT_NAME" \
    '.stages[$s].agents[$a].retryCount // 0' "$EXEC_JSON")
MAX_RETRIES=$(jq -r --arg s "$STAGE" --arg a "$AGENT_NAME" \
    '.stages[$s].agents[$a].maxRetries // 2' "$EXEC_JSON")

if [[ "$AGENT_STATUS" != "failed" ]]; then
    error "Agent $AGENT_NAME 状态为 $AGENT_STATUS，只有 failed 状态可以重试"
fi

if [[ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]]; then
    error "Agent $AGENT_NAME 已达最大重试次数（$RETRY_COUNT/$MAX_RETRIES）"
fi

info "重试 Agent $AGENT_NAME（第 $((RETRY_COUNT + 1)) 次，上限 $MAX_RETRIES）"

# 更新 agent 状态为 running
"$SCRIPT_DIR/update-agent.sh" "$FEATURE" "$STAGE" "$AGENT_NAME" running

# 更新 retryCount（直接修改 execution.json）
TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT
jq --arg s "$STAGE" --arg a "$AGENT_NAME" \
    '.stages[$s].agents[$a].retryCount += 1' "$EXEC_JSON" > "$TMP_FILE" && mv "$TMP_FILE" "$EXEC_JSON"

success "Agent $AGENT_NAME 已重置为 running"
