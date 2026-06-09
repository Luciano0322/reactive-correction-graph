# proposal: Reactive Correction Graph

## 1. Summary

This project explores how `signal-kernel` can be embedded inside a LangGraph workflow as a fine-grained reactive execution engine for async correction workflows.

The first version will be implemented as a CLI-based demo project. The goal is to validate whether `signal-kernel` can correctly manage async sources, derived state, invalidation, feedback correction, and settled output before introducing any UI framework.

LangGraph will be used as the outer orchestration layer. `signal-kernel` will be used inside a LangGraph node as the internal reactive runtime.

The project should prove the following architectural idea:

> LangGraph orchestrates the outer agent workflow.
> signal-kernel manages local async dependencies, invalidation, and reactive settling inside a workflow node.

---

## 2. Motivation

Modern AI workflows often involve multiple async operations that depend on each other:

* Extracting claims from generated text
* Checking facts
* Reviewing style
* Planning corrections
* Rewriting the draft
* Validating the final result

LangGraph is suitable for describing high-level workflow orchestration: nodes, edges, state transitions, and control flow.

However, inside a single workflow node, the internal state can become highly dynamic. A node may contain several derived states and async resources that should not always be recomputed together.

For example:

* If fact-checking results change, the correction plan and rewrite should update.
* If style review results remain unchanged, the style review branch should not rerun.
* If the user edits a specific claim, only the dependent correction path should become stale.
* If an LLM rewrite is streaming, the previous stable value should remain available while the new value is pending.

This project aims to validate whether `signal-kernel` can handle this fine-grained dependency-level execution model inside a LangGraph node.

---

## 3. Non-Goals

The first version of this project is intentionally limited.

This RFC does not aim to build:

* A full AI SaaS product
* A chatbot
* A multi-modal agent
* A RAG system
* A vector database pipeline
* A production UI
* A full authentication system
* A deployment-ready server
* A generic LangGraph plugin package

The first goal is runtime validation, not product polish.

---

## 4. Core Hypothesis

The core hypothesis is:

> A LangGraph node can host a local `signal-kernel` runtime to manage complex async dependencies more naturally than manually coordinating all internal node state through workflow-level edges.

This does not mean `signal-kernel` replaces LangGraph.

Instead, the intended relationship is:

| Layer         | Responsibility                               |
| ------------- | -------------------------------------------- |
| LangGraph     | High-level agent workflow orchestration      |
| signal-kernel | Local reactive async dependency management   |
| LLM provider  | Text generation, checking, rewriting         |
| CLI           | Initial validation and trace output          |
| Future UI     | Visualization of traces and dependency graph |

---

## 5. Architecture Overview

The first version should follow this architecture:

```txt
CLI input
  -> LangGraph workflow
      -> prepareInputNode
      -> reactiveCorrectionNode
          -> signal-kernel correction runtime
              -> signals
              -> computed values
              -> async resources
              -> effects
              -> trace collector
      -> finalizeNode
  -> output result.md
  -> output trace.json
  -> output state.json
```

The important boundary is `reactiveCorrectionNode`.

From LangGraph's perspective, it is just a normal node:

```ts
async function reactiveCorrectionNode(
  state: GraphState
): Promise<Partial<GraphState>> {
  // run signal-kernel runtime internally
}
```

From `signal-kernel`'s perspective, the node contains a local reactive graph:

```txt
draft signal
  -> claims computed
      -> factCheck resource
          -> correctionPlan computed
              -> rewrite resource / stream resource
  -> styleReview resource
      -> correctionPlan computed
```

---

## 6. Execution Model

The project should validate a two-level graph model.

### 6.1 Outer Graph: LangGraph

LangGraph controls the high-level workflow:

```txt
START
  -> prepareInput
  -> reactiveCorrectionNode
  -> finalize
  -> END
```

LangGraph state should contain the high-level workflow data:

```ts
type GraphState = {
  inputDraft: string
  extractedClaims?: Claim[]
  factCheckResult?: FactCheckResult
  styleReviewResult?: StyleReviewResult
  correctionPlan?: CorrectionPlan
  revisedDraft?: string
  finalResult?: FinalResult
  trace?: TraceEvent[]
}
```

### 6.2 Inner Graph: signal-kernel

`signal-kernel` controls the local dependency graph inside `reactiveCorrectionNode`.

The internal runtime should manage:

```txt
signal: draft
computed: extractedClaims
resource: factCheckClaims
resource: reviewStyle
computed: correctionPlan
resource or stream resource: rewriteDraft
computed: finalResult
effect: emit settled result
```

The runtime should only recompute branches whose dependencies changed.

---

## 7. SignalNode Contract

The project should introduce a local abstraction called `SignalNode`.

This does not need to be a published package in the first version. It can be a project-internal contract.

