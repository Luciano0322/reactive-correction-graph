# Local LLM Provider

This project can optionally run the correction model against a local Ollama server.

The default runtime and tests still use deterministic mock model functions. Ollama is only for manual demos.

## Why Optional

Local LLM execution depends on the developer machine:

- Ollama must be installed and running.
- A model must be pulled locally.
- Output quality and latency vary by hardware and model size.

For that reason, normal `pnpm test` does not require Ollama.

## Ollama Setup

Install Ollama from the official site:

```txt
https://ollama.com
```

Pull a small model:

```bash
ollama pull qwen3:4b
```

Ollama's local API defaults to:

```txt
http://localhost:11434
```

The runtime uses Ollama's `/api/generate` endpoint with `stream: false`.

### Structured Response Contracts

`factCheckClaims` and `reviewStyle` pass explicit JSON Schemas in Ollama's
`format` field rather than requesting generic `"json"` generation. This follows
Ollama's [structured-output API](https://docs.ollama.com/capabilities/structured-outputs).
It addresses the locally reproduced style-review generation that repeated
whitespace without completing its JSON response; it is not a guarantee that
every model will finish within the runtime budget.

The provider also validates the parsed response before returning it:

- Fact-check responses must contain an `items` array. Each item must have a
  string `claimId`, a `supported` or `needs-review` verdict, and a string `note`.
- Style-review responses must contain a `clear` or `needs-polish` tone and a
  `suggestions` array containing only strings.
- Missing fields, incorrect types, unknown enum values, and additional fields
  reject with an error identifying the task and model. They are not silently
  converted into empty results or a `clear` tone.

A valid empty `items` array is still allowed. Missing claim coverage and unknown
claim IDs remain the runtime's responsibility, using the existing coverage
normalization. `rewriteDraft` remains plain markdown without a JSON Schema.

These contracts validate data structure only. They do not establish that a
verdict is factually correct or a style suggestion is useful. No timeout,
retry policy, or Settle core behavior is changed by this provider contract.

## Manual Demo

Run:

```bash
pnpm demo:ollama ./src/examples/input.md
```

Optional environment variables:

```txt
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
CORRECTION_SETTLE_TIMEOUT_MS=120000
CORRECTION_SETTLE_POLL_MS=100
```

If `OLLAMA_MODEL` is not set, the demo uses:

```txt
qwen3:4b
```

The Ollama CLI path gives the runtime a longer settle timeout than the mock
provider because local models can take a while to load and generate. The default
Ollama timeout is 120 seconds. If your machine is slower or the model is larger,
increase `CORRECTION_SETTLE_TIMEOUT_MS`.

If you see an error like:

```txt
Ollama factCheckClaims returned an empty response for model qwen3:4b
```

the runtime reached Ollama successfully, but that model did not return usable
JSON for the structured fact-check step. Try another local instruction model by
setting `OLLAMA_MODEL`, or keep using the mock provider while developing the
reactive runtime behavior.

## LangGraph + Ollama Demo

The graph demo passes the selected Ollama model through
`createCorrectionGraph()` into the existing correction runtime. LangGraph owns
the outer workflow; it does not duplicate provider or reactive runtime logic.

PowerShell:

```powershell
$env:OLLAMA_MODEL = "llama3.2:3b"
pnpm run demo:graph --provider ollama
```

Git Bash or other POSIX-style shells:

```bash
OLLAMA_MODEL=llama3.2:3b pnpm run demo:graph --provider ollama
```

An explicit input path remains optional:

```bash
pnpm run demo:graph --provider ollama ./src/examples/input.md
```

After a successful run:

- `.output/result.md` contains the local model correction output.
- `.output/state.json` contains `finalResult`, outer `graphTrace`, and inner
  runtime `trace`.
- `.output/trace.json` contains the runtime lifecycle including
  `finalResult emitted`.

