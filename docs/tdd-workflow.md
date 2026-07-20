# TDD Workflow

This project validates runtime behavior through small red-green-refactor cycles.

The goal is not to test private implementation details. Tests should describe observable behavior through the public runtime boundary.

## Public Interface Under Test

Runtime behavior tests should use:

- `createCorrectionRuntime()`
- `runtime.receive(input)`
- `await runtime.runUntilSettled()`
- `runtime.emit()`
- `runtime.trace()`

Task 7 introduces a pending-state observation boundary:

- `runtime.snapshot()`

Task 9 introduces a CLI smoke-test boundary:

- `pnpm demo ./src/examples/input.md`
- `.output/result.md`
- `.output/trace.json`
- `.output/state.json`

Task 12 introduces a future adapter boundary for LangGraph, but should still use
plain TypeScript objects and avoid importing LangGraph directly.

Avoid testing internal functions such as computed nodes, resource constructors, or mock model helpers directly unless they become public contracts.

## TDD Task Format

Each task should describe one behavior.

```txt
Task:
[short behavior name]

Scenario:
Given ...
When ...
Then ...

Operations:
1. createCorrectionRuntime()
2. runtime.receive(...)
3. await runtime.runUntilSettled()
4. inspect runtime.emit() or runtime.trace()

Acceptance:
- ...
- ...
```

## Red-Green-Refactor Loop

### 1. RED

Write one failing test for one behavior.

Rules:

- Test only one behavior.
- Use the public runtime interface.
- Assert observable output or trace events.
- Run the test and confirm it fails for the expected reason.

Example:

```txt
Style guide change should not rerun factCheck.
```

Expected RED result:

```txt
Test fails because current trace marks factCheck as stale after every receive.
```

### 2. GREEN

Write the smallest implementation that makes the test pass.

Rules:

- Do not add unrelated behavior.
- Do not refactor broadly while the test is failing.
- Prefer simple changes over new abstractions.

Example implementation direction:

```txt
Compare previous input with next input.
Only mark factCheck stale when draft-derived claims changed.
Only mark styleReview stale when draft or styleGuide changed.
```

### 3. REFACTOR

After tests pass, clean up the code.

Rules:

- Keep all tests green.
- Extract helpers only if they remove real duplication.
- Preserve the same public interface.
- Do not change behavior during refactor.

## First Runtime TDD Backlog

### 1. Basic Settling

Scenario:

```txt
Given a markdown draft
When the runtime receives it and settles
Then emit() returns a finalResult
```

Acceptance:

- `finalResult` exists.
- `revisedDraft` contains mock correction notes.
- `claims` has at least one item.

### 2. Trace Lifecycle

Scenario:

```txt
Given a markdown draft
When the runtime settles
Then trace() records the correction lifecycle
```

Acceptance:

- trace includes `changed`
- trace includes `stale`
- trace includes `pending`
- trace includes `resolved`
- trace includes `emitted`

### 3. Second Receive

Scenario:

```txt
Given a runtime that already settled once
When it receives a second draft
Then it settles again and emits a new finalResult
```

Acceptance:

- second `emit().finalResult` exists.
- trace contains two `runtime receive started` events.
- trace contains at least two `finalResult emitted` events.

### 4. Style Guide Change

Scenario:

```txt
Given a runtime that already settled a draft
When it receives the same draft with a new styleGuide
Then styleReview and rewriteDraft rerun, but factCheck does not rerun
```

Acceptance:

- after the second receive, trace includes `styleReview pending`
- after the second receive, trace includes `rewriteDraft pending`
- after the second receive, trace does not include `factCheck pending`
- after the second receive, trace does not include `factCheck stale`

### 5. Draft Claim Change

Scenario:

```txt
Given a runtime that already settled a draft
When it receives a changed draft with different claims
Then claims, factCheck, correctionPlan, rewriteDraft, and finalResult update
```

Acceptance:

- `claims` changes.
- trace includes `claims completed`.
- trace includes `factCheck pending`.
- trace includes `rewriteDraft pending`.
- final result changes.

### 6. Style-Only Draft Change

Scenario:

```txt
Given a runtime that already settled a draft
When the draft text changes but extracted claims stay the same
Then styleReview reruns, but factCheck can be skipped
```

Acceptance:

- extracted claims are equal before and after.
- trace includes `styleReview pending`.
- trace does not include `factCheck pending` after the second receive.

### 7. Runtime Snapshot Contract

Scenario:

```txt
Given a runtime that has settled once
When it receives a new input that starts async work
Then snapshot() exposes the previous stable final result and current resource statuses
```

Acceptance:

- `snapshot().stableFinalResult` exists after first settling.
- after second `receive()` but before `runUntilSettled()`, `snapshot().stableFinalResult` still exists.
- `snapshot().statuses.rewriteDraft` can report `pending`.
- `snapshot()` does not require the runtime to settle.

### 8. Pending Rewrite Keeps Previous Output

Scenario:

```txt
Given a runtime with a settled result
When rewriteDraft reruns
Then the previous revisedDraft remains available while the new rewrite is pending
```

Acceptance:

- previous `revisedDraft` is still readable during pending.
- final `revisedDraft` updates after settling.

### 9. CLI Smoke Test

Scenario:

```txt
Given an example markdown input
When the demo CLI runs
Then it writes the correction result, trace, and state artifacts
```

Operations:

1. run `pnpm demo ./src/examples/input.md`
2. inspect `.output/result.md`
3. parse `.output/trace.json`
4. parse `.output/state.json`

Acceptance:

- the command exits successfully.
- `.output/result.md` exists and contains revised draft text.
- `.output/trace.json` parses to an array.
- `.output/trace.json` includes a `finalResult emitted` event.
- `.output/state.json` parses to an object with `finalResult`.
- the CLI still uses mock runtime behavior only; no LangGraph and no real LLM.

### 10. Latest Receive Wins

Scenario:

```txt
Given a runtime with async work pending for one draft
When it receives a second draft before the first draft settles
Then late async results from the first draft cannot overwrite the latest output
```

Operations:

1. createCorrectionRuntime()
2. `runtime.receive()` a first draft with a unique marker
3. before `runUntilSettled()`, `runtime.receive()` a second draft with a different unique marker
4. `await runtime.runUntilSettled()`
5. inspect `runtime.emit()` and `runtime.trace()`

Acceptance:

- `emit().finalResult.revisedDraft` contains the second draft marker.
- `emit().finalResult.revisedDraft` does not contain the first draft marker.
- trace contains two `runtime receive started` events.
- trace does not emit an observable `finalResult` for the obsolete first draft after the second receive.

### 11. Async Error Trace

Scenario:

```txt
Given a runtime configured with a failing mock async step
When the runtime tries to settle
Then the failure is visible in trace and runUntilSettled fails clearly instead of hanging
```

Operations:

1. createCorrectionRuntime() with an injected mock model that rejects one async step
2. `runtime.receive()` a draft
3. `await runtime.runUntilSettled()`
4. inspect rejection, `runtime.trace()`, and `runtime.snapshot()`

Acceptance:

- `runUntilSettled()` rejects with a clear error that names the failing step.
- trace includes a `rejected` event for the failing resource.
- `snapshot().statuses` reports the failing resource as `error`.
- no `finalResult emitted` event is recorded for the failed run.
- the runtime does not wait for the timeout when a critical resource has already failed.

### 12. Adapter Boundary

Scenario:

```txt
Given a plain graph-like state object
When a correction runtime adapter is invoked
Then it returns plain output state that a future LangGraph node can consume
```

Operations:

1. call a plain adapter function with `{ draft, userIntent, styleGuide }`
2. let the adapter create or use `createCorrectionRuntime()`
3. wait for the runtime to settle
4. inspect the returned output object

Acceptance:

- the adapter returns JSON-compatible state.
- the returned state includes the correction output from `emit()`.
- the returned state includes `trace()` for observability.
- the returned state includes `snapshot()` for pending/stable-output metadata.
- the adapter does not import LangGraph yet.
- the adapter boundary should make the later LangGraph node a thin wrapper, not a second runtime.

### 13. LangGraph Minimal PoC

Scenario:

```txt
Given a plain graph input state with a markdown draft
When a minimal LangGraph workflow is invoked
Then the workflow returns correction output, trace, and snapshot from the signal-kernel runtime
```

LangGraph concepts to learn in this task:

- `StateGraph`: the graph builder used to define workflow state, nodes, and edges.
- graph state: the shared object passed through the workflow.
- node: an async function that receives state and returns partial state.
- edge: a connection that controls which node runs next.
- `START` / `END`: special graph boundaries.
- `compile()`: turns the graph definition into an executable graph.
- `invoke()`: runs the compiled graph with input state.

Proposed minimal graph:

```txt
START
  -> prepareInput
  -> reactiveCorrection
  -> finalize
  -> END
```

Node responsibilities:

- `prepareInput`: normalize the incoming draft state and add graph-level trace if needed.
- `reactiveCorrection`: call `invokeCorrectionRuntime(state)` and return its output.
- `finalize`: mark the graph state as finalized without changing the correction result.

Operations:

