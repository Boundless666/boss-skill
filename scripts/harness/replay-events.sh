#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
LOG_TAG="REPLAY"

show_help() {
    cat << 'EOF'
Boss Harness - 事件回放

用法: replay-events.sh <feature> [options]

回放 events.jsonl 中的事件，显示每个事件对状态的影响。

参数:
  feature   功能名称

选项:
  --at <id>            显示指定事件 ID 时的状态快照
  --type <type>        只显示指定类型的事件
  --compact            紧凑输出（每个事件一行）

示例:
  replay-events.sh my-feature                  # 回放所有事件
  replay-events.sh my-feature --at 5           # 显示第 5 个事件后的状态
  replay-events.sh my-feature --type StageFailed  # 只看失败事件
  replay-events.sh my-feature --compact        # 紧凑模式
EOF
}

FEATURE=""
AT_EVENT=""
TYPE_FILTER=""
COMPACT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) show_help; exit 0 ;;
        --at) AT_EVENT="$2"; shift 2 ;;
        --type) TYPE_FILTER="$2"; shift 2 ;;
        --compact) COMPACT=true; shift ;;
        -*)  error "未知选项: $1" ;;
        *)
            if [[ -z "$FEATURE" ]]; then FEATURE="$1"
            else error "多余的参数: $1"
            fi
            shift ;;
    esac
done

[[ -z "$FEATURE" ]] && error "缺少 feature 参数"

EVENTS_FILE=".boss/$FEATURE/.meta/events.jsonl"
[[ -f "$EVENTS_FILE" ]] || error "未找到事件文件: $EVENTS_FILE"
command -v jq >/dev/null 2>&1 || error "需要 jq 工具（brew install jq）"

# 如果指定了 --at，截取前 N 行送入 materialize
if [[ -n "$AT_EVENT" ]]; then
    TMP_EVENTS=$(mktemp)
    trap 'rm -f "$TMP_EVENTS"' EXIT
    head -n "$AT_EVENT" "$EVENTS_FILE" > "$TMP_EVENTS"

    info "显示第 $AT_EVENT 个事件后的状态快照："
    echo ""

    jq -s '
    reduce .[] as $event (
      {};
      . * (if $event.type == "PipelineInitialized" then $event.data.initialState // {}
      elif $event.type == "StageStarted" then
        { stages: { ($event.data.stage | tostring): { status: "running" } } }
      elif $event.type == "StageCompleted" then
        { stages: { ($event.data.stage | tostring): { status: "completed" } } }
      elif $event.type == "StageFailed" then
        { stages: { ($event.data.stage | tostring): { status: "failed" } }, status: "failed" }
      else {} end)
    )' "$TMP_EVENTS"
    exit 0
fi

# 回放所有事件
TOTAL=$(wc -l < "$EVENTS_FILE" | tr -d ' ')
info "回放 $TOTAL 条事件："
echo ""

while IFS= read -r line; do
    [[ -z "$line" ]] && continue

    EVENT_TYPE=$(echo "$line" | jq -r '.type')
    EVENT_ID=$(echo "$line" | jq -r '.id')
    TIMESTAMP=$(echo "$line" | jq -r '.timestamp')

    # 类型过滤
    if [[ -n "$TYPE_FILTER" && "$EVENT_TYPE" != "$TYPE_FILTER" ]]; then
        continue
    fi

    if [[ "$COMPACT" == true ]]; then
        STAGE=$(echo "$line" | jq -r '.data.stage // "-"')
        AGENT=$(echo "$line" | jq -r '.data.agent // "-"')
        echo "#${EVENT_ID} [${TIMESTAMP}] ${EVENT_TYPE} stage=${STAGE} agent=${AGENT}"
    else
        echo "═══ 事件 #${EVENT_ID} ═══"
        echo "$line" | jq '.'
        echo ""
    fi
done < "$EVENTS_FILE"