This is a manual local integration path. Normal tests and CI continue to use
the deterministic mock provider.

## Local LLM Evaluation

The evaluation command runs the explanatory, fact-focused, and style-focused
fixtures through the Ollama-backed LangGraph workflow. It writes the trial
records to `.output/evaluation.json`.

PowerShell:

```powershell
$env:OLLAMA_MODEL = "llama3.2:3b"
$env:EVALUATION_TRIALS = "2"
pnpm run evaluate:ollama
```

Git Bash or other POSIX-style shells:

```bash
OLLAMA_MODEL=llama3.2:3b EVALUATION_TRIALS=2 pnpm run evaluate:ollama
```

`EVALUATION_TRIALS` defaults to `1`. Each trial records whether the graph
settled or rejected, its duration, claim coverage diagnostics, unresolved issue
count, and any provider error. `OLLAMA_BASE_URL` can still override the default
`http://localhost:11434` endpoint.

The report `summary` contains structural measurements only:

- `settledTrials` and `rejectedTrials` describe graph completion reliability.
- `fullCoverageTrials` describes whether the provider returned a result for
  every extracted claim.
- `trialsWithNormalizedMissing` and `trialsWithIgnoredUnknown` describe
  provider output that the runtime had to normalize or ignore.
- `subjectiveCorrectionQuality` is always `not-evaluated` because this harness
  has no human or model-based quality rubric.

A settled trial with full claim coverage proves that the integration contract
completed. It does not prove that factual verdicts are correct, prose is good,
or the rewrite satisfies a reader's expectations. Those questions require a
separate evaluation rubric and reviewed reference examples.

This is a manual command. Normal `pnpm test` uses a deterministic local HTTP
boundary and does not require Ollama to be installed or running.

## Manual Multi-Model Corroboration

This optional command asks two or more explicitly configured Ollama models to
inspect one claim. It writes the versioned result, individual verification
attempts, quorum details, and verification trace to
`.output/corroboration.json`.

PowerShell:

```powershell
$env:OLLAMA_CORROBORATION_MODELS = "llama3.2:3b,qwen3:4b"
$env:CORROBORATION_MINIMUM_MODELS = "2"
pnpm run evaluate:corroboration -- "Signal-kernel tracks reactive dependencies."
```

Git Bash or other POSIX-style shells:

```bash
OLLAMA_CORROBORATION_MODELS=llama3.2:3b,qwen3:4b \
CORROBORATION_MINIMUM_MODELS=2 \
pnpm run evaluate:corroboration -- "Signal-kernel tracks reactive dependencies."
```

`OLLAMA_BASE_URL` can override the local Ollama endpoint. The minimum model
count defaults to the number of configured entries. Repeating the same model
under different verifier IDs produces `insufficient-evidence` rather than
independent corroboration. Agreement records deliberate verification work; it
does not prove that the claim is factually true or that the models use
independent external sources.

This path is manual and is not part of normal tests or CI.

## Provider Selection

Default mock provider:

```bash
pnpm demo ./src/examples/input.md
```

Equivalent explicit provider:

```bash
pnpm demo --provider mock ./src/examples/input.md
```

Ollama provider:

```bash
pnpm demo --provider ollama ./src/examples/input.md
```

## Validating Local Demo Output

A successful command only proves that the local provider path ran to completion.
Check the generated artifacts before treating the result as semantically useful.

Inspect `.output/result.md`:

- `## Revised Draft` should contain the rewritten markdown.
- `## Correction Summary` should explain why the draft changed.
- `## Unresolved Issues` should list claims that still need review.

Inspect `.output/state.json`:

- `finalResult` should exist.
- `claims` should contain the extracted claims.
- `factCheckResult.items` should cover every extracted claim.
- if a provider omits a claim, the runtime normalizes that missing coverage into
  a `needs-review` item.
- unknown provider `claimId` values are ignored and do not count as coverage.

Inspect `.output/trace.json`:

