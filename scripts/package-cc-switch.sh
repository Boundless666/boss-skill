#!/bin/bash
# Boss Skill - cc-switch 打包脚本
# 用途：生成适合 cc-switch 导入的 zip 包（包含顶层 boss/ 目录）

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$REPO_ROOT/dist"
STAGING_DIR="$DIST_DIR/cc-switch-package"
SKILL_DIR="$STAGING_DIR/boss"
OUTPUT_ZIP="${1:-$DIST_DIR/boss-skill-cc-switch.zip}"

rm -rf "$STAGING_DIR"
mkdir -p "$SKILL_DIR"

cp -R \
  "$REPO_ROOT/SKILL.md" \
  "$REPO_ROOT/agents" \
  "$REPO_ROOT/references" \
  "$REPO_ROOT/templates" \
  "$REPO_ROOT/scripts" \
  "$REPO_ROOT/README.md" \
  "$REPO_ROOT/LICENSE" \
  "$SKILL_DIR/"

mkdir -p "$(dirname "$OUTPUT_ZIP")"
rm -f "$OUTPUT_ZIP"

(
  cd "$STAGING_DIR"
  zip -r "$OUTPUT_ZIP" boss
)

echo "已生成 cc-switch 安装包: $OUTPUT_ZIP"
