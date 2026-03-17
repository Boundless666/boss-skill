#!/bin/bash
# Boss Mode - 产物骨架准备脚本
# 用途：在真正写文档前，按模板优先级为当前产物准备文档骨架

set -e

error() {
    echo "[ERROR] $1" >&2
    exit 1
}

info() {
    echo "[INFO] $1"
}

if [[ $# -lt 2 || $# -gt 3 ]]; then
    error "用法: $0 <feature-name> <artifact-name> [template-name]"
fi

FEATURE_NAME="$1"
ARTIFACT_NAME="$2"
TEMPLATE_NAME="${3:-$ARTIFACT_NAME.template}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR=".boss/$FEATURE_NAME"
TARGET_PATH="$TARGET_DIR/$ARTIFACT_NAME"
DATE="$(date +%Y-%m-%d)"

if [[ ! -d "$TARGET_DIR" ]]; then
    error "目标目录不存在: $TARGET_DIR，请先执行 scripts/init-project.sh $FEATURE_NAME"
fi

TEMPLATE_PATH="$("$SCRIPT_DIR/resolve-template.sh" "$TEMPLATE_NAME")"
CONTENT="$(cat "$TEMPLATE_PATH")"

CONTENT="${CONTENT//'{{FEATURE_NAME}}'/$FEATURE_NAME}"
CONTENT="${CONTENT//'{{FEATURE}}'/$FEATURE_NAME}"
CONTENT="${CONTENT//'{{PROJECT_NAME}}'/$FEATURE_NAME}"
CONTENT="${CONTENT//'{{DATE}}'/$DATE}"
CONTENT="${CONTENT//'{{VERSION}}'/1.0}"

printf '%s\n' "$CONTENT" > "$TARGET_PATH"
info "已按模板优先级准备产物骨架: $TARGET_PATH <- $TEMPLATE_PATH"