1. add the minimal LangGraph dependency.
2. define a JSON-compatible `GraphState` shape.
3. implement `createCorrectionGraph()`.
4. add `prepareInput`, `reactiveCorrection`, and `finalize` nodes.
5. compile the graph.
6. invoke the graph with `{ draft, userIntent, styleGuide }`.
7. inspect the returned graph state.

Acceptance:

- the graph can be invoked from a test.
- the returned graph state includes `finalResult`.
- the returned graph state includes `trace`.
- the returned graph state includes `snapshot`.
- the returned graph state records that `finalize` ran.
- `reactiveCorrection` delegates to `invokeCorrectionRuntime()` instead of duplicating runtime logic.
- this task still uses mock async model functions only.
- this task does not introduce real LLM calls.
- this task does not introduce LangChain chains, agents, retrievers, or tools.
- this task does not introduce UI.

Suggested subtasks:

1. Task 13a: install and verify `@langchain/langgraph`.
2. Task 13b: create a minimal graph that returns input state unchanged.
3. Task 13c: add `reactiveCorrection` node using `invokeCorrectionRuntime()`.
4. Task 13d: add `finalize` state and trace expectation.
5. Task 13e: optionally route the CLI through the LangGraph graph after the graph behavior is stable.

### 14. Graph-Level Trace

Scenario:

```txt
Given a minimal LangGraph workflow around the correction runtime
When the graph is invoked
Then the returned state includes graph-level trace events separate from the runtime trace
```

Why this matters:

```txt
Task 13 proves LangGraph can host the correction runtime.
Task 14 proves the outer graph is observable without mixing its lifecycle with the inner signal-kernel runtime lifecycle.
```

Concepts to organize:

- graph trace: events emitted by the LangGraph workflow nodes.
- runtime trace: events emitted by the signal-kernel correction runtime.
- outer orchestration: `prepareInput`, `reactiveCorrection`, `finalize`.
- inner settling: `draft -> claims -> factCheck -> styleReview -> correctionPlan -> rewriteDraft -> finalResult`.

Proposed state fields:

```ts
type GraphState = {
  graphTrace?: TraceEvent[];
  trace?: TraceEvent[];
}
```

Trace boundary:

```txt
graphTrace
  records LangGraph node lifecycle

trace
  records signal-kernel runtime lifecycle
```

Operations:

1. invoke `createCorrectionGraph()`.
2. inspect the returned graph state.
3. verify `graphTrace` contains graph node lifecycle events.
4. verify `trace` still contains runtime lifecycle events.
5. verify graph-level events and runtime-level events are not collapsed into one undifferentiated list.

Acceptance:

- returned state includes `graphTrace`.
- `graphTrace` includes `prepareInput started`.
- `graphTrace` includes `prepareInput completed`.
- `graphTrace` includes `reactiveCorrection started`.
- `graphTrace` includes `reactiveCorrection completed`.
- `graphTrace` includes `finalize started`.
- `graphTrace` includes `finalize completed`.
- runtime `trace` still includes `finalResult emitted`.
- `graphTrace` does not include `finalResult emitted`.
- runtime `trace` does not need to include graph node lifecycle events.
- no real LLM calls are introduced.
- no UI is introduced.

Implementation direction:

- Reuse the existing `TraceEvent` shape.
- Prefer a tiny graph trace helper over reusing the runtime `TraceCollector` directly if that keeps the boundary clearer.
- Keep `reactiveCorrection` delegating to `invokeCorrectionRuntime()`.
- Do not add LangSmith or external observability tooling yet.

Suggested subtasks:

1. Task 14a: add a failing test for graph-level lifecycle trace.
2. Task 14b: add `graphTrace` to `CorrectionGraphState`.
3. Task 14c: record graph node started/completed events.
4. Task 14d: keep runtime `trace` separate and unchanged.

### 15. Optional Local LLM Provider

Scenario:

```txt
Given a developer has a local open-weight LLM server running
When the demo is configured to use the local provider
Then the correction runtime can run with a real local model without requiring an API key
```

Recommended first provider:

```txt
Ollama
```

Why this comes after Task 14:

```txt
Task 14 keeps the LangGraph and signal-kernel observability boundary clear.
Task 15 can then swap the mock correction model for a local LLM-backed model without changing the runtime architecture.
```

Important constraint:

```txt
The default automated test suite should still use deterministic mock models.
Local LLM execution should be optional/manual and should not be required for CI or normal development.
```

Concepts to organize:

- local open-weight LLM: a model running on the developer machine, usually without an API key.
- provider adapter: a module that implements `CorrectionRuntimeModel`.
- deterministic tests: tests that keep using mock model functions.
- manual demo: a command a developer can run when Ollama and a model are available locally.

Proposed environment variables:

```txt
CORRECTION_MODEL=mock | ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
```

Suggested first models:

```txt
Fast local demo:
- llama3.2:3b
- qwen3:4b

Better but heavier demo:
- qwen3:8b
- gemma3:4b
```

Operations:

1. keep mock model as the default provider.
2. add an Ollama-backed `CorrectionRuntimeModel` implementation.
3. add provider selection based on environment variables.
4. add a manual demo command that uses Ollama.
5. document how to run the local LLM demo.
6. keep normal tests independent from Ollama.

Acceptance:

- default `pnpm test` still uses mock model behavior.
- default `pnpm demo ./src/examples/input.md` still works without Ollama.
- a manual Ollama demo command can run when Ollama is available.
- no API key is required for the Ollama path.
- no network cloud LLM call is required.
- local provider implements the existing `CorrectionRuntimeModel` contract.
- runtime core does not import Ollama-specific code directly.
- failures from the local provider are surfaced through existing rejected/error trace behavior.

Suggested subtasks:

1. Task 15a: add provider-selection design docs and command examples.
2. Task 15b: add `createMockCorrectionModel()` so mock provider is explicit.
3. Task 15c: add `createOllamaCorrectionModel()` behind the `CorrectionRuntimeModel` interface.
4. Task 15d: add a manual `demo:ollama` command.
5. Task 15e: add docs for installing Ollama and pulling a small model.
6. Task 15f: add an optional/manual smoke check that is skipped unless `OLLAMA_MODEL` is set.

### 16. Missing FactCheck Coverage

Scenario:

```txt
Given a correction model returns fact-check results for only some extracted claims
When the runtime settles
Then missing claim results are normalized into unresolved review items instead of being silently ignored
```

Why this matters:

```txt
Task 15 proves a local LLM provider can plug into the runtime.
The first successful Ollama demo showed a realistic provider-quality issue:
claims had multiple items, but factCheckResult covered only one claim.
Task 16 turns that gap into a runtime contract.
```

Operations:

1. create a runtime with an injected fake model.
2. use a draft that extracts multiple claims.
3. make `factCheckClaims()` return a result for only one claim.
4. `runtime.receive()` the draft.
5. `await runtime.runUntilSettled()`.
6. inspect `runtime.emit()`.

Acceptance:

- `claims.length` is greater than the provider's original fact-check item count.
- emitted `factCheckResult.items` covers every extracted claim.
- missing claim IDs become `needs-review`.
- missing claim notes explain that the provider did not return a fact-check result.
- `finalResult.unresolvedIssues` includes the missing-coverage notes.
- `finalResult` still emits.
- automated tests use an injected fake model, not a real Ollama call.

Suggested subtasks:

1. Task 16a: add a failing runtime test for incomplete fact-check coverage.
2. Task 16b: add the minimal normalization needed to cover missing claims.
3. Task 16c: keep the normalization inside the runtime/provider boundary instead of changing trace semantics.

### 17. Provider Output Hardening

Scenario:

```txt
Given a correction model returns malformed, invalid, or unusable structured output
When the runtime or provider receives that output
Then the failure mode is explicit and does not create misleading final results
```

Why this comes after Task 16:

```txt
Task 16 handles incomplete but still usable fact-check output.
Task 17 handles output that is invalid, contradictory, or unusable.
```

Behaviors to cover:

```txt
Unknown claim IDs:
  A fact-check item references a claim id that was not extracted.

Invalid or empty provider JSON:
  The Ollama provider returns empty text or invalid JSON for a structured step.

Provider documentation:
  Developers know how to judge whether a local LLM demo succeeded semantically,
  not just whether it wrote .output files.
```

Acceptance:

- unknown `claimId` values do not crash the runtime.
- valid claim results are preserved.
- unknown claim results do not count as coverage for valid claims.
- provider errors name the provider step, such as `factCheckClaims`.
- provider errors name the model when available.
- runtime trace includes a rejected resource event for hard provider failures.
- no `finalResult emitted` event is recorded for hard provider failures.
- docs explain how to inspect `result.md`, `state.json`, and `trace.json` after local LLM demos.

Suggested subtasks:

1. Task 17a: add a runtime test for unknown fact-check claim ids.
2. Task 17b: normalize or ignore unknown ids while preserving valid items.
3. Task 17c: keep/extend provider tests for empty or invalid Ollama JSON.
4. Task 17d: update local LLM validation docs.

### 18. Provider Diagnostics Trace

Scenario:

```txt
Given provider output contains ignored or normalized fact-check items
When the runtime settles
Then trace records what was ignored or normalized without changing the final result contract
```

Why this comes after Task 17:

```txt
Task 16 and Task 17 make provider output safer.
Task 18 makes those safety decisions observable.
```

Behaviors to cover:

