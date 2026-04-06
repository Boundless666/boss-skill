#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
LOG_TAG="PROGRESS"

show_help() {
    cat << 'EOF'
Boss Harness - 实时进度监控

用法: watch-progress.sh <feature> [options]

实时显示流水线进度事件流（tail -f progress.jsonl）。

参数:
  feature   功能名称

选项:
  --type <type>   只显示指定类型的事件
  --raw           输出原始 JSONL（不格式化）

示例:
  watch-progress.sh my-feature
  watch-progress.sh my-feature --type gate-result
  watch-progress.sh my-feature --raw
EOF
}

FEATURE=""
FILTER_TYPE=""
RAW=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) show_help; exit 0 ;;
        --type) FILTER_TYPE="$2"; shift 2 ;;
        --raw) RAW=true; shift ;;
        -*)  error "未知选项: $1" ;;
        *)
            if [[ -z "$FEATURE" ]]; then FEATURE="$1"
            else error "多余的参数: $1"
            fi
            shift ;;
    esac
done

[[ -z "$FEATURE" ]] && error "缺少 feature 参数"

PROGRESS_FILE=".boss/$FEATURE/.meta/progress.jsonl"

if [[ ! -f "$PROGRESS_FILE" ]]; then
    info "等待进度文件创建: $PROGRESS_FILE" >&2
    while [[ ! -f "$PROGRESS_FILE" ]]; do
        sleep 1
    done
fi

if command -v jq >/dev/null 2>&1; then
    if [[ "$RAW" == true ]]; then
        tail -f "$PROGRESS_FILE"
    elif [[ -n "$FILTER_TYPE" ]]; then
        tail -f "$PROGRESS_FILE" | jq --arg t "$FILTER_TYPE" 'select(.type == $t)'
    else
        tail -f "$PROGRESS_FILE" | jq .
    fi
else
    tail -f "$PROGRESS_FILE"
fi
