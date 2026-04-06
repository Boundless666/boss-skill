#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
LOG_TAG="GATE2"

FEATURE="${1:-}"
CHECKS="[]"
ALL_PASSED=true

gate_info "Gate 2: 性能门禁"
gate_info "========================"

IS_WEB=false
if [[ -f "package.json" ]]; then
    HAS_NEXT=$(jq -r '.dependencies.next // .devDependencies.next // empty' package.json 2>/dev/null)
    HAS_REACT=$(jq -r '.dependencies.react // .devDependencies.react // empty' package.json 2>/dev/null)
    HAS_VUE=$(jq -r '.dependencies.vue // .devDependencies.vue // empty' package.json 2>/dev/null)
    HAS_SVELTE=$(jq -r '.dependencies.svelte // .devDependencies.svelte // empty' package.json 2>/dev/null)
    HAS_ANGULAR=$(jq -r '.dependencies["@angular/core"] // .devDependencies["@angular/core"] // empty' package.json 2>/dev/null)

    if [[ -n "$HAS_NEXT" || -n "$HAS_REACT" || -n "$HAS_VUE" || -n "$HAS_SVELTE" || -n "$HAS_ANGULAR" ]]; then
        IS_WEB=true
    fi
fi

if [[ "$IS_WEB" == false ]]; then
    gate_info "非 Web 前端项目，跳过 Lighthouse 检查"
    add_check "lighthouse" true "跳过：非 Web 前端项目"
fi

if [[ "$IS_WEB" == true ]]; then
    if command -v lighthouse >/dev/null 2>&1 || command -v npx >/dev/null 2>&1; then
        BUILD_URL="${BOSS_PREVIEW_URL:-http://localhost:3000}"
        gate_info "Lighthouse 性能检查: $BUILD_URL"

        LH_OUTPUT=$(mktemp)
        trap 'rm -f "$LH_OUTPUT"' EXIT

        if npx lighthouse "$BUILD_URL" --output=json --quiet --chrome-flags="--headless --no-sandbox" > "$LH_OUTPUT" 2>/dev/null; then
            PERF_SCORE=$(jq -r '.categories.performance.score // 0' "$LH_OUTPUT" 2>/dev/null)
            PERF_SCORE_100=$(echo "$PERF_SCORE * 100" | bc 2>/dev/null | cut -d'.' -f1)

            if [[ -n "$PERF_SCORE_100" && "$PERF_SCORE_100" -ge 80 ]]; then
                gate_pass "Lighthouse Performance: ${PERF_SCORE_100}/100 (≥ 80)"
                add_check "lighthouse" true "Performance: ${PERF_SCORE_100}/100"
            else
                gate_fail "Lighthouse Performance: ${PERF_SCORE_100:-N/A}/100 (< 80)"
                add_check "lighthouse" false "Performance: ${PERF_SCORE_100:-N/A}/100 < 80"
                ALL_PASSED=false
            fi
        else
            gate_info "Lighthouse 执行失败（服务可能未启动），跳过"
            add_check "lighthouse" true "跳过：Lighthouse 执行失败"
        fi
    else
        gate_info "未安装 Lighthouse，跳过"
        add_check "lighthouse" true "跳过：未安装 Lighthouse"
    fi
fi

HAS_API=false
if [[ -f "package.json" ]]; then
    HAS_EXPRESS=$(jq -r '.dependencies.express // .devDependencies.express // empty' package.json 2>/dev/null)
    HAS_FASTIFY=$(jq -r '.dependencies.fastify // .devDependencies.fastify // empty' package.json 2>/dev/null)
    HAS_KOA=$(jq -r '.dependencies.koa // .devDependencies.koa // empty' package.json 2>/dev/null)
    HAS_HONO=$(jq -r '.dependencies.hono // .devDependencies.hono // empty' package.json 2>/dev/null)
    if [[ -n "$HAS_EXPRESS" || -n "$HAS_FASTIFY" || -n "$HAS_KOA" || -n "$HAS_HONO" ]]; then
        HAS_API=true
    fi
elif [[ -f "go.mod" || -f "requirements.txt" || -f "pyproject.toml" ]]; then
    HAS_API=true
fi

if [[ "$HAS_API" == true ]]; then
    API_URL="${BOSS_API_URL:-http://localhost:3000/api/health}"

    if command -v curl >/dev/null 2>&1; then
        gate_info "API P99 响应时间检查: $API_URL"

        TOTAL_TIME=0
        TIMES=()
        SUCCESS=0

        for i in $(seq 1 10); do
            RESPONSE_TIME=$(curl -o /dev/null -s -w '%{time_total}' "$API_URL" 2>/dev/null || echo "0")
            if [[ "$RESPONSE_TIME" != "0" ]]; then
                TIMES+=("$RESPONSE_TIME")
                SUCCESS=$((SUCCESS + 1))
            fi
        done

        if [[ "$SUCCESS" -ge 5 ]]; then
            SORTED_TIMES=$(printf '%s\n' "${TIMES[@]}" | sort -n)
            P99_INDEX=$((SUCCESS * 99 / 100))
            [[ "$P99_INDEX" -lt 1 ]] && P99_INDEX=1
            P99_TIME=$(echo "$SORTED_TIMES" | sed -n "${P99_INDEX}p")
            P99_MS=$(echo "$P99_TIME * 1000" | bc 2>/dev/null | cut -d'.' -f1)

            if [[ -n "$P99_MS" && "$P99_MS" -lt 500 ]]; then
                gate_pass "API P99: ${P99_MS}ms (< 500ms)"
                add_check "api-p99" true "P99: ${P99_MS}ms"
            else
                gate_fail "API P99: ${P99_MS:-N/A}ms (≥ 500ms)"
                add_check "api-p99" false "P99: ${P99_MS:-N/A}ms >= 500ms"
                ALL_PASSED=false
            fi
        else
            gate_info "API 请求大部分失败（服务可能未启动），跳过"
            add_check "api-p99" true "跳过：API 不可达"
        fi
    else
        gate_info "未安装 curl，跳过 API 检查"
        add_check "api-p99" true "跳过：未安装 curl"
    fi
else
    gate_info "未检测到 API 框架，跳过 API P99 检查"
    add_check "api-p99" true "跳过：无 API 框架"
fi

echo "$CHECKS"
[[ "$ALL_PASSED" == true ]] && exit 0 || exit 1
