#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
LOG_TAG="DAG"

show_help() {
    cat << 'EOF'
Boss Harness - Artifact DAG 检查

用法: check-artifact.sh <feature> <artifact> [options]

检查指定产物在 DAG 中的就绪状态。

参数:
  feature     功能名称
  artifact    产物名称（如 prd.md、architecture.md、code）

选项:
  --can-start       检查该产物的所有输入依赖是否已就绪
  --ready           列出所有当前可以开始的产物
  --dag <path>      指定 DAG 文件路径（默认 harness/artifact-dag.json）
  --json            JSON 格式输出

示例:
  check-artifact.sh my-feature architecture.md --can-start
  check-artifact.sh my-feature --ready
  check-artifact.sh my-feature --ready --json
EOF
}

FEATURE=""
ARTIFACT=""
CAN_START=false
READY=false
DAG_PATH=""
JSON_OUTPUT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help) show_help; exit 0 ;;
        --can-start) CAN_START=true; shift ;;
        --ready) READY=true; shift ;;
        --dag) DAG_PATH="$2"; shift 2 ;;
        --json) JSON_OUTPUT=true; shift ;;
        -*)  error "未知选项: $1" ;;
        *)
            if [[ -z "$FEATURE" ]]; then FEATURE="$1"
            elif [[ -z "$ARTIFACT" ]]; then ARTIFACT="$1"
            else error "多余的参数: $1"
            fi
            shift ;;
    esac
done

[[ -z "$FEATURE" ]] && error "缺少 feature 参数"

# Find DAG file
if [[ -z "$DAG_PATH" ]]; then
    # Check pipeline pack first
    EXEC_JSON=".boss/$FEATURE/.meta/execution.json"
    if [[ -f "$EXEC_JSON" ]]; then
        PACK_NAME=$(jq -r '.parameters.pipelinePack // "default"' "$EXEC_JSON")
        PACK_DAG="harness/pipeline-packs/$PACK_NAME/artifact-dag.json"
        if [[ -f "$PACK_DAG" ]]; then
            DAG_PATH="$PACK_DAG"
        fi
    fi
    # Fallback to default
    if [[ -z "$DAG_PATH" ]]; then
        DAG_PATH="harness/artifact-dag.json"
    fi
fi

[[ -f "$DAG_PATH" ]] || error "未找到 DAG 文件: $DAG_PATH"
command -v jq >/dev/null 2>&1 || error "需要 jq 工具"

EXEC_JSON=".boss/$FEATURE/.meta/execution.json"
[[ -f "$EXEC_JSON" ]] || error "未找到执行文件: $EXEC_JSON"

# Get completed artifacts from execution.json
COMPLETED_ARTIFACTS=$(jq -r '[.stages[].artifacts[]?] | unique | .[]' "$EXEC_JSON" 2>/dev/null || echo "")

# Get skipped artifacts (optional artifacts in skipped stages or --skip-ui etc)
SKIP_UI=$(jq -r '.parameters.skipUI // false' "$EXEC_JSON")
SKIP_DEPLOY=$(jq -r '.parameters.skipDeploy // false' "$EXEC_JSON")

is_artifact_done() {
    local name="$1"
    # design-brief is done if file exists or if it's optional and we're past step 0
    if [[ "$name" == "design-brief" ]]; then
        [[ -f ".boss/$FEATURE/design-brief.md" ]] && return 0
        # design-brief is optional, treat as done if prd.md exists
        echo "$COMPLETED_ARTIFACTS" | grep -qw "prd.md" && return 0
        return 1
    fi
    # code is a virtual artifact, done if stage 3 agents completed
    if [[ "$name" == "code" ]]; then
        local stage3_status=$(jq -r '.stages["3"].status' "$EXEC_JSON")
        # Check if dev agents completed
        local frontend_status=$(jq -r '.stages["3"].agents["boss-frontend"].status // "N/A"' "$EXEC_JSON" 2>/dev/null)
        local backend_status=$(jq -r '.stages["3"].agents["boss-backend"].status // "N/A"' "$EXEC_JSON" 2>/dev/null)
        if [[ "$frontend_status" == "completed" || "$frontend_status" == "N/A" ]] && \
           [[ "$backend_status" == "completed" || "$backend_status" == "N/A" ]]; then
            [[ "$frontend_status" == "completed" || "$backend_status" == "completed" ]] && return 0
        fi
        return 1
    fi
    echo "$COMPLETED_ARTIFACTS" | grep -qw "$name" && return 0
    return 1
}