```txt
Missing coverage:
  A provider omits fact-check results for extracted claims.

Unknown claim ids:
  A provider returns a fact-check result for a claim id that does not exist.
```

Acceptance:

- missing fact-check coverage records a trace event.
- unknown `claimId` records a trace event.
- trace metadata includes the affected claim id.
- `finalResult` behavior remains the same as Task 16 and Task 17.
- unknown ids still do not appear in `factCheckResult.items`.
- no real Ollama call is used in automated tests.

Suggested subtasks:

1. Task 18a: add a failing runtime test for missing coverage trace diagnostics.
2. Task 18b: emit diagnostics when missing claim coverage is normalized.
3. Task 18c: add a failing runtime test for unknown claim id trace diagnostics.
4. Task 18d: emit diagnostics when unknown claim ids are ignored.

### 19. Claim Budget / Compression

Scenario:

```txt
Given a long draft with more possible claims than the runtime should check
When the runtime extracts claims
Then it applies an explicit claim budget and records that the draft was truncated for fact-checking
```

Why this matters:

```txt
Unknown claim ids are provider output errors.
Claim budget is a different problem: the runtime intentionally limits how many claims it sends to factCheck.
That limit should be explicit and observable.
```

Current behavior to clarify:

```txt
extractClaims currently limits claims with a fixed slice.
Task 19 turns that implicit limit into a visible runtime contract.
```

Acceptance:

- claim budget is named explicitly in code or runtime options.
- extracted claims do not exceed the budget.
- trace records when additional possible claims were omitted because of the budget.
- state or trace makes it clear that fact-check coverage only applies to extracted claims.
- existing short-draft behavior does not change.
- no LLM provider changes are required.

Suggested subtasks:

1. Task 19a: add a failing runtime test for a draft with more claims than the budget.
2. Task 19b: introduce an explicit claim budget constant or runtime option.
3. Task 19c: record trace metadata when claim extraction is truncated.
4. Task 19d: document the difference between claim budget and provider coverage.

### 20. Graph CLI Path

Scenario:

```txt
Given the demo CLI is run in graph mode
When it receives markdown input
Then it invokes the LangGraph workflow and writes graph trace plus runtime trace artifacts
```

Why this comes after runtime hardening:

```txt
The runtime output is now safer and more diagnosable.
Task 20 moves that behavior into a visible LangGraph demo path.
```

Proposed command:

```bash
pnpm demo:graph ./src/examples/input.md
```

Acceptance:

- `pnpm demo:graph ./src/examples/input.md` exits successfully.
- `.output/result.md` still contains the revised draft.
- `.output/state.json` includes `graphTrace`.
- `.output/state.json` includes runtime `trace`.
- `graphTrace` includes graph node lifecycle events.
- runtime trace still includes `finalResult emitted`.
- `reactiveCorrection` still delegates to `invokeCorrectionRuntime()`.
- no real LLM call is required for this task.

Suggested subtasks:

1. Task 20a: add a CLI smoke test for graph mode.
2. Task 20b: add `demo:graph` script.
3. Task 20c: route graph mode through `createCorrectionGraph()`.
4. Task 20d: ensure output artifacts preserve both graph and runtime observability.

### 21. Demo Narrative Fixture

Scenario:

```txt
Given a demo markdown fixture with clear factual, style, and intent signals
When the demo runs
Then the output makes the reactive correction workflow easy to explain
```

Why this matters:

```txt
The current fixture is good for scaffolding.
A technical article or external demo needs an input that makes the runtime behavior obvious.
```

Acceptance:

- add or update a demo input fixture designed for explanation.
- mock provider output remains deterministic.
- result markdown clearly shows correction summary and unresolved issues.
- trace remains understandable for article screenshots or excerpts.
- README or docs explain which fixture to use for demos.
- no UI is introduced.

Suggested subtasks:

1. Task 21a: draft a clearer demo markdown fixture.
2. Task 21b: add a CLI smoke test for the fixture.
3. Task 21c: update README or docs with how to inspect the demo artifacts.

### 22. LangGraph + Ollama Manual Demo

Scenario:

```txt
Given Ollama is available locally
When the graph demo runs with the Ollama provider
Then the output includes graph trace, runtime trace, and local LLM correction output
```

Important constraint:

```txt
This remains a manual demo path.
It should not be required for normal `pnpm test` or CI.
```

Proposed command:

```bash
OLLAMA_MODEL=llama3.2:3b pnpm demo:graph --provider ollama ./src/examples/input.md
```

Acceptance:

- graph demo can select the Ollama provider.
- output includes `graphTrace`.
- output includes runtime `trace`.
- output includes `finalResult` when the local model returns usable output.
- provider failures remain visible through rejected trace events.
- docs explain this as a manual local LLM demo, not an automated test requirement.

Suggested subtasks:

1. Task 22a: add provider selection to graph CLI path.
2. Task 22b: document a manual LangGraph + Ollama command.
3. Task 22c: optionally add a skipped manual smoke test gated by `OLLAMA_MODEL`.

### 23. Persistent Runtime Graph Session

Scenario:

```txt
Given one graph session has already settled a correction input
When the same session receives a style-only update and then a claim-changing update
Then the signal-kernel runtime survives across graph invocations and only reruns affected work
```

Why this comes next:

```txt
Task 22 proves that LangGraph can invoke the runtime with mock or Ollama providers.
The current adapter still creates a new runtime for every graph invocation.
Task 23 moves the runtime's existing incremental behavior into an observable graph-session workflow.
```

Important boundary:

```txt
Serializable LangGraph state is not the same thing as a live runtime session.
The live signal-kernel runtime should be owned by an explicit in-process session boundary.
It should not be stored inside JSON graph state or presented as durable LangGraph checkpoint data.
```

Operations:

1. create one graph session with a deterministic correction model.
2. invoke it with an initial draft and wait for a final result.
3. invoke the same session with only `styleGuide` changed.
4. inspect the trace produced after the second invocation.
5. invoke the same session with a draft whose extracted claims change.
6. inspect the third result and trace.

Acceptance:

- the first invocation returns `finalResult`, graph trace, and runtime trace.
- the style-only invocation includes `styleReview pending` and `rewriteDraft pending`.
- the style-only invocation does not include `factCheck pending` or `factCheck stale`.
- the claim-changing invocation includes `factCheck pending` and updates the final result.
- each graph invocation still returns JSON-compatible state.
- separate graph sessions do not share runtime state or trace history.
- no live runtime object is written into graph state or output artifacts.
- no LangGraph checkpointer or database is required for this in-process PoC.

Suggested subtasks:

1. Task 23a: add a failing adapter test for invoking an existing runtime instance.
2. Task 23b: allow the adapter to use a caller-owned runtime without changing its output contract.
3. Task 23c: add a graph-session boundary that owns one runtime instance.
4. Task 23d: add a failing graph-session test for a style-only second invocation.
5. Task 23e: add a failing graph-session test for a claim-changing third invocation.
6. Task 23f: verify that two sessions remain isolated.

### 24. Reactive vs Eager LangGraph Comparison

Scenario:

```txt
Given an eager LangGraph correction path and a persistent reactive correction path
When both process the same initial input, style-only update, and claim-changing update
Then a comparison report shows which provider operations each path executed
```

Why this matters:

```txt
Integration alone does not prove that the reactive runtime adds value.
Task 24 creates a deterministic baseline and measures recomputation directly.
```

Comparison boundary:

```txt
Both paths must use the same fixtures, correction model contract, and output shape.
The first comparison should count provider operations instead of claiming wall-clock performance.
```

Proposed command:

```bash
pnpm run demo:compare
```

Proposed report fields:

```txt
scenario
mode: eager | reactive
factCheckCalls
styleReviewCalls
rewriteDraftCalls
finalResultProduced
```

Acceptance:

- both paths process the same ordered update sequence.
- both paths use the same deterministic instrumented model.
- both paths produce the same public final-result contract.
- the style-only update does not increment reactive `factCheckCalls`.
- the eager baseline records the fact-check work it executes for the same update.
- the claim-changing update increments reactive `factCheckCalls`.
- the comparison is written to `.output/comparison.json` or an equivalent inspectable artifact.
- the CLI summary describes observed call counts without claiming general performance superiority.
- no real LLM is required for automated comparison tests.

Suggested subtasks:

1. Task 24a: add an instrumented deterministic `CorrectionRuntimeModel` for call counting.
2. Task 24b: define a JSON-compatible comparison report contract.
3. Task 24c: add a failing test for the style-only comparison scenario.
4. Task 24d: implement the smallest eager baseline and reactive session runner.
5. Task 24e: add the claim-changing comparison scenario.
6. Task 24f: add `demo:compare` and write the comparison artifact.
7. Task 24g: coalesce reactive rewrites generated while upstream resources are pending.

#### Task 24g. Reactive Rewrite Coalescing

Scenario:

```txt
Given a persistent reactive session has a previous stable result
When a style-only or claim-changing update makes upstream resources pending
Then rewriteDraft waits for current upstream results and invokes the model only once for that update
```

Evidence discovered by Task 24:

```txt
Current cumulative counts:

style-only reactive:     factCheck 1 / styleReview 2 / rewriteDraft 3
claim-changing reactive: factCheck 2 / styleReview 3 / rewriteDraft 6

The runtime preserves previous resource values while new async work is pending.
This currently allows rewriteDraft to run with a stale correction plan before
running again with the current plan.
```

