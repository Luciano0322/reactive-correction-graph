# Durable LangGraph Session Boundary

This document records the boundary introduced after the headless session SDK.
The goal is to let a LangGraph workflow checkpoint or resume correction state
without storing live signal-kernel objects.

The rule is intentionally plain:

```txt
LangGraph checkpoint state stores serializable facts.
signal-kernel runtime instances are rebuilt, not persisted.
```

Runtime cache behavior is an optimization, not durable truth. A restored
session may rebuild enough local runtime cache to continue selective
recomputation, but the durable checkpoint remains the serialized state, not the
runtime instance.

## Public API

The checkpoint contract is versioned and explicit:

```ts
const checkpoint = createCorrectionGraphCheckpoint(state);
const parsed = parseCorrectionGraphCheckpoint(value);
const session = restoreCorrectionSessionFromCheckpoint(value);
```

The LangGraph session wrapper exposes the same boundary:

```ts
const session = createCorrectionGraphSession();
const state = await session.invoke(input);
const checkpoint = session.checkpoint(state);

const restored = createCorrectionGraphSession({ checkpoint });
const nextState = await restored.invoke(nextInput);
```

`createCorrectionGraphSession({ checkpoint })` creates a fresh runtime-backed
session. It first settles the checkpoint input, then applies the new graph
invoke input. This is what lets a style-only update after restore reuse
fact-check work inside the rebuilt local runtime.

## Durable State

The durable checkpoint may contain plain graph facts:

- draft, user intent, and style guide
- prepared and finalized flags
- claims and correction outputs
- runtime trace and graph trace
- runtime snapshot statuses
- final result and unresolved issues

Do not store promises, functions, signals, effects, AbortController, subscriptions, sessions, or runtime instances in checkpoint state. These values are process-local and cannot be treated as durable graph state.

The parser rejects unsupported schema versions and non-JSON-compatible values.
This keeps accidental live objects from entering future LangGraph checkpoint
storage, artifact bundles, or web session payloads.

## Restore Semantics

Restoring from checkpoint recreates a fresh correction session from the
checkpoint input. Observable output should match the original deterministic
mock result after the restored session settles.

After restore, a second receive still uses selective recomputation inside the
rebuilt runtime. For example, changing only the style guide should rerun
style-review and rewrite work while leaving fact-check work untouched.

In-flight async work from before restore is not resumed. If an old pre-restore
session finishes later, that old work belongs to the old session only and must
not overwrite the restored session result.

## Limitations

This is not yet a production checkpointing claim. The current boundary proves
that serialized graph state can recreate local runtime behavior in deterministic
mock tests. It does not yet prove distributed durability, exactly-once delivery,
cross-process cancellation, long-running provider recovery, or integration with
a production LangGraph checkpointer.

Long-running in-flight work is intentionally treated as non-durable in this
demo. A restored session rebuilds work from serializable input instead of
continuing hidden promises, abort controllers, or resource handles from the old
process.

## Future production LangGraph work

Future production LangGraph work should decide how to:

- connect this contract to a real LangGraph checkpointer
- assign checkpoint IDs and restore policies
- persist provider identity and model configuration
- handle cancellation of old process-local work
- separate durable graph events from local runtime trace events
- define retry and idempotency behavior for provider calls
- document which runtime caches are allowed to be rebuilt after restore

Until those pieces exist, the durable boundary should be described as a local
proof of serializable checkpoint and restore semantics.