```ts
type SignalNode<InputState, OutputState> = {
  receive(state: InputState): void
  runUntilSettled(): Promise<void>
  emit(): Partial<OutputState>
  trace(): TraceEvent[]
}
```

The purpose of `SignalNode` is to make `signal-kernel` embeddable inside any external workflow engine.

LangGraph is the first host, but the concept should not be tightly coupled to LangGraph.

---

## 8. MVP Use Case: Reactive Correction Engine

The first demo should be a text correction workflow.

Input:

```txt
A markdown draft written by the user.
```

Output:

```txt
A corrected draft, correction log, unresolved issues, and trace data.
```

The correction engine should perform:

1. Claim extraction
2. Fact checking
3. Style review
4. Correction planning
5. Draft rewriting
6. Final validation

The first version can use simplified prompts and mockable LLM calls. The key point is not LLM quality, but the execution behavior.

---

## 9. Required Trace Events

Trace output is a core feature of this project.

The CLI must produce trace data that can later be used by a UI.

A trace event should follow this shape:

```ts
type TraceEvent = {
  id: string
  at: number
  scope: "langgraph" | "signal-kernel" | "llm" | "resource" | "computed" | "effect"
  type:
    | "started"
    | "completed"
    | "changed"
    | "stale"
    | "pending"
    | "resolved"
    | "rejected"
    | "skipped"
    | "emitted"
  label: string
  metadata?: Record<string, unknown>
}
```

The trace should show at least:

```txt
[LangGraph] prepareInput started
[LangGraph] reactiveCorrectionNode started

[signal] draft changed
[computed] claims stale
[computed] claims completed
[resource] factCheck pending
[resource] factCheck resolved
[resource] styleReview pending
[resource] styleReview resolved
[computed] correctionPlan stale
[resource] rewrite pending
[resource] rewrite resolved
[effect] finalResult emitted

[LangGraph] finalize completed
```

The trace should also make skipped branches visible when possible.

Example:

```txt
Changed:
  factCheckResult

Invalidated:
  correctionPlan
  rewriteDraft
  finalResult

Skipped:
  styleReview
```

---

## 10. CLI Interface

The first version should expose a CLI command.

Example:

```bash
pnpm demo ./examples/input.md
```

Alternative command:

```bash
pnpm correction:run ./examples/input.md
```

Expected output:

```txt
Running Reactive Correction Graph...

Output written to:
- ./.output/result.md
- ./.output/trace.json
- ./.output/state.json
```

The CLI should not require a web server.

---

## 11. Output Files

The CLI should generate the following files:

```txt
.output/
  result.md
  trace.json
  state.json
```

### 11.1 result.md

Contains the final corrected draft and a human-readable correction summary.

### 11.2 trace.json

Contains all LangGraph and signal-kernel trace events.

This file should be designed so a future UI can visualize:

* LangGraph workflow trace
* signal-kernel dependency trace
* invalidation path
* async resource lifecycle

### 11.3 state.json

Contains the final LangGraph state.

---

## 12. Technology Choices

### 12.1 Language

Use TypeScript.

Reason:

* `signal-kernel` is written in TypeScript.
* LangGraph.js can run directly in the same runtime.
* Avoids cross-language complexity between Python LangGraph and TypeScript signal-kernel.

### 12.2 Runtime

Use Node.js 20+.

### 12.3 Package Manager

Use pnpm.

### 12.4 Core Dependencies

```json
{
  "dependencies": {
    "@langchain/core": "latest",
    "@langchain/langgraph": "latest",
    "@langchain/openai": "latest",
    "@signal-kernel/core": "link:../signal-kernel/packages/core",
    "@signal-kernel/async-runtime": "link:../signal-kernel/packages/async-runtime",
    "zod": "latest",
    "dotenv": "latest"
  },
  "devDependencies": {
    "typescript": "latest",
    "tsx": "latest",
    "vitest": "latest",
    "eslint": "latest",
    "prettier": "latest"
  }
}
```

During local development, `signal-kernel` should be linked from the local workspace.

Publishing and versioning are not part of the first version.

---

## 13. Suggested Project Structure

Initial simple structure:

```txt
reactive-correction-graph/
  src/
    cli/
      runDemo.ts

    graph/
      createGraph.ts
      nodes/
        prepareInputNode.ts
        reactiveCorrectionNode.ts
        finalizeNode.ts

    runtime/
      createCorrectionRuntime.ts
      signals.ts
      computed.ts
      resources.ts
      effects.ts

    llm/
      model.ts
      prompts.ts

    schemas/
      claim.ts
      correction.ts
      graphState.ts

    trace/
      createTraceCollector.ts
      types.ts

    examples/
      input.md

  docs/
    architecture.md
    signal-node-contract.md
    langgraph-vs-signal-kernel.md

  .output/
    result.md
    trace.json
    state.json

  package.json
  tsconfig.json
  .env.example
```

The project should stay simple at first.

Do not introduce a monorepo until the runtime behavior is validated.

