# reactive-correction-graph

CLI scaffold for validating a signal-kernel powered reactive correction runtime.

See [TDD Workflow](./docs/tdd-workflow.md) for the red-green-refactor process used to add runtime behavior.
See [Chinese Technical Article Draft](./docs/reactive-correction-graph-zh.md) for a Chinese explanation of the architecture and positioning.
See [Local LLM Provider](./docs/local-llm-provider.md) for the optional Ollama demo path.

## Architecture

```mermaid
flowchart TD
  input["Markdown input<br/>src/examples/input.md"]
  cli["CLI<br/>src/cli/runDemo.ts"]
  runtime["SignalNode boundary<br/>createCorrectionRuntime()"]
  output[".output/result.md<br/>.output/trace.json<br/>.output/state.json"]

  input --> cli
  cli -->|"receive() / runUntilSettled() / emit() / trace()"| runtime
  runtime --> output

  langgraph["Future LangGraph node"]
  langgraph -. "same SignalNode contract" .-> runtime
```

## Runtime Flow

```mermaid
flowchart LR
  draft["draft signal"]
  claims["claims computed"]
  factCheck["factCheck resource<br/>(mock async)"]
  styleReview["styleReview resource<br/>(mock async)"]
  plan["correctionPlan computed"]
  rewrite["rewriteDraft resource<br/>(mock async)"]
  final["finalResult computed"]
  effect["emit effect"]
  trace["trace collector"]

  draft --> claims
  claims --> factCheck
  draft --> styleReview
  factCheck --> plan
  styleReview --> plan
  plan --> rewrite
  draft --> rewrite
  rewrite --> final
  plan --> final
  final --> effect

  draft -. changed/stale .-> trace
  claims -. completed/skipped .-> trace
  factCheck -. pending/resolved .-> trace
  styleReview -. pending/resolved .-> trace
  plan -. completed/skipped .-> trace
  rewrite -. pending/resolved .-> trace
  effect -. emitted .-> trace
```

## Run

```bash
pnpm install
pnpm demo ./src/examples/input.md
pnpm run demo:graph
```

The explanatory fixture is [`src/examples/input.md`](./src/examples/input.md).
Its JSON front matter supplies `userIntent` and `styleGuide`, while the draft
contains a tentative claim with the word `maybe`. With the deterministic mock
provider, these inputs produce separate intent, style, and fact-check actions.

The demos write:

- `.output/result.md`
- `.output/trace.json`
- `.output/state.json`

Inspect the artifacts in this order:

1. `result.md` shows the revised draft, correction summary, and unresolved
   factual issue.
2. `state.json` shows the extracted claims and structured correction state. In
   graph mode it also contains `graphTrace` and the inner runtime `trace`.
3. `trace.json` shows the runtime lifecycle, including resource `pending` and
   `resolved` events followed by `finalResult emitted`.
