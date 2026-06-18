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