Why this must precede Task 25:

```txt
Rewrite is usually the most expensive LLM operation in this workflow.
Local LLM evaluation would be misleading if one logical update generated multiple rewrite calls.
```

Target cumulative counts:

```txt
style-only reactive:     factCheck 1 / styleReview 2 / rewriteDraft 2
claim-changing reactive: factCheck 2 / styleReview 3 / rewriteDraft 3
```

Important constraint:

```txt
Do not remove the previous-stable-output behavior to make the counts pass.
The previous revised draft and stable final result must remain readable while
current upstream resources are pending, but stale upstream values must not
trigger a new model rewrite for the current receive epoch.
```

Acceptance:

- add a failing comparison test expecting style-only reactive `rewriteDraftCalls` to be `2`.
- add a failing comparison test expecting claim-changing reactive `rewriteDraftCalls` to be `3`.
- style-only reactive `factCheckCalls` remains `1`.
- claim-changing reactive `factCheckCalls` remains `2`.
- eager baseline counts remain unchanged.
- eager and reactive final results still match for both scenarios.
- the previous revised draft remains available while the new rewrite is pending.
- `snapshot().stableFinalResult` remains available while current work is pending.
- `demo:compare` reports the new observed counts without changing its JSON contract.

Suggested TDD slices:

1. Task 24g-1: change only the style-only rewrite-count expectation and confirm RED.
2. Task 24g-2: prevent stale style-review data from starting a rewrite for the current epoch.
3. Task 24g-3: change only the claim-changing rewrite-count expectation and confirm RED.
4. Task 24g-4: coalesce rewrites until current fact-check and style-review work is settled.
5. Task 24g-5: rerun pending-output regression tests and the comparison CLI smoke test.

### 25. Local LLM Evaluation Harness

Scenario:

```txt
Given Ollama is available and several fixed correction fixtures exist
When the evaluation command runs one or more trials
Then it records structural reliability and runtime outcomes without affecting normal tests
```

Why this comes after Task 24:

```txt
Deterministic comparison should establish execution behavior first.
Task 25 then measures the additional uncertainty introduced by a real local model.
```

Important constraint:

```txt
This is a manual evaluation harness, not a CI requirement.
It should measure observable contracts and should not pretend to automatically prove factual correctness.
```

Proposed command:

```bash
OLLAMA_MODEL=llama3.2:3b pnpm run evaluate:ollama
```

Proposed evaluation fields:

```txt
fixture
model
trial
settled | rejected
durationMs
extractedClaimCount
factCheckCoverageCount
normalizedMissingCount
ignoredUnknownCount
unresolvedIssueCount
error
```

Acceptance:

- evaluation uses at least three fixed fixtures with different correction signals.
- the number of trials is configurable and defaults to a small value.
- each trial records success, failure, duration, and fact-check coverage diagnostics.
- invalid JSON, empty responses, timeout, and provider errors remain visible.
- results are written to `.output/evaluation.json`.
- normal `pnpm test` remains deterministic and does not require Ollama.
- the report distinguishes structural reliability from subjective correction quality.
- no cloud API key or external database is required.

Suggested subtasks:

1. Task 25a: define the evaluation result schema and add serialization tests.
2. Task 25b: add two focused fixtures alongside the explanatory demo fixture.
3. Task 25c: add a manual evaluator that invokes the graph with Ollama.
4. Task 25d: collect provider diagnostics from runtime trace.
5. Task 25e: add `evaluate:ollama` and document PowerShell and POSIX commands.
6. Task 25f: summarize results without making unsupported quality claims.

### 26. Publishable CLI Demo

Scenario:

```txt
Given a developer clones the repository without the signal-kernel source repository beside it
When they install dependencies and run the documented commands
Then they can reproduce the deterministic comparison and inspect its artifacts
```

Definition of publishable:

```txt
This task publishes a reproducible GitHub CLI demo.
It does not require a web UI or a globally installed npm CLI package.
```

Recommended verification path:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm run demo:compare
```

Acceptance:

- `package.json` uses published signal-kernel versions instead of sibling-repository links.
- a clean install succeeds from the committed lockfile.
- the deterministic mock path is the default demo and requires no local services.
- `demo:compare` produces the documented result, state, trace, and comparison artifacts.
- README explains the architecture, commands, fixtures, and artifact inspection order.
- README states precisely what the comparison proves and what it does not prove.
- the optional LangGraph + Ollama path is clearly marked as manual.
- automated tests cover the primary CLI commands.
- CI runs install, typecheck, and tests on a clean environment.
- the repository does not require UI, a database, LangSmith, or LangChain chains.
- the Chinese article can cite Task 24 measurements and representative trace excerpts.

Suggested subtasks:

1. Task 26a: add a clean-install or frozen-lockfile verification step.
2. Task 26b: add CI for typecheck and deterministic tests.
3. Task 26c: add a final CLI smoke test for `demo:compare` artifacts.
4. Task 26d: update README architecture and reproducibility instructions.
5. Task 26e: document the comparison's evidence and limitations.
6. Task 26f: prepare representative command output and trace excerpts for the article.

## Post-CLI Direction

Task 26 completes the publishable CLI demo milestone:

```txt
- deterministic mock execution requires no external service
- direct runtime and LangGraph paths are covered
- persistent sessions demonstrate selective recomputation
- eager/reactive comparison produces inspectable evidence
- Ollama evaluation remains optional and does not affect CI
- clean install, typecheck, tests, and CLI smoke paths are documented
```

This does not make the project a general-purpose installed CLI. A global `bin`,
`--help`, `--version`, and a full argument parser may be added later, but they do
not block the next research milestone.

The next phase should turn raw trace events into a stable explanation of the
project's core value:

```txt
Recompute only what changed.
Reuse what is still valid.
Reject stale results.
Explain every recomputation.
```

### 27. Receive-Scoped Execution Summary

Scenario:

```txt
Given a persistent runtime processes multiple receives
When its cumulative trace is projected into an execution summary
Then each receive explains which operations were recomputed, reused, superseded, and emitted
```

Why this comes first:

```txt
Raw trace events are useful for debugging but are too low-level for a report or UI.
The report layer needs one stable, JSON-compatible projection shared by CLI and web consumers.
```

Important boundary:

```txt
A resource pending event is not automatically a provider invocation.
Actual provider calls must come from model instrumentation or an explicit model-call event.
```

Acceptance:

- every runtime receive has a stable receive index or epoch in the trace projection.
- the projector is a pure function over trace data.
- a style-only receive reports `factCheck` as reused and `styleReview` plus `rewriteDraft` as recomputed.
- a claim-changing receive reports renewed fact-check work.
- superseded async work remains distinguishable from completed work.
- the summary does not depend on wall-clock timing to group events.
- the result is JSON-compatible and keeps raw trace data unchanged.

Suggested TDD slices:

1. Task 27a: add a failing trace test for receive identity metadata.
2. Task 27b: attach the smallest stable receive epoch to runtime trace events.
3. Task 27c: add a pure execution-summary projector for one receive.
4. Task 27d: characterize the style-only reuse scenario.
5. Task 27e: characterize claim-changing and superseded-work scenarios.
6. Task 27f: serialize the summary without changing the runtime public contract.

### 28. Recompute Savings Metrics

Scenario:

```txt
Given eager and reactive paths process the same ordered updates
When the comparison report is generated
Then it quantifies actual calls, reused work, and avoided recomputation per operation
```

Proposed per-operation fields:

```txt
eagerCalls
reactiveCalls
avoidedCalls
reusedReceives
supersededCalls
```

Metric rule:

```txt
avoidedCalls = eagerCalls - reactiveCalls

