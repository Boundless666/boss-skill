#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
LOG_TAG="GATE0"

FEATURE="${1:-}"
CHECKS="[]"
ALL_PASSED=true

gate_info "Gate 0: 代码质量检查"
gate_info "========================"

if command -v npx >/dev/null 2>&1 && [[ -f "tsconfig.json" ]]; then
    gate_info "检查 TypeScript 编译..."
    if npx tsc --noEmit 2>&1 | tail -20 >&2; then
        gate_pass "TypeScript 编译无错误"
        add_check "typescript-compile" true
    else
        gate_fail "TypeScript 编译有错误"
        add_check "typescript-compile" false "tsc --noEmit 失败"
        ALL_PASSED=false
    fi
else
    gate_info "跳过 TypeScript 检查（未检测到 tsconfig.json）"
    add_check "typescript-compile" true "跳过：无 tsconfig.json"
fi

LINT_FOUND=false
if [[ -f "biome.json" || -f "biome.jsonc" ]]; then
    gate_info "检查 Biome Lint..."
    LINT_FOUND=true
    if npx biome check . 2>&1 | tail -20 >&2; then
        gate_pass "Biome Lint 通过"
        add_check "lint" true
    else
        gate_fail "Biome Lint 有问题"
        add_check "lint" false "biome check 失败"
        ALL_PASSED=false
    fi
elif [[ -f ".eslintrc" || -f ".eslintrc.js" || -f ".eslintrc.json" || -f ".eslintrc.yml" || -f "eslint.config.js" || -f "eslint.config.mjs" ]]; then
    gate_info "检查 ESLint..."
    LINT_FOUND=true
    if npx eslint . --max-warnings=0 2>&1 | tail -20 >&2; then
        gate_pass "ESLint 通过"
        add_check "lint" true
    else
        gate_fail "ESLint 有 error 级别问题"
        add_check "lint" false "eslint 有 error"
        ALL_PASSED=false
    fi
fi

if [[ "$LINT_FOUND" == false ]]; then
    if command -v ruff >/dev/null 2>&1 && [[ -f "pyproject.toml" || -f "ruff.toml" ]]; then
        gate_info "检查 Ruff Lint..."
        LINT_FOUND=true
        if ruff check . 2>&1 | tail -20 >&2; then
            gate_pass "Ruff Lint 通过"
            add_check "lint" true
        else
            gate_fail "Ruff Lint 有问题"
            add_check "lint" false "ruff check 失败"
            ALL_PASSED=false
        fi
    fi
fi

if [[ "$LINT_FOUND" == false ]]; then
    gate_info "跳过 Lint 检查（未检测到 Lint 配置）"
    add_check "lint" true "跳过：无 Lint 配置"
fi

if command -v npm >/dev/null 2>&1 && [[ -f "package.json" ]]; then
    HAS_AUDIT=$(npm audit --json 2>/dev/null | jq '.metadata.vulnerabilities.high + .metadata.vulnerabilities.critical' 2>/dev/null || echo "")
    if [[ -n "$HAS_AUDIT" && "$HAS_AUDIT" != "null" && "$HAS_AUDIT" -gt 0 ]] 2>/dev/null; then
        gate_fail "发现 $HAS_AUDIT 个高危/严重依赖漏洞"
        add_check "dependency-audit" false "$HAS_AUDIT 个高危漏洞"
        ALL_PASSED=false
    else
        gate_pass "无高危依赖漏洞"
        add_check "dependency-audit" true
    fi
else
    add_check "dependency-audit" true "跳过：无 package.json"
fi

echo "$CHECKS"
[[ "$ALL_PASSED" == true ]] && exit 0 || exit 1