is_artifact_skipped() {
    local name="$1"
    if [[ "$name" == "ui-spec.md" && "$SKIP_UI" == "true" ]]; then return 0; fi
    if [[ "$name" == "deploy-report.md" && "$SKIP_DEPLOY" == "true" ]]; then return 0; fi
    return 1
}

is_input_satisfied() {
    local input="$1"
    is_artifact_done "$input" && return 0
    is_artifact_skipped "$input" && return 0
    # Check if input is optional in DAG
    local optional=$(jq -r --arg a "$input" '.artifacts[$a].optional // false' "$DAG_PATH")
    [[ "$optional" == "true" ]] && return 0
    return 1
}

if [[ "$CAN_START" == true ]]; then
    [[ -z "$ARTIFACT" ]] && error "--can-start 需要指定 artifact"

    # Check artifact exists in DAG
    HAS_ARTIFACT=$(jq -r --arg a "$ARTIFACT" '.artifacts[$a] // empty' "$DAG_PATH")
    [[ -z "$HAS_ARTIFACT" ]] && error "DAG 中未定义产物: $ARTIFACT"

    # Check if already done
    if is_artifact_done "$ARTIFACT"; then
        info "$ARTIFACT 已完成"
        exit 0
    fi

    # Check all inputs
    INPUTS=$(jq -r --arg a "$ARTIFACT" '.artifacts[$a].inputs[]' "$DAG_PATH" 2>/dev/null || echo "")
    ALL_READY=true
    MISSING=""
    for input in $INPUTS; do
        if ! is_input_satisfied "$input"; then
            ALL_READY=false
            MISSING="$MISSING $input"
        fi
    done

    if [[ "$ALL_READY" == true ]]; then
        success "$ARTIFACT 可以开始（所有依赖已就绪）"
        exit 0
    else
        error "$ARTIFACT 不能开始，缺少依赖:$MISSING"
    fi
fi

if [[ "$READY" == true ]]; then
    READY_LIST=()

    for artifact in $(jq -r '.artifacts | keys[]' "$DAG_PATH"); do
        # Skip if already done or skipped
        is_artifact_done "$artifact" && continue
        is_artifact_skipped "$artifact" && continue

        # Skip if no agent (like design-brief, it's a manual input)
        AGENT=$(jq -r --arg a "$artifact" '.artifacts[$a].agent' "$DAG_PATH")
        [[ "$AGENT" == "null" ]] && continue

        # Check all inputs
        INPUTS=$(jq -r --arg a "$artifact" '.artifacts[$a].inputs[]' "$DAG_PATH" 2>/dev/null || echo "")
        ALL_READY=true
        for input in $INPUTS; do
            if ! is_input_satisfied "$input"; then
                ALL_READY=false
                break
            fi
        done

        if [[ "$ALL_READY" == true ]]; then
            READY_LIST+=("$artifact")
        fi
    done

    if [[ ${#READY_LIST[@]} -eq 0 ]]; then
        if [[ "$JSON_OUTPUT" == true ]]; then
            echo "[]"
        else
            info "没有就绪的产物"
        fi
        exit 0
    fi

    if [[ "$JSON_OUTPUT" == true ]]; then
        printf '%s\n' "${READY_LIST[@]}" | jq -R . | jq -s .
    else
        echo "就绪的产物："
        for a in "${READY_LIST[@]}"; do
            AGENT=$(jq -r --arg a "$a" '.artifacts[$a].agent' "$DAG_PATH")
            STAGE=$(jq -r --arg a "$a" '.artifacts[$a].stage' "$DAG_PATH")
            echo "  ✅ $a (Agent: $AGENT, 阶段: $STAGE)"
        done
    fi
    exit 0
fi

# Default: show artifact status
if [[ -n "$ARTIFACT" ]]; then
    HAS_ARTIFACT=$(jq -r --arg a "$ARTIFACT" '.artifacts[$a] // empty' "$DAG_PATH")
    [[ -z "$HAS_ARTIFACT" ]] && error "DAG 中未定义产物: $ARTIFACT"

    if is_artifact_done "$ARTIFACT"; then
        echo "$ARTIFACT: completed"
    elif is_artifact_skipped "$ARTIFACT"; then
        echo "$ARTIFACT: skipped"
    else
        echo "$ARTIFACT: pending"
    fi
else
    # Show all artifacts
    for artifact in $(jq -r '.artifacts | keys[]' "$DAG_PATH"); do
        if is_artifact_done "$artifact"; then
            echo "  ✅ $artifact"
        elif is_artifact_skipped "$artifact"; then
            echo "  ⏭️  $artifact (skipped)"
        else
            echo "  ⏳ $artifact"
        fi
    done
fi
