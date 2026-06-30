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

The manual Ollama smoke test is skipped unless `OLLAMA_MODEL` is set.

```bash
$env:OLLAMA_MODEL = "qwen3:4b"
pnpm test
```

On non-Windows shells:

```bash
OLLAMA_MODEL=qwen3:4b pnpm test
```

Keep CI and normal local verification on the mock provider unless you explicitly want to test Ollama.
