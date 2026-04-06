#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
LOG_TAG="PACK-DETECT"

show_help() {
    cat << 'EOF'
Boss Harness - Pipeline Pack 自动检测

用法: detect-pack.sh [project-dir]

根据项目文件自动选择最佳 pipeline pack。
扫描 harness/pipeline-packs/ 中带 "when" 条件的 pack，
按 priority 排序返回第一个匹配的 pack 名称。

参数:
  project-dir   项目根目录（默认当前目录）

输出:
  匹配的 pack 名称（如 "solana-contract"），无匹配则输出 "default"

示例:
  detect-pack.sh                    # 检测当前目录
  detect-pack.sh /path/to/project   # 检测指定目录
  detect-pack.sh --json             # JSON 格式输出检测过程
EOF
}

PROJECT_DIR="."
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) show_help; exit 0 ;;
        --json) JSON_OUTPUT=true; shift ;;
        -*) error "未知选项: $1" ;;
        *) PROJECT_DIR="$1"; shift ;;
    esac
done

PACK_DIR="$REPO_ROOT/harness/pipeline-packs"
[[ -d "$PACK_DIR" ]] || error "未找到 pipeline-packs 目录: $PACK_DIR"
command -v jq >/dev/null 2>&1 || error "需要 jq 工具（brew install jq）"

# 检查 fileExists 条件：所有指定文件必须存在
check_file_exists() {
    local project_dir="$1"
    local files_json="$2"

    local count
    count=$(echo "$files_json" | jq -r 'length')
    for ((i=0; i<count; i++)); do
        local file
        file=$(echo "$files_json" | jq -r ".[$i]")
        if [[ ! -e "$project_dir/$file" ]]; then
            return 1
        fi
    done
    return 0
}

# 检查 noFileExists 条件：所有指定文件必须不存在
check_no_file_exists() {
    local project_dir="$1"
    local files_json="$2"

    local count
    count=$(echo "$files_json" | jq -r 'length')
    for ((i=0; i<count; i++)); do
        local file
        file=$(echo "$files_json" | jq -r ".[$i]")
        if [[ -e "$project_dir/$file" ]]; then
            return 1
        fi
    done
    return 0
}

# 检查 packageJsonHas 条件：package.json 的 dependencies/devDependencies 中包含指定包
check_package_json_has() {
    local project_dir="$1"
    local deps_json="$2"

    local pkg_file="$project_dir/package.json"
    [[ -f "$pkg_file" ]] || return 1

    local count
    count=$(echo "$deps_json" | jq -r 'length')
    for ((i=0; i<count; i++)); do
        local dep
        dep=$(echo "$deps_json" | jq -r ".[$i]")
        local found
        found=$(jq -r "(.dependencies[\"$dep\"] // .devDependencies[\"$dep\"]) // empty" "$pkg_file" 2>/dev/null)
        if [[ -z "$found" ]]; then
            return 1
        fi
    done
    return 0
}

# 评估 when 条件
evaluate_when() {
    local project_dir="$1"
    local when_json="$2"

    # fileExists
    local file_exists
    file_exists=$(echo "$when_json" | jq -r '.fileExists // empty')
    if [[ -n "$file_exists" && "$file_exists" != "null" ]]; then
        if ! check_file_exists "$project_dir" "$file_exists"; then
            return 1
        fi
    fi

    # noFileExists
    local no_file_exists
    no_file_exists=$(echo "$when_json" | jq -r '.noFileExists // empty')
    if [[ -n "$no_file_exists" && "$no_file_exists" != "null" ]]; then
        if ! check_no_file_exists "$project_dir" "$no_file_exists"; then
            return 1
        fi
    fi

    # packageJsonHas
    local pkg_has
    pkg_has=$(echo "$when_json" | jq -r '.packageJsonHas // empty')
    if [[ -n "$pkg_has" && "$pkg_has" != "null" ]]; then
        if ! check_package_json_has "$project_dir" "$pkg_has"; then
            return 1
        fi
    fi

    return 0
}

# 收集所有带 when 条件的 pack，按 priority 排序
MATCHES=()

for pack_dir in "$PACK_DIR"/*/; do
    pipeline_json="$pack_dir/pipeline.json"
    [[ -f "$pipeline_json" ]] || continue

    pack_name=$(jq -r '.name' "$pipeline_json")
    enabled=$(jq -r '.enabled // true' "$pipeline_json")
    [[ "$enabled" == "true" ]] || continue

    when_json=$(jq -r '.when // empty' "$pipeline_json")
    [[ -n "$when_json" && "$when_json" != "null" ]] || continue

    priority=$(jq -r '.priority // 0' "$pipeline_json")

    if evaluate_when "$PROJECT_DIR" "$when_json"; then
        MATCHES+=("$priority:$pack_name")
        info "匹配: $pack_name (priority=$priority)" >&2
    fi
done

if [[ ${#MATCHES[@]} -eq 0 ]]; then
    if [[ "$JSON_OUTPUT" == true ]]; then
        echo '{"detected": "default", "matched": [], "reason": "no pack matched"}'
    else
        echo "default"
    fi
    exit 0
fi

# 按 priority 降序排序，取最高优先级
IFS=$'\n' SORTED=($(printf '%s\n' "${MATCHES[@]}" | sort -t: -k1 -nr))
BEST="${SORTED[0]#*:}"

if [[ "$JSON_OUTPUT" == true ]]; then
    MATCHED_LIST=$(printf '%s\n' "${MATCHES[@]}" | sed 's/[0-9]*://' | jq -R . | jq -s .)
    jq -n --arg detected "$BEST" --argjson matched "$MATCHED_LIST" \
        '{"detected": $detected, "matched": $matched}'
else
    echo "$BEST"
fi
