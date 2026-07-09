# Headless Correction Session SDK

The headless session SDK is the shared boundary for every local integration
that wants to run the correction runtime. CLI commands, the local web demo, and
future LangGraph nodes should depend on `createCorrectionSession` instead of
creating runtime orchestration by themselves.

The public session contract is intentionally small:

```ts
session.receive(input)
session.runUntilSettled()
session.emit()
session.snapshot()
session.subscribe(listener)
session.reset()
session.dispose()
```

The SDK must not import HTTP, DOM, React, Vue, or CLI argument parsing. It owns
runtime session lifecycle only: receive input, settle async work, emit the
current correction state, expose live trace events, reset the runtime, and close
resources deterministically.

Provider and model selection stay outside the SDK. Callers pass the chosen
model or provider-specific options into `createCorrectionSession`, which keeps
the SDK local-first, mock-first, and safe for tests.

## CLI integration

The CLI owns command-line parsing, input file loading, provider selection,
output directory selection, and artifact writing. After those shell concerns
are resolved, the CLI should call the SDK:

```ts
const session = createCorrectionSession({ model, traceCollector });
session.receive(input);
await session.runUntilSettled();
const state = session.emit();
const snapshot = session.snapshot();
```

The CLI can then serialize `result.md`, `state.json`, `trace.json`, and
`manifest.json`. It should not reach into signal-kernel runtime internals or
reimplement receive, settle, emit, trace, reset, or dispose behavior.

## Web integration

The local web server owns HTTP routing, request validation, response shaping,
server-sent events, and session IDs. Each live web session should hold one
headless session instance and forward API calls to it:

```ts
session.receive(input);
await session.runUntilSettled();
return session.emit();
```

For live developer feedback, the web layer may call
`session.subscribe(listener)` and expose the events through SSE. Subscription is
optional and must not change settled runtime behavior. Reset and delete routes
should map to `session.reset()` and `session.dispose()`.

The browser UI should receive view models and inspector data from the web layer.
It should not depend on signal objects, computed nodes, async resource handles,
or framework-specific adapters.

## LangGraph integration

LangGraph owns workflow orchestration: graph state, edges, node scheduling,
checkpointing, and resume policy. A LangGraph correction node should treat the
headless session as a node-local execution engine.

LangGraph state must stay serializable. Do not store live signal objects,
computed nodes, resource handles, abort controllers, subscriptions, or session
instances in checkpointed graph state. Store plain input/output/snapshot data
instead, and recreate a session when a node needs to run.

The intended dependency direction is:

```txt
LangGraph node
  -> createCorrectionSession()
    -> signal-kernel correction runtime
```

This keeps LangGraph responsible for durable orchestration and keeps
signal-kernel responsible for fine-grained reactive invalidation inside one
correction node.

### Durable LangGraph checkpoints

The session SDK is the local execution boundary. Durable graph state has a
stricter contract: it must contain serializable facts, not live runtime
objects. See [Durable LangGraph Session Boundary](./durable-langgraph-session.md)
(`docs/durable-langgraph-session.md`) for
`createCorrectionGraphSession({ checkpoint })`, checkpoint validation, restore
limits, and future production work.

## Artifact helpers

When an integration needs portable output, it can serialize `session.snapshot()`
or pass that snapshot into the SDK artifact helper. Artifact bundles should
contain plain files and versioned references only. They should not contain live
runtime instances, event streams, HTTP connections, or framework state.
