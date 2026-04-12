# Runtime Contract

This document defines the runtime-first contract for boss-skill orchestration. `execution.json` is a read model only. All state mutations must happen through events and projector materialization.

## Canonical CLI surface

The runtime contract is the `runtime/cli/*.js` surface. Shell scripts are not part of the public compatibility contract.

| Action | Runtime CLI | Runtime API |
| --- | --- | --- |
| Initialize pipeline | `runtime/cli/init-pipeline.js` | `initPipeline(feature)` |
| Query ready artifacts | `runtime/cli/get-ready-artifacts.js` | `getReadyArtifacts(feature, options)` |
| Record artifact completion | `runtime/cli/record-artifact.js` | `recordArtifact(feature, artifact, stage)` |
| Update stage status | `runtime/cli/update-stage.js` | `updateStage(feature, stage, status, options)` |
| Update agent status | `runtime/cli/update-agent.js` | `updateAgent(feature, stage, agent, status, options)` |
| Evaluate gates | `runtime/cli/evaluate-gates.js` | `evaluateGates(feature, gate, options)` |
| Register plugins | `runtime/cli/register-plugins.js` | `registerPlugins(feature, options)` |
| Run plugin hook | `runtime/cli/run-plugin-hook.js` | `runHook(hook, feature, options)` |
| Check stage state | `runtime/cli/check-stage.js` | `checkStage(feature, stage, options)` |
| Replay events | `runtime/cli/replay-events.js` | `replayEvents(feature, options)`, `replaySnapshot(feature, at, options)` |
| Inspect pipeline | `runtime/cli/inspect-pipeline.js` | `inspectPipeline(feature, options)` |
| Inspect events | `runtime/cli/inspect-events.js` | `inspectEvents(feature, options)` |
| Inspect progress | `runtime/cli/inspect-progress.js` | `inspectProgress(feature, options)` |
| Inspect plugins | `runtime/cli/inspect-plugins.js` | `inspectPipeline(feature, options)` |
| Generate summary | `runtime/cli/generate-summary.js` | `buildSummaryModel(feature)`, `renderMarkdown(model)`, `renderJson(model)` |
| Render diagnostics | `runtime/cli/render-diagnostics.js` | `renderHtml(model)` |

## State truth

- `execution.json` is a read model.
- `events.jsonl` is the mutation source of truth.
- `progress.jsonl` is a structured progress stream and each progress record must include `feature`.
- `evaluateGates` is an event-sourced state transition that records `GateEvaluated` and then rematerializes the read model.

## Pack and plugin lifecycle

- Pack selection is explicit state truth through `PackApplied`.
- Plugin discovery and activation are explicit state truth through `PluginDiscovered` and `PluginActivated`.
- Plugin hook execution is explicit state truth through `PluginHookExecuted` and `PluginHookFailed`.

## Initialization semantics

- `initPipeline` only supports brand-new pipeline initialization.
- If partial state already exists, runtime must fail fast instead of backfilling legacy truth.
- If a pipeline already exists, runtime must fail fast instead of mutating it implicitly.

## Inspection surface

- `runtime/cli/check-stage.js` is the canonical stage summary/debugging entrypoint.
- `runtime/cli/replay-events.js` is the canonical event replay/snapshot entrypoint.
- `runtime/cli/inspect-pipeline.js` is the canonical high-level pipeline inspection entrypoint.
- `runtime/cli/inspect-events.js`, `runtime/cli/inspect-progress.js`, and `runtime/cli/inspect-plugins.js` expose specialized views over events, progress, and plugin lifecycle state.

## Report surface

- `runtime/cli/generate-summary.js` is the canonical summary entrypoint.
- `runtime/report/summary-model.js` builds a stable report model from the read model.
- `runtime/report/render-markdown.js`, `runtime/report/render-json.js`, and `runtime/report/render-html.js` render operator-facing outputs from the same summary/diagnostic state.