This value is valid only when fixtures, model contract, and update order are identical.
```

Acceptance:

- style-only updates report one avoided fact-check call for the deterministic fixture.
- claim-changing updates do not claim fact-check reuse when claims changed.
- actual model invocations are not inferred only from signal invalidation events.
- `supersededCalls` is reported separately from successfully reused work.
- negative or incomparable savings are represented explicitly instead of silently clamped.
- the CLI describes fixture-specific observed counts, not general speed or accuracy superiority.
- planned verification attempts are not classified as wasted recomputation.

Suggested TDD slices:

1. Task 28a: define and test the versioned savings report contract.
2. Task 28b: calculate style-only avoided calls from existing comparison counts.
3. Task 28c: add claim-changing and no-savings cases.
4. Task 28d: add superseded-work accounting.
5. Task 28e: render a concise savings summary in `demo:compare`.

### 29. Structural Reliability Scorecard

Scenario:

```txt
Given deterministic contract evidence and optional provider trials
When a reliability scorecard is built
Then structural reliability, provider compatibility, execution efficiency, and semantic quality remain separate
```

Initial versioned structural policy:

```txt
settlement rate:          30
claim coverage:           25
unknown-ID containment:   15
stale-result protection:  20
session isolation:        10
total:                   100
```

Hard gates:

```txt
- stale work overwrites the latest result
- a runtime emits a misleading or missing final result after reporting success
- state leaks between independent sessions
```

Any hard-gate failure makes the structural verdict fail regardless of the
weighted score.

Acceptance:

- the policy has an explicit `policyVersion`.
- weights total 100 and are tested as configuration, not scattered constants.
- hard-gate failures cannot be hidden by a high weighted score.
- provider compatibility is reported as settled/rejected trial counts and rates.
- execution savings remain a separate metric and do not increase reliability.
- repeated fact checks do not automatically increase factual confidence.
- subjective correction quality remains `not-evaluated` until an evaluator contract exists.
- missing or not-applicable evidence is represented as such, not scored as success.

Suggested TDD slices:

1. Task 29a: define the versioned scorecard input and output contracts.
2. Task 29b: test weight validation and deterministic score calculation.
3. Task 29c: add hard-gate verdict behavior.
4. Task 29d: add provider compatibility without mixing it into the structural score.
5. Task 29e: add explicit evidence gaps and quality limitations.
6. Task 29f: document why execution count is evidence of work, not proof of correctness.

### 30. Versioned Artifact Bundle

Scenario:

```txt
Given a demo or comparison command writes several artifacts
When an external report consumer opens the output directory
Then one manifest identifies compatible schemas and every artifact in the run
```

Proposed artifact:

```txt
.output/manifest.json
```

Acceptance:

- the manifest contains a bundle schema version, command mode, provider, and relative artifact paths.
- each referenced JSON artifact declares or inherits a known schema version.
- the bundle can include result, state, raw trace, execution summary, comparison, evaluation, and scorecard artifacts.
- missing optional artifacts are explicit and do not break deterministic mock runs.
- tests inject any clock or run identifier needed for stable assertions.
- the bundle contains serialized data only; runtime instances never enter graph or artifact state.
- one validator reports unsupported or malformed bundle versions clearly.

Suggested TDD slices:

1. Task 30a: define a minimal manifest schema and serialization test.
2. Task 30b: write a manifest for the deterministic demo path.
3. Task 30c: include comparison and execution-summary artifacts.
4. Task 30d: validate missing, malformed, and unsupported artifacts.
5. Task 30e: add a CLI smoke test that loads the bundle it just wrote.

### 31. Static Evidence Report

Scenario:

```txt
Given a deterministic artifact bundle exists
When the report command runs
Then it writes a self-contained HTML report that explains reuse and recomputation without starting a server
```

Proposed command:

```bash
pnpm run demo:report
```

Acceptance:

- `.output/report.html` is generated from the versioned bundle through a report view model.
- the first view makes eager versus reactive operation counts understandable.
- each update shows recomputed, reused, superseded, and emitted work.
- reliability boundaries and `not-evaluated` quality remain visible.
- the report works without a database, live runtime, Ollama, or LangSmith.
- the static report is readable on desktop and mobile and supports keyboard navigation.
- tests assert user-visible report content instead of private template structure.
- the deterministic report path remains suitable for CI.

Suggested TDD slices:

1. Task 31a: derive a report view model from a valid bundle.
2. Task 31b: render one deterministic comparison as semantic HTML.
3. Task 31c: add receive-level reuse and recomputation details.
4. Task 31d: add reliability and evidence-limit sections.
5. Task 31e: add the report CLI and output smoke test.
6. Task 31f: verify responsive layout and accessibility with browser-level tests.

### 32. Interactive Local Web Session

Scenario:

```txt
Given a developer starts the local demo
When they submit an initial draft, a style-only update, and a claim-changing update
Then one persistent graph session processes the changes and the UI explains what reran
```

Architecture boundary:

```txt
Web input -> session API -> existing graph-session adapter -> correction runtime
Runtime artifacts -> shared report view model -> web UI
```

Acceptance:

- the web layer calls the existing runtime/session contracts instead of reimplementing correction logic.
- one browser session owns one runtime instance and two sessions remain isolated.
- mock mode is the default and requires no API key.
- the user can apply initial, style-only, and claim-changing updates without restarting the process.
- the UI distinguishes stable previous output from current pending work.
- reset and disposal remove the owned session.
- API and browser tests cover session continuity, isolation, errors, and trace presentation.
- the first interactive version does not require authentication, a database, or cloud deployment.

Suggested TDD slices:

1. Task 32a: add an in-process session registry behind a narrow HTTP boundary.
2. Task 32b: test create, invoke, reset, and dispose session behavior.
3. Task 32c: expose versioned bundle or view-model responses from the API.
4. Task 32d: build the initial interactive correction screen in mock mode.
5. Task 32e: visualize pending, reused, recomputed, and superseded work.
6. Task 32f: add browser tests for sequential updates and session isolation.

### 33. Independent Fact-Check Corroboration

Scenario:

```txt
Given a claim requires stronger evidence than one verifier can provide
When multiple explicitly configured verifiers inspect it
Then the report distinguishes corroboration attempts from reactive recomputation
```

Why this is separate:

```txt
Running the same work again can be intentional evidence gathering or accidental waste.
Those two meanings must never share one counter.
```

Acceptance:

- the contract records verifier identity, attempt purpose, result, and evidence references.
- repeated calls to the same model are not presented as independent evidence by default.
- agreement, disagreement, and insufficient-evidence states remain visible.
- `verificationAttempts` and `recomputationCalls` are separate metrics.
- deterministic verifier doubles establish behavior before any real multi-model experiment.
- quorum policy is configurable and versioned.
- no consensus result is described as factual truth without external evidence evaluation.

Suggested TDD slices:

1. Task 33a: define verifier identity and attempt-purpose contracts.
2. Task 33b: test two deterministic verifiers that agree.
3. Task 33c: preserve disagreement and insufficient-evidence outcomes.
4. Task 33d: add a versioned quorum policy.
5. Task 33e: expose corroboration separately in trace, scorecard, and report data.
6. Task 33f: add an optional manual multi-model evaluation path.

### 34. Live Runtime Event Stream

Scenario:

```txt
Given a persistent correction session is running
When draft updates trigger async runtime work
Then a developer can observe ordered runtime events before the final artifact bundle is written
```

Why this follows the CLI work:

```txt
The CLI already proves the settled output.
The next proof is that the same runtime can explain in-flight work without waiting for process exit.
```

Acceptance:

- the event stream uses the existing trace vocabulary: `started`, `changed`, `stale`, `pending`, `resolved`, `skipped`, `emitted`, and `completed`.
- every streamed event has a stable receive identifier and monotonically increasing sequence number.
- streamed events and final `trace.json` describe the same work; the live path must not invent a second tracing model.
- subscribers can attach and detach without owning the runtime.
- session disposal closes subscriptions and prevents cross-session event leakage.
- event payloads are serialized data only; promises, signal objects, and runtime instances are never exposed.
- the first version is local-only and works in mock mode without LangSmith, a database, or cloud infrastructure.

Suggested TDD slices:

1. Task 34a: define a live event stream contract and a failing runtime/session test.
2. Task 34b: publish ordered events while preserving the existing settled trace output.
3. Task 34c: add subscription cleanup and session-isolation tests.
4. Task 34d: expose a local SSE endpoint from the existing web server.
5. Task 34e: verify the UI can show pending work before the final result arrives.
6. Task 34f: document the relationship between live events, `trace.json`, and artifact bundles.

### 35. Developer Inspector View Model

Scenario:

```txt
Given a live session or saved artifact bundle exists
When a developer opens the inspector
Then they can understand recomputation, reuse, stale protection, claims, and evidence boundaries
```

Display boundary:

```txt
User-facing correction result -> visible by default
Claims, intent, trace, and verifier evidence -> developer inspector data
```

Acceptance:

- one view-model contract can be built from either a live session snapshot or a saved artifact bundle.
- user-facing result data remains separate from developer-only runtime diagnostics.
- claims and inferred intent are treated as internal runtime data unless explicitly shown in an inspector panel.
- recomputation, reuse, superseded work, and emitted outputs are grouped by receive.
- verifier corroboration and reactive recomputation remain separate sections.
- unsupported or missing artifacts produce clear inspector warnings instead of broken UI.
- the inspector remains framework-neutral and does not introduce a React or Vue adapter.
- tests assert visible meaning and stable view-model fields, not private HTML structure.

Suggested TDD slices:

1. Task 35a: define the inspector view-model contract from an artifact bundle.
2. Task 35b: add receive-level execution groups for recomputed, reused, skipped, and superseded work.
3. Task 35c: add developer-only claims, intent, and evidence sections.
4. Task 35d: support live-session snapshots through the same view-model contract.
5. Task 35e: render the inspector in the local web demo without framework bindings.
6. Task 35f: add browser tests for empty, successful, and partially missing inspector data.

### 36. Headless Correction Session SDK

Scenario:

```txt
Given CLI, web, and LangGraph integrations all need the same runtime behavior
When they create and invoke a correction session
Then they share one headless API instead of reimplementing session orchestration
```

Proposed boundary:

```ts
session.receive(input)
session.runUntilSettled()
session.emit()
session.snapshot()
session.subscribe(listener)
session.reset()
session.dispose()
```

Acceptance:

- the SDK has no dependency on HTTP, DOM, React, Vue, or CLI argument parsing.
- CLI and web code call the SDK instead of reaching into runtime internals.
- provider/model selection is injected through options, not read from globals inside the SDK.
- snapshots contain serialized state, trace, and artifact references only.
- event subscription is optional and does not change settled behavior.
- reset and dispose behavior is deterministic and tested.
- errors preserve enough context for CLI messages, web API responses, and future LangGraph nodes.
- the SDK remains local-first and mock-first.

Suggested TDD slices:

1. Task 36a: define the headless session interface and adapt the current runtime behind it.
2. Task 36b: migrate the CLI demo path to the session SDK.
3. Task 36c: migrate the local web server to the same SDK.
4. Task 36d: expose snapshot and artifact-bundle helpers through the SDK boundary.
5. Task 36e: add reset, dispose, and subscription behavior tests.
6. Task 36f: document how CLI, web, and LangGraph should depend on the SDK.

### 37. Durable LangGraph Session Boundary

Scenario:

```txt
Given a LangGraph workflow may checkpoint or resume graph state
When the correction node is restored
Then serializable graph state can recreate the runtime without storing live signal objects
```

Architecture rule:

```txt
LangGraph checkpoint state stores serializable facts.
signal-kernel runtime instances are rebuilt, not persisted.
```

Acceptance:

- checkpoint state has an explicit schema version.
- graph state never contains promises, functions, signals, effects, or runtime instances.
- restoring from checkpoint recreates a correction session with equivalent observable output.
- invalidation after restore recomputes only the branches required by the new input.
- stale async work from before checkpoint cannot overwrite restored-session results.
- runtime cache behavior is documented as an optimization, not durable truth.
- tests cover restore, second receive after restore, and two isolated restored sessions.
- limitations around long-running in-flight work are explicit before any production claim.

Suggested TDD slices:

1. Task 37a: define the serializable checkpoint contract and validation tests.
2. Task 37b: restore a mock correction session from checkpoint and reproduce the final result.
3. Task 37c: verify second receive after restore preserves selective recomputation behavior.
4. Task 37d: ensure stale pre-restore async work cannot emit into the restored session.
5. Task 37e: connect the checkpoint contract to the LangGraph session wrapper.
6. Task 37f: document durable state boundaries, limitations, and future LangGraph production work.

### 38. Public SDK Surface

Scenario:

```txt
Given the runtime, session, graph, checkpoint, artifact, and inspector contracts are stable enough for local demos
When another TypeScript project wants to use this package
Then it imports supported APIs from one public SDK surface instead of reaching into internal source paths
```

Why this follows Task 37:

```txt
Task 34-37 stabilized observability, session lifecycle, and checkpoint boundaries.
Task 38 turns those boundaries into an explicit public package surface.
```

Public API direction:

```ts
import {
  createCorrectionSession,
  createCorrectionGraphSession,
  createCorrectionGraphCheckpoint,
  parseCorrectionGraphCheckpoint,
  restoreCorrectionSessionFromCheckpoint,
  createCorrectionSessionArtifactBundle,
} from "reactive-correction-graph";
```

Acceptance:

- the package has a single public entrypoint, such as `src/index.ts`.
- public exports include the stable SDK contracts for session, graph session, checkpoint, artifact bundle, and inspector view-model usage.
- public type exports are available without forcing consumers to import private implementation files.
- package `exports` points to the built public entrypoint, not individual internal modules.
- tests prove representative SDK imports compile and run through the public entrypoint.
- tests or static checks prevent accidental reliance on internal source paths for documented examples.
- examples stay local-first and mock-first; they do not require Ollama, LangSmith, a database, or a real LangGraph checkpointer.
- unstable internals remain unexported unless there is a clear consumer-facing reason.
- README and Chinese article explain the supported import surface and its limits.

Suggested TDD slices:

1. Task 38a: add a failing public-entrypoint test that imports session and checkpoint APIs from the package root.
2. Task 38b: create `src/index.ts` and export the stable runtime/session/graph/checkpoint contracts.
3. Task 38c: add package `exports` and declaration build checks for the public entrypoint.
4. Task 38d: add a minimal SDK usage example that runs through the public API only.
5. Task 38e: add a LangGraph checkpoint usage example that imports only from the public API.
6. Task 38f: document the public SDK surface, private internals, and current non-goals.

### 39. LangGraph Reference Integration

Scenario:

```txt
Given the public SDK surface exists
When an external LangGraph app wants to use the correction runtime as one workflow node
Then it can follow a reference integration that imports only the public SDK and keeps LangGraph state serializable
```

Why this follows Task 38:

```txt
Task 38 proved the package root can expose the supported SDK boundary.
Task 39 uses that public boundary to show how another LangGraph workflow should integrate the correction runtime.
This is not about adding a bigger built-in LangGraph demo; it is about documenting and testing the reference integration shape.
```

Reference integration direction:

```ts
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  createCorrectionGraphSession,
  createCorrectionGraphCheckpoint,
  parseCorrectionGraphCheckpoint,
} from "reactive-correction-graph";
```

Acceptance:

- a reference workflow example lives outside the internal graph implementation and imports only `@langchain/langgraph` plus `reactive-correction-graph`.
- the reference workflow treats the correction runtime as a LangGraph node dependency, not as a set of internal runtime files.
- examples and tests prevent direct imports from `src/runtime/*`, `src/graph/*`, `src/session/*`, and other implementation paths.
- LangGraph state used by the reference workflow remains JSON-compatible and does not store runtime instances, sessions, signals, promises, functions, subscriptions, or AbortController values.
- repeated workflow invocations demonstrate the right ownership boundary: persistent behavior belongs to `createCorrectionGraphSession()` or an explicit session wrapper, not to accidental module-level state.
- checkpoint examples stay local-first and mock-first; they do not require LangSmith, a database, Ollama, or a real LangGraph checkpointer.
- docs explain the split clearly: LangGraph owns orchestration and checkpoint policy, while signal-kernel owns node-local reactive invalidation and async settling.

Suggested TDD slices:

1. Task 39a: add a failing reference workflow test that imports a future `langGraphReferenceWorkflow` example.
2. Task 39b: implement the reference workflow example using only `@langchain/langgraph` and the public SDK package root.
3. Task 39c: add a public-import guard test that rejects internal source-path imports in reference examples.
4. Task 39d: add a state-shape test proving the reference workflow checkpoint state is JSON-compatible and excludes live runtime/session values.
5. Task 39e: add a persistent-session example or test showing how repeated invocations reuse `createCorrectionGraphSession()` without module-level hidden state.
6. Task 39f: document the LangGraph reference integration and the role split between LangGraph, the public SDK, and signal-kernel.

### 40. Reference Demo Narrative

Scenario:

```txt
Given the CLI, artifact bundle, public SDK examples, and LangGraph reference examples are all available
When a developer opens the repository for the first time
Then they can follow one local-first guided path that explains what to run, what to inspect, and what each artifact proves
```

Why this follows Task 39:

```txt
Task 38 made the public SDK boundary explicit.
Task 39 showed how an external LangGraph workflow can use that boundary.
Task 40 turns those pieces into a coherent demo path instead of leaving them as disconnected examples.
```

Narrative direction:

```txt
1. Run deterministic setup and tests.
2. Run CLI artifact generation.
3. Inspect result/state/trace/manifest/report artifacts.
4. Run or read the public SDK examples.
5. Run or read the LangGraph reference workflow examples.
6. Understand the local-first, mock-first boundary before optional Ollama or future production integrations.
```

Acceptance:

- README has a guided demo path that a new developer can follow without Ollama, LangSmith, a database, or an API key.
- the path names the exact commands to run and the artifacts to inspect.
- the narrative connects CLI artifacts, public SDK examples, LangGraph reference examples, and static evidence reports.
- the narrative explains why the demo starts with deterministic mock behavior before optional local LLM evaluation.
- docs avoid implying that this is already a production package, production checkpointing layer, or semantic quality benchmark.
- tests or static checks prevent the documented demo path from depending on internal source imports.
- the Chinese article mirrors the same story so it can become a publishable technical article outline.

Suggested TDD slices:

1. Task 40a: add a failing docs test that requires README to include a guided local demo path.
2. Task 40b: document the deterministic command sequence and expected `.output` artifacts.
3. Task 40c: add a docs/static check that the demo narrative links to public SDK and LangGraph reference examples.
4. Task 40d: document what each artifact proves and what it does not prove.
5. Task 40e: mirror the guided demo narrative in the Chinese article.
6. Task 40f: add a final docs guard that keeps the demo path local-first and mock-first by default.

### 41. Evidence And Benchmark Story

Scenario:

```txt
Given the project can produce traces, execution summaries, savings reports, comparison reports, inspector data, and reference workflow examples
When the project claims value
Then the claim is grounded in explicit evidence categories and avoids overclaiming latency, cost, factual accuracy, or general LLM quality
```

Why this follows Task 40:

```txt
Task 40 tells the developer how to run the demo.
Task 41 tells them how to interpret the evidence without turning a local deterministic demo into an exaggerated benchmark claim.
```

Evidence direction:

```txt
Reactive correction graph value is framed as:
- fewer unnecessary recomputations for fixed transitions.
- explicit receive/session reuse evidence.
- serializable LangGraph state safety.
- public SDK boundary discipline.
- reproducible artifact bundles and reports.

It is not framed as:
- a general latency benchmark.
- a token/cost benchmark.
- a factual correctness benchmark.
- a LangGraph replacement claim.
- a LangSmith replacement claim.
```

Acceptance:

- docs define separate evidence categories for recomputation savings, session reuse, state safety, public boundary safety, and report reproducibility.
- each category maps to concrete artifacts or tests, such as `trace.json`, `execution-summary.json`, `savings.json`, `comparison.json`, `report.html`, SDK examples, and reference workflow tests.
- benchmark language is scoped to deterministic fixed transitions unless a future benchmark supplies broader fixtures and methodology.
- docs clearly separate intentional verification/corroboration from accidental reactive recomputation.
- docs explain why repeated fact checks may be useful but do not automatically prove factual correctness.
- docs preserve limitations around latency, token use, cost, provider quality, semantic correctness, production durability, and distributed execution.
- README and Chinese article provide a concise value statement: the project reduces wasted recomputation inside agent workflow nodes and makes that behavior observable.

Suggested TDD slices:

1. Task 41a: add a failing docs test requiring named evidence categories and their artifact sources.
2. Task 41b: document recomputation savings and receive/session reuse using existing comparison artifacts.
3. Task 41c: document state safety and public-boundary safety using reference workflow tests.
4. Task 41d: document quality boundaries: what traces, repeated verification, and local LLM evaluation cannot prove.
5. Task 41e: add a concise README value statement focused on reducing wasted recomputation inside agent workflow nodes.
6. Task 41f: mirror the evidence and limitation story in the Chinese article for future technical publishing.

### 42. Reference Scenario Definition

Scenario:

```txt
Given the runtime, CLI, artifacts, public SDK, and LangGraph reference boundary are already in place
When the project moves from infrastructure proof to application proof
Then it should define one concrete reference scenario that demonstrates why reactive correction matters
```

Why this follows Task 41:

```txt
Task 41 explains what the existing evidence proves.
Task 42 turns that evidence into a fixed application scenario so future demos are not abstract runtime demonstrations.
```

Reference scenario direction:

```txt
Use a technical article / long-form draft correction scenario.
The scenario should include:
- an initial draft.
- a style guide.
- a style-only update.
- a claim-changing draft update.
- metadata that explains what each transition is meant to prove.
```

Acceptance:

- reference scenario fixtures live in predictable `src/examples/*` paths.
- fixtures are deterministic and can be loaded without Ollama, LangSmith, API keys, databases, or a web server.
- the scenario includes at least one style-only transition and one claim-changing transition.
- scenario metadata names the expected proof target for each transition.
- tests verify the fixtures can be read and are not empty.
- docs describe this as a reference application scenario, not a production app.

Suggested TDD slices:

1. Task 42a: add a failing fixture-loader test for a future reference scenario.
2. Task 42b: add the reference article draft, style guide, and scenario metadata fixtures.
3. Task 42c: add a typed `loadReferenceScenario` helper that returns the fixed scenario inputs.
4. Task 42d: validate that the scenario includes initial, style-only, and claim-changing transitions.
5. Task 42e: document the reference scenario purpose in README and the Chinese article.
6. Task 42f: add a guard that keeps the scenario mock-first and free of provider/network requirements.

### 43. Reference Scenario Runner

Scenario:

```txt
Given a fixed reference scenario exists
When a developer wants to reproduce the application demo
Then one command should run the scenario and produce the expected artifact bundle
```

Why this follows Task 42:

```txt
Task 42 defines what the application scenario is.
Task 43 makes that scenario executable through a stable CLI path.
```

Runner direction:

```txt
pnpm run demo:reference
```

The runner should produce deterministic local artifacts that can be inspected by humans and docs tests.

Acceptance:

- package scripts expose a `demo:reference` command.
- the command runs without Ollama, LangSmith, API keys, databases, or a browser.
- the command writes reference scenario artifacts under a predictable output path.
- generated artifacts include result, trace, state, execution summary, savings, comparison or manifest data as appropriate.
- runner errors are clear when fixtures are missing or invalid.
- tests can run the runner against a temporary output directory.

Suggested TDD slices:

1. Task 43a: add a failing CLI test for `demo:reference` using a temporary output directory.
2. Task 43b: implement a minimal reference scenario runner that loads the fixtures and runs the runtime.
3. Task 43c: write result, trace, state, and manifest artifacts for the reference scenario.
4. Task 43d: add execution summary and savings artifacts to the runner output.
5. Task 43e: document the `demo:reference` command and output paths.
6. Task 43f: add clear runner error handling for missing or invalid scenario fixtures.

### 44. Reference Scenario Transitions

Scenario:

```txt
Given the reference scenario can be executed
When the scenario applies fixed transitions
Then the output should show which work was reused and which work was recomputed
```

Why this follows Task 43:

```txt
Task 43 makes the scenario runnable.
Task 44 makes the scenario prove the actual value: avoiding unnecessary recomputation across controlled changes.
```

Transition direction:

```txt
1. Initial receive.
2. Style-only update.
3. Claim-changing draft update.
```

Acceptance:

- the reference runner applies the fixed transitions in order.
- style-only update reuses settled fact-check work when claims have not changed.
- claim-changing update recomputes fact-check work when claims change.
- each receive has a projected execution summary.
- artifacts make recomputed, reused, superseded, skipped, and emitted work visible.
- tests assert behavior from trace/artifact data rather than implementation internals.

Suggested TDD slices:

1. Task 44a: add a failing test that expects the reference runner to produce multiple receives.
2. Task 44b: implement ordered initial, style-only, and claim-changing transitions.
3. Task 44c: assert style-only transition reuses fact-check work.
4. Task 44d: assert claim-changing transition recomputes fact-check work.
5. Task 44e: include receive-level execution summaries in the reference artifacts.
6. Task 44f: document how each transition maps to the recomputation-savings story.

### 45. Application Report

Scenario:

```txt
Given the reference scenario produces trace and savings artifacts
When a developer opens the generated report
Then the report should explain the application-level story without requiring them to understand every runtime event
```

Why this follows Task 44:

```txt
Task 44 proves the transition behavior in artifacts.
Task 45 turns those artifacts into a readable application report.
```

Report direction:

```txt
The report should answer:
- What changed?
- What recomputed?
- What was reused?
- Why was reuse valid?
- What does this prove?
- What does it not prove?
```

Acceptance:

- the report has an application scenario section for the reference demo.
- the report highlights style-only reuse and claim-changing recomputation.
- the report links saved work to trace or execution-summary evidence.
- the report does not claim factual correctness, provider quality, latency savings, token savings, or production readiness.
- report view-model tests cover empty, partial, and complete reference artifacts.
- generated HTML remains static and local-first.

Suggested TDD slices:

1. Task 45a: add a failing report view-model test for reference scenario evidence.
2. Task 45b: project transition summaries into an application-level report model.
3. Task 45c: render style-only reuse and claim-changing recomputation in the report HTML.
4. Task 45d: add report copy for what the reference scenario proves and does not prove.
5. Task 45e: handle missing or partial reference artifacts gracefully.
6. Task 45f: document how to read the application report.

### 46. Reference Demo Docs

Scenario:

```txt
Given the reference scenario and application report exist
When a new developer wants to understand the project
Then the README and Chinese article should provide one direct path from command to evidence
```

Why this follows Task 45:

```txt
Task 45 gives the demo a readable report.
Task 46 makes the demo explainable from the repository entry points.
```

Docs direction:

```txt
1. Run deterministic checks.
2. Run `pnpm run demo:reference`.
3. Open the generated artifacts.
4. Read the application report.
5. Optionally compare with Ollama evaluation as provider compatibility, not quality proof.
```

Acceptance:

- README has a short reference demo path.
- Chinese article mirrors the same story for future publishing.
- docs name exact commands and exact artifacts to inspect.
- docs explain why the reference demo is mock-first and deterministic.
- docs explain where Ollama fits as optional provider compatibility evaluation.
- docs avoid positioning the reference demo as a complete product or production benchmark.

Suggested TDD slices:

1. Task 46a: add a failing docs test requiring README to include the reference demo command.
2. Task 46b: document the reference demo command and artifact checklist.
3. Task 46c: mirror the reference demo path in the Chinese article.
4. Task 46d: document the optional Ollama path as provider compatibility only.
5. Task 46e: add a docs guard against production benchmark language.
6. Task 46f: update the final demo narrative so CLI, SDK, LangGraph, report, and reference scenario all connect.

### 47. Reference Demo Guardrails

Scenario:

```txt
Given the project now has an application-level reference demo
When someone reads or modifies the demo
Then tests and docs should keep its claims scoped to recomputation, traceability, and integration boundaries
```

Why this follows Task 46:

```txt
Task 46 makes the demo easier to understand.
Task 47 prevents that clearer story from turning into overclaims.
```

Guardrail direction:

```txt
Protect the reference demo from implying:
- factual correctness benchmark.
- general LLM quality benchmark.
- latency or cost benchmark.
- LangGraph replacement.
- LangSmith replacement.
- framework-specific web adapter requirement.
- production durability guarantee.
```

Acceptance:

- docs tests guard against unsupported benchmark and replacement claims.
- reference demo tests stay deterministic by default.
- Ollama/manual tests remain opt-in.
- output artifacts preserve quality boundaries and `subjectiveCorrectionQuality: not-evaluated` where appropriate.
- public SDK imports remain the only supported integration path for examples.
- guardrail docs make the project positioning clear: application-level recomputation and traceability demo.

Suggested TDD slices:

1. Task 47a: add a failing docs guard test for unsupported benchmark and replacement claims.
2. Task 47b: enforce mock-first reference demo behavior in tests.
3. Task 47c: keep Ollama/manual evaluation opt-in and documented separately.
4. Task 47d: verify output artifacts preserve quality-boundary fields and language.
5. Task 47e: ensure reference examples import through the public SDK boundary only.
6. Task 47f: summarize final positioning in README and the Chinese article.

### 48. Reference Demo Closure

Scenario:

```txt
Given the deterministic reference demo already writes trace and execution-summary evidence
When a developer runs the reference command
Then the same bundle should contain measured comparison data, a non-placeholder savings report, and a readable static report
```

Why this follows Task 47:

```txt
Task 47 keeps the current demo claims honest.
Task 48 closes the two remaining operational gaps before the project introduces multi-agent coordination.
```

Closure direction:

```txt
pnpm run demo:reference
  -> run the persistent reference transitions.
  -> run a fresh-session baseline for the same fixed transitions.
  -> compare only structurally comparable final results.
  -> write comparison.json and a populated savings.json.
  -> render report.html inside the same reference bundle.
```

Acceptance:

- the eager baseline and persistent reference path use the same fixtures and deterministic model behavior.
- `comparison.json` and `savings.json` contain `style-only` and `claim-changing` scenarios instead of placeholder empty arrays.
- avoided-call values are reported only when the eager and reactive final results are structurally comparable.
- `execution-summary.json` remains the receive-level source for recomputed, reused, superseded, and emitted work.
- `report.html` is generated under `.output/reference` and the manifest preserves the `demo:reference` source-run identity.
- `scorecard.json` reports measured execution evidence separately while keeping `subjectiveCorrectionQuality: not-evaluated`.
- the full path remains deterministic, local-first, and testable in a temporary output directory.

Suggested TDD slices:

1. Task 48a: add a failing reference comparison test that expects style-only and claim-changing measurements.
2. Task 48b: implement the minimal fresh-session baseline and persistent-session measurement for the fixed reference transitions.
3. Task 48c: write compatible `comparison.json` and populated `savings.json` artifacts with comparability guards.
4. Task 48d: add a failing CLI test that expects `.output/reference/report.html` in the completed bundle.
5. Task 48e: render the static report from the reference bundle while preserving source-run manifest provenance.
6. Task 48f: update README, the Chinese article, and docs guards for the one-command reference evidence path.

### 49. Multi-Agent Contract Definition

Scenario:

```txt
Given the single-session reference demo is complete
When the project introduces more than one agent runtime
Then agent identity, message causality, state ownership, and failure semantics should be explicit before coordination behavior is implemented
```

Why this follows Task 48:

```txt
Task 48 finishes the single-runtime application proof.
Task 49 defines what changes when work is owned by separate agents instead of branches inside one runtime.
```

Contract direction:

```txt
Start with two roles:
- FactCheck Agent: owns claim verification and evidence output.
- Writer Agent: owns style-aware revision from draft plus accepted evidence.

Use a framework-neutral coordinator boundary.
Agents exchange versioned, JSON-serializable envelopes rather than live runtime objects.
The initial reference design uses isolated agent sessions owned by one coordinator.
```

Acceptance:

- agent identities and responsibilities are named explicitly and do not reuse operation labels as if they were autonomous agents.
- message envelopes are versioned and include enough identity, correlation, and input-version data to establish causality.
- agent inputs, outputs, errors, and stale outcomes are JSON-serializable and validate through public parsers.
- ownership is explicit: the coordinator owns routing and lifecycle; each agent owns its private runtime state.
- unknown agents, malformed envelopes, and stale input versions produce deterministic diagnostics instead of silently mutating state.
- contracts remain independent of React, Vue, web servers, LangGraph state objects, and real LLM providers.
- docs explain why the current fact-check/style/rewrite branches are not yet equivalent to isolated agents.

Suggested TDD slices:

1. Task 49a: add a failing contract test for round-tripping a versioned agent message envelope.
2. Task 49b: implement minimal agent identity, envelope, result, and parser contracts.
3. Task 49c: add a failing contract test for unknown recipients, malformed payloads, and stale input versions.
4. Task 49d: implement deterministic validation and causal-version diagnostics without adding coordination behavior.
5. Task 49e: define and test the framework-neutral coordinator interface and isolated agent-session ownership boundary.
6. Task 49f: document the two-agent roles, ownership decision, public boundary, and explicit non-goals.

### 50. Two-Agent Reactive Vertical Slice

Scenario:

```txt
Given FactCheck Agent and Writer Agent contracts exist
When a draft or style instruction changes
Then the coordinator should route only the agent work invalidated by that change and expose the decision through trace evidence
```

Why this follows Task 49:

```txt
Task 49 defines the multi-agent language and boundaries.
Task 50 proves one end-to-end behavior with two deterministic agents before adding autonomy, tools, or more roles.
```

Vertical-slice direction:

```txt
Draft and claims
  -> FactCheck Agent
  -> versioned evidence message
  -> Writer Agent
  -> revised draft and final result

Style-only update:
  reuse settled FactCheck Agent evidence; rerun Writer Agent.

Claim-changing update:
  rerun FactCheck Agent; route new evidence to Writer Agent; reject stale results.
```

Acceptance:

- the two-agent scenario runs with deterministic mock functions and no Ollama, network, database, or UI requirement.
- an initial receive produces versioned fact-check evidence and a revised draft through the coordinator public interface.
- a style-only update reuses current FactCheck Agent evidence and reruns Writer Agent work.
- a claim-changing update invalidates old evidence and reruns both affected agents.
- agent-level trace data records message emission, receipt, pending work, resolution, reuse, stale results, and final emission.
- two coordinator sessions remain isolated and do not share agent runtime state through module-level globals.
- serializable workflow state contains facts and envelopes, never live sessions, signals, promises, subscriptions, or abort controllers.
- the first slice does not claim autonomous planning, dynamic team formation, tool selection, or model-quality improvement.

Suggested TDD slices:

1. Task 50a: add a failing end-to-end test for an initial FactCheck Agent to Writer Agent correction result.
2. Task 50b: implement the minimal deterministic agents and coordinator needed to pass the initial tracer bullet.
3. Task 50c: add a failing style-only update test that expects FactCheck Agent evidence reuse.
4. Task 50d: implement agent-level invalidation, reuse, and trace projection for the style-only path.
5. Task 50e: add failing claim-changing and session-isolation tests that reject stale evidence.
6. Task 50f: implement the minimal claim invalidation and isolation behavior, then document the two-agent reference flow and its limits.

### 51. Multi-Agent Snapshot And Recovery

Scenario:

```txt
Given the two-agent coordinator owns isolated runtime sessions
When a process snapshots and restores a settled or interrupted workflow
Then restored agents should preserve causal state without allowing pre-restore async work or another session to overwrite the result
```

Why this follows Task 50:

```txt
Task 50 proves live two-agent coordination.
Task 51 makes that coordination durable and determines where @signal-kernel/snapshot belongs in the architecture.
```

Snapshot direction:

```txt
Coordinator snapshot:
- schema version and coordinator/session identity.
- current input and causal version.
- serializable message cursor or accepted envelope history.
- one serializable snapshot per isolated agent runtime.
- emitted result and trace metadata needed for safe continuation.

@signal-kernel/snapshot is used at the owned agent-runtime boundary.
The coordinator remains responsible for the aggregate versioned envelope and restore policy.
```

Acceptance:

- a versioned multi-agent snapshot round-trips through JSON without live runtime handles.
- restoring a settled snapshot reproduces the same emitted result and trace baseline.
- the next style-only or claim-changing receive after restore preserves the Task 50 reuse and invalidation behavior.
- async work started before restore cannot overwrite restored agent state or emit a newer-looking stale result.
- restored coordinator sessions remain isolated when created from the same snapshot value.
- malformed snapshots, unsupported schema versions, agent-identity mismatches, and incomplete agent snapshots fail with clear errors.
- snapshot data can be stored in LangGraph checkpoint state, while live agent runtimes remain process-local.
- no database or distributed persistence backend is introduced in this task.

Suggested TDD slices:

1. Task 51a: add a failing JSON round-trip test for a settled two-agent coordinator snapshot.
2. Task 51b: implement the versioned aggregate snapshot and per-agent `@signal-kernel/snapshot` adapters.
3. Task 51c: add a failing restore-and-continue test for style-only reuse and claim-changing invalidation.
4. Task 51d: implement causal epoch restoration and invalidate pre-restore async work.
5. Task 51e: add failing tests for restored-session isolation, malformed snapshots, schema mismatch, and agent-identity mismatch.
6. Task 51f: implement the remaining restore guards and document the LangGraph checkpoint boundary, public SDK surface, and durability limits.

## How To Ask The Agent

Good request:

```txt
Start TDD task 4: Style Guide Change.

Use createCorrectionRuntime as the public interface.
First write the failing test.
Then implement the smallest fix.
Then refactor if needed.
```

Bad request:

```txt
Rewrite createCorrectionRuntime to support invalidation.
```

The good request names one behavior and one acceptance target. The bad request jumps straight to implementation.