- successful runs should include resource `pending` and `resolved` events.
- successful runs should include `effect finalResult emitted`.
- hard provider failures, such as invalid JSON, should include a resource
  `rejected` event and should not emit a final result.

### Claim Budget vs Provider Coverage

The runtime extracts at most six claims from a draft for fact-checking. When a
draft has more candidates, trace includes a `computed claimBudget skipped`
event with the candidate, extracted, and omitted counts. Its
`factCheckScope` metadata is `extractedClaims`, so fact-check coverage applies
only to the claims present in runtime state.

This differs from provider coverage problems:

- claim budget means the runtime intentionally omitted candidates before
  calling the provider.
- missing coverage means the provider omitted a result for an extracted claim;
  the runtime normalizes it to `needs-review`.
- an unknown `claimId` means the provider returned a result outside the
  extracted claim set; the runtime ignores it.

## Manual Smoke Test

The LangGraph + Ollama smoke test is skipped unless `OLLAMA_MODEL` is set.
Run it from the `reactive-correction-graph` repository root.

PowerShell:

```powershell
$env:OLLAMA_MODEL = "qwen3:4b"
pnpm exec vitest run src/llm/ollamaCorrectionModel.manual.test.ts --reporter=verbose
```

Git Bash or other POSIX-style shells:

```bash
OLLAMA_MODEL=qwen3:4b pnpm exec vitest run src/llm/ollamaCorrectionModel.manual.test.ts --reporter=verbose
```

The default runtime budget is 120 seconds. The outer Vitest timeout is 150
seconds, leaving time for the runtime error and diagnostic snapshot to be
reported first. To override this smoke test's runtime budget:

```bash
OLLAMA_MODEL=qwen3:4b OLLAMA_SMOKE_TIMEOUT_MS=180000 pnpm exec vitest run src/llm/ollamaCorrectionModel.manual.test.ts --reporter=verbose
```

In PowerShell, set `$env:OLLAMA_SMOKE_TIMEOUT_MS = "180000"` before running
the same Vitest command. The outer timeout remains 30 seconds longer than the
configured runtime budget. The value must be a positive integer in milliseconds
that leaves room for that extra 30 seconds within Node's timer range.
`CORRECTION_SETTLE_TIMEOUT_MS` configures the demo CLI, not this test.

Lines prefixed with `[ollama-smoke]` report:

- `run-started`: the runtime and outer test budgets.
- `stage-started`, `stage-completed`, and `stage-failed`: resource lifecycle
  progress for `factCheck`, `styleReview`, and `rewriteDraft`.
- `elapsedMs`: elapsed time since the run started; `stageElapsedMs`: elapsed
  time since that resource started, including provider and runtime work.
- `run-failed`: the current resource `statuses`, active `pendingStages` with
  their durations, and required `notStartedStages`.
- `run-completed`: all existing smoke-test assertions passed.

For example, if style review is still running after fact-checking finishes,
`pendingStages` identifies `styleReview`, while `notStartedStages` identifies
`rewriteDraft`. A resource status of `pending` alone does not mean execution
has started. These diagnostics omit candidate payloads and rethrow the original
failure; they do not automatically retry or make model execution faster.
A successful smoke test verifies integration completion, not correction quality.

The diagnostic regression tests use a local HTTP fixture and real graph/runtime
execution. They do not require a running Ollama server. Run them with:

```bash
pnpm exec vitest run src/testing/ollamaManualSmokeDiagnostics.test.ts --reporter=verbose
```

Keep CI and normal local verification on the mock provider unless you explicitly
want to test Ollama. PowerShell environment variables persist for the shell
session; after manual testing, clear them before normal verification:

```powershell
Remove-Item Env:OLLAMA_MODEL -ErrorAction SilentlyContinue
Remove-Item Env:OLLAMA_SMOKE_TIMEOUT_MS -ErrorAction SilentlyContinue
```