---

## 14. Runtime Design

### 14.1 Inputs

The runtime receives:

```ts
type CorrectionRuntimeInput = {
  draft: string
  userIntent?: string
  styleGuide?: string
}
```

### 14.2 Outputs

The runtime emits:

```ts
type CorrectionRuntimeOutput = {
  claims: Claim[]
  factCheckResult: FactCheckResult
  styleReviewResult: StyleReviewResult
  correctionPlan: CorrectionPlan
  revisedDraft: string
  finalResult: FinalResult
}
```

### 14.3 Signals

Required signals:

```ts
draftSignal
userIntentSignal
styleGuideSignal
```

Optional future signals:

```ts
claimOverrideSignal
manualCorrectionSignal
modelConfigSignal
```

### 14.4 Computed Values

Required computed values:

```ts
claimsComputed
correctionPlanComputed
finalResultComputed
```

### 14.5 Async Resources

Required resources:

```ts
factCheckResource
styleReviewResource
rewriteDraftResource
```

The rewrite resource may become a stream resource if the current `async-runtime` supports stable streaming behavior.

---

## 15. Validation Scenarios

The project should include several test scenarios.

### 15.1 Basic Run

Input draft goes through the full correction workflow.

Expected:

* All required resources run.
* Final result is emitted.
* Trace contains LangGraph and signal-kernel events.

### 15.2 Fact Check Change

Modify one claim or fact-check result.

Expected:

* `correctionPlan` becomes stale.
* `rewriteDraft` reruns.
* `styleReview` does not rerun if its inputs did not change.

### 15.3 Style Guide Change

Modify style guide.

Expected:

* `styleReview` reruns.
* `correctionPlan` reruns.
* `rewriteDraft` reruns.
* `factCheck` does not rerun if claims did not change.

### 15.4 Draft Change

Modify the draft.

Expected:

* claims recompute.
* fact check reruns.
* style review reruns.
* correction plan reruns.
* rewrite reruns.
* final result updates.

### 15.5 Streaming Rewrite

If stream resource is used:

Expected:

* `stableValue` keeps the previous completed draft.
* `value` updates with the in-progress stream.
* final result is emitted only after the stream settles.

---

## 16. Success Criteria

The first version is successful if:

1. The CLI can process a markdown draft.
2. LangGraph can call `reactiveCorrectionNode`.
3. `reactiveCorrectionNode` can host a local `signal-kernel` runtime.
4. The runtime can manage at least two independent async resources.
5. The runtime can produce a final settled output.
6. The trace clearly shows stale, pending, resolved, skipped, and emitted events.
7. The final result can be returned to LangGraph as partial state.
8. Output files are generated for future UI visualization.

The project does not need a UI to be considered successful.

---

## 17. Future Work

After the CLI version is stable, the project can add a UI.

Potential UI stack:

```txt
Next.js
React
Tailwind CSS
React Flow
```

The UI should visualize:

* LangGraph workflow
* signal-kernel dependency graph
* invalidation path
* resource lifecycle
* final corrected draft

Potential persistence layer:

```txt
SQLite
Drizzle ORM
```

Potential future feature:

```txt
@signal-kernel/snapshot
```

Snapshot support could enable:

* Saving a correction session
* Restoring a runtime state
* Replaying invalidation traces
* Comparing before and after graph states

---

## 18. Risks

### 18.1 Scope Creep

The project can easily become too large if UI, RAG, vector database, multi-agent simulation, or multi-modal input are introduced too early.

Mitigation:

* Start with CLI only.
* Use markdown input.
* Use simple output files.
* Keep LangGraph workflow minimal.

### 18.2 LLM Output Instability

LLM output may be inconsistent.

Mitigation:

* Use Zod schemas.
* Keep prompts small and explicit.
* Allow mocked LLM responses during runtime validation.

### 18.3 Misleading Positioning

The project should not claim that LangGraph cannot handle loops or dynamic workflows.

Correct positioning:

> LangGraph handles workflow-level orchestration.
> signal-kernel handles dependency-level reactive settling inside a workflow node.

### 18.4 UI Masking Runtime Bugs

Building UI too early may make it difficult to identify whether bugs come from the runtime, LangGraph integration, or rendering lifecycle.

Mitigation:

* Validate with CLI first.
* Export trace data.
* Add UI only after runtime behavior is stable.

---

## 19. Final Positioning

This project should be presented as:

> A LangGraph-compatible reactive correction engine powered by signal-kernel.

More specifically:

> This project explores how signal-kernel can be embedded inside a LangGraph node as a fine-grained reactive execution engine for async correction workflows. LangGraph orchestrates the outer agent workflow, while signal-kernel manages local async dependencies, invalidation, and reactive settling.

The long-term vision is broader than LangGraph:

> signal-kernel can act as a reactive execution substrate for workflow engines, agent runtimes, and correctness-oriented AI systems.
