# RFC: `@signal-kernel/loop-runtime`

- Status: Proposed
- Date: 2026-07-20
- Target release: experimental `0.1.0`
- Validation repository: `reactive-correction-graph`

## Summary

Create a framework-neutral, domain-neutral package named
`@signal-kernel/loop-runtime`. It will provide a reusable lifecycle container
around signal-kernel primitives for reactive workflows that combine computed
state, asynchronous resources, effects, invalidation, and repeated settlement.

The package will not be a LangGraph extension, agent coordinator, correction
engine, rendering runtime, or durable workflow platform. LangGraph and
multi-agent coordination remain consumers of the runtime rather than concepts
owned by it.

The package should be created only after the current repository completes the
multi-agent and snapshot extraction gates in Tasks 49-52.

## Context

`@signal-kernel/core` and `@signal-kernel/async-runtime` provide the reactive
primitives used by the correction proof of concept. The application still owns
repeated execution mechanics that are useful outside the correction domain:

- receive epochs and batched input updates
- fixed-point settlement across computed work, effects, and async resources
- latest-epoch stale-result containment
- cancellation and timeout handling
- stable output emission
- trace collection and live subscriptions
- snapshot, restore, and recomputation after restore

Those mechanics currently live beside correction concepts such as drafts,
claims, fact checks, style reviews, correction plans, and rewrites. Publishing
the current project as a generic package would therefore expose a domain model
as if it were a reusable runtime abstraction.

The multi-agent POC provides the next validation pressure: each agent should own
an independent runtime, exchange serialized messages, and restore only its own
runtime type from snapshots. If the same execution lifecycle works for these
independent runtimes without learning agent semantics, it is a viable package
boundary.

## Decision Summary

The current proposal records these agreed decisions:

1. The package is a pure execution runtime, not an agent or correction runtime.
2. It is usable without LangGraph in a single process as a headless embedded
   workflow runtime.
3. It is a lifecycle container over existing signal-kernel primitives, not a
   new reactive graph DSL.
4. `receive(input)` accepts an opaque generic value. Merge, patch, reducer, and
   event semantics belong to the loop definition.
5. `emit()` returns a complete settled output. Pending inspection uses a
   separate API.
6. Settlement means the latest receive epoch has reached a reactive fixed
   point, not merely that currently observed promises have completed.
7. A new receive supersedes stale async output from older epochs. Hosts that
   require FIFO completion must queue above the runtime.
8. Automatic retry is not part of v1.
9. Trace events are a versioned JSON-compatible public contract.
10. Snapshot and restore are required lifecycle capabilities; persistence is
    not.
11. Pending work itself is not serialized. Restore recomputes work that did not
    produce a reusable settled value.
12. Snapshot restore is valid only for a compatible loop type and schema. It is
    not a cross-agent state-sharing protocol.
13. The package is isomorphic and ESM-only, with no Node, DOM, UI framework,
    LangGraph, or correction dependencies.
14. Rendering is an explicit non-goal. The package is SSR-safe but does not own
    rendering or DOM hydration.
15. The first release does not include a multi-agent coordinator or LangGraph
    adapter package.

## Goals

- Make signal-kernel async workflow settlement reusable across domains.
- Preserve selective recomputation when inputs change incrementally.
- Give callers a small, typed lifecycle contract.
- Make stale, reused, recomputed, restored, superseded, and emitted work
  observable.
- Support same-runtime-type continuity through serializable snapshots.
- Work in modern browsers, Node ESM, SSR processes, and worker-like runtimes.
- Allow orchestration frameworks, CLIs, servers, and coordinators to embed the
  runtime without framework-specific bindings.
- Keep the public surface small enough to change during experimental `0.x`
  releases.

## Non-Goals

- Correction-specific claims, fact checks, style reviews, or rewrite logic.
- Agent identities, roles, routing, handoff, or team formation.
- Shared mutable state between live runtime instances.
- LangGraph graph construction, checkpoint storage, or state annotations.
- LangSmith or OpenTelemetry exporters.
- HTTP, database, filesystem, queue, or object-storage persistence.
- Distributed durability, exactly-once delivery, or distributed cancellation.
- Automatic provider retries, fallback models, or idempotency policy.
- React, Vue, DOM, SSR rendering, suspense, or hydration reconciliation.
- A latency, token, cost, provider-quality, or factual-correctness benchmark.

## Proposed Layering

```txt
@signal-kernel/core
        |
@signal-kernel/async-runtime
        |
@signal-kernel/snapshot
        |
@signal-kernel/loop-runtime
        |
application loop definitions
        |
optional hosts: CLI, HTTP, LangGraph, coordinator, UI inspector
```

The exact dependency direction between `async-runtime`, `snapshot`, and
`loop-runtime` must be checked against their real public APIs before extraction.
The architecture rule is more important than the diagram: loop-runtime may
depend on signal-kernel family contracts, while those lower-level packages must
not depend on loop-runtime or application domains.

## Repository And Package Boundaries

Preferred workspace shape:

```txt
signal-kernel/
  packages/
    core/
    async-runtime/
    snapshot/
    loop-runtime/

reactive-correction-graph/
  correction loop definition
  multi-agent POC
  LangGraph reference integration
  deterministic evidence and regression fixtures
```

`reactive-correction-graph` remains an external integration and reference
application. Its correction runtime should eventually consume the package
through public exports. It should not become the source repository for the npm
package.

The first release is one new package, not a family of new packages. A future
`@signal-kernel/langgraph-adapter`, `@signal-kernel/agent-coordinator`, or
rendering package requires separate evidence and a separate RFC.

## Dependency Policy

The initial recommendation is to expose compatible signal-kernel packages as
peer dependencies and install the same versions as development dependencies in
the workspace:

```json
{
  "peerDependencies": {
    "@signal-kernel/core": "<compatible-range>",
    "@signal-kernel/async-runtime": "<compatible-range>",
    "@signal-kernel/snapshot": "<compatible-range>"
  }
}
```

The final ranges remain open until a duplicate-package test proves which
packages must share one reactive tracking instance. The package must not list
`@langchain/langgraph` or `@langchain/core` as dependencies or peers.

## Proposed Public Surface

The names below describe the intended shape but are not frozen APIs:

```ts
export {
  defineLoop,
  createLoopRuntime,
} from "@signal-kernel/loop-runtime";

export type {
  LoopDefinition,
  LoopContext,
  LoopRuntime,
  LoopInspection,
  LoopSnapshot,
  LoopTraceEvent,
  LoopRuntimeError,
} from "@signal-kernel/loop-runtime";
```

Conceptual lifecycle:

```ts
const definition = defineLoop<Input, Output, SnapshotState>((context) => {
  // Use @signal-kernel/core primitives directly.
  // Register async resources and effects through the lifecycle context.
  return {
    receive(input) {
      // The definition decides whether input replaces, merges, or reduces.
    },
    readOutput() {
      // Return the latest complete output when the graph is stable.
    },
    snapshotState() {
      // Return loop-owned serializable state.
    },
  };
});

const runtime = createLoopRuntime(definition, options);
runtime.receive(input);
await runtime.runUntilSettled();
const output = runtime.emit();
const snapshot = runtime.snapshot();
```

Conceptual runtime contract:

```ts
type LoopRuntime<Input, Output, SnapshotState> = {
  receive(input: Input): void;
  runUntilSettled(): Promise<void>;
  emit(): Output;
  inspect(): LoopInspection<Output>;
  snapshot(): LoopSnapshot<SnapshotState>;
  trace(): readonly LoopTraceEvent[];
  subscribe(listener: (event: LoopTraceEvent) => void): () => void;
  dispose(): void;
};
```

`emit()` must reject before a successful settlement. `inspect()` may expose the
runtime status and last stable output without presenting it as a new agent or
workflow result.

The exact `LoopContext.resource()` and effect-registration APIs are deliberately
unresolved. They must be designed from the real correction and multi-agent
graphs rather than inferred from one implementation.

## Settlement Semantics

`runUntilSettled()` waits for the latest receive epoch to reach a fixed point:

```txt
Phase A: drain stale computed work.
Phase B: run ready effects.
If effects generate work, return to Phase A.
Wait for latest-epoch async resources.
Repeat until no computed, effect, or resource work can change the output.
Require one stable output for the latest epoch.
```

Settlement rejects with a typed error when a resource fails, a timeout expires,
the maximum flush-cycle guard is exceeded, or the runtime is disposed.

Calling `receive()` during settlement creates a newer epoch. The current
settlement promise follows the newest epoch. Older async work is cancelled when
possible and always prevented from committing stale output.

The runtime does not provide a FIFO job queue. Hosts can serialize calls when
every command must complete independently.

## Error And Retry Semantics

V1 records and propagates failures but does not retry automatically. Provider
retry, fallback, backoff, and idempotency belong to the host or a future explicit
resource policy.

Restore-triggered recomputation is not reported as a normal retry. The trace
must make the cause observable.

## Snapshot And Restore Semantics

`@signal-kernel/snapshot` must be exercised in the validation POC before the
package API is finalized. The intended semantics are:

- snapshots are versioned and JSON-compatible
- snapshots identify their loop type and schema version
- settled reusable values may be restored
- pending promises, abort controllers, connections, timers, and resource
  handles are not serialized
- work that was pending or omitted is recomputed by the restored runtime
- pre-restore late results cannot mutate or emit from the restored runtime
- two restores from the same snapshot produce isolated runtime instances
- incompatible loop identities or schema versions fail clearly

Snapshot is a continuity mechanism, not live state sharing. A snapshot may
bootstrap, migrate, clone, or recover a compatible runtime. Different agent
roles communicate through messages, not by hydrating each other's snapshots.

Persistence remains a host concern. A host may place the snapshot in memory,
files, a database, object storage, or LangGraph checkpoint state without moving
the live runtime object outside its process.

## Trace Contract

Trace is a versioned public API, not an internal log format. The minimum event
envelope should include stable identity, ordering, epoch, scope, type, label,
and JSON-compatible metadata.

Candidate event types include:

```txt
started
completed
changed
stale
pending
resolved
rejected
cancelled
reused
restored
recomputed
superseded
emitted
```

The final taxonomy should avoid duplicate meanings and must be validated by the
snapshot and multi-agent tests. Domain labels and exporter-specific fields stay
in metadata or adapters.

The runtime exposes both an immutable trace snapshot and live subscription. It
does not own trace persistence, LangSmith, OpenTelemetry, or a dashboard.

## Multi-Agent Validation Model

The POC uses two roles:

```txt
FactCheck Agent
  owns one private runtime and snapshot

Writer Agent
  owns one private runtime and snapshot

Coordinator
  owns routing, lifecycle, correlation, and causal versions
```

Live communication uses versioned JSON-serializable envelopes. Runtime
instances, signals, promises, subscriptions, callbacks, and abort controllers
never cross the agent boundary.

The coordinator is application code during the POC. It is not included in
loop-runtime and should not become a package until another interaction model
validates the abstraction.

## LangGraph Integration

Loop Runtime must work without LangGraph. The current reference repository may
continue to demonstrate this optional outer boundary:

```txt
LangGraph node
  -> receive graph state into an owned runtime
  -> run until settled
  -> emit a serializable graph update
```

LangGraph remains responsible for graph topology, threads, interrupts,
checkpoint orchestration, and any production durability policy. Loop Runtime
owns process-local reactive execution inside the node or agent boundary.

No LangGraph adapter package is planned for the first release. An adapter is
justified only after at least two domains share a meaningful generic contract
that is more valuable than a small example.

## Rendering And SSR Boundary

The package is SSR-safe, not an SSR renderer. Its snapshots may cross a
server/client transport boundary and hydrate a compatible runtime, but it does
not schedule rendering, reconcile DOM state, own suspense, or bind to React or
Vue.

A future rendering runtime is only an architectural possibility. It is not a
committed roadmap item in this RFC.

## Extraction Gates

Do not create the publishable package until the current repository proves:

1. One FactCheck Agent and one Writer Agent own separate runtimes.
2. Agents exchange only versioned serialized envelopes.
3. At least one agent uses the real `@signal-kernel/snapshot` package.
4. Restored settled state is reusable.
5. Omitted pending work recomputes after restore.
6. A pre-restore late result cannot overwrite restored state.
7. Trace distinguishes restored, reused, recomputed, and superseded work.
8. Two restored sessions remain isolated.
9. The POC runs deterministically without LangGraph, network, database, or UI.
10. The correction reference comparison and savings artifacts remain valid.

Tasks 49-51 prove the multi-agent contracts, vertical slice, and recovery
behavior. Task 52 performs the extraction readiness audit before a package repo
is created.

## Extraction Plan

1. Complete Tasks 49-51 in `reactive-correction-graph`.
2. Complete Task 52 and update this RFC with evidence and unresolved decisions.
3. Create `packages/loop-runtime` in the signal-kernel workspace.
4. Port behavior tests before moving implementation mechanics.
5. Implement the smallest generic lifecycle that passes those tests.
6. Convert the correction runtime into a loop definition that consumes the
   package through public exports.
7. Remove duplicated local settlement, epoch, trace, and restore mechanics.
8. Rerun reference comparison, savings, snapshot, browser, and multi-agent
   tests.
9. Publish experimental `0.1.0` only after all release gates pass.

The extraction is contract-driven. `createCorrectionRuntime.ts` should not be
copied wholesale into the new package.

## Experimental `0.1.0` Release Gates

- fixed-point settlement tests pass
- latest-epoch stale-result containment tests pass
- settled-only `emit()` tests pass
- snapshot restore and omitted-pending-work recomputation tests pass
- restore trace and restored-session isolation tests pass
- browser and Node ESM smoke tests pass
- correction reference comparison and savings results remain unchanged
- package dependency and import guards reject LangGraph, Node, DOM, UI,
  coordinator, and correction dependencies
- public examples import package exports only, without deep source imports
- package limitations and experimental status are documented

## Alternatives Rejected

### Publish `reactive-correction-graph` as the generic package

Rejected because its runtime and schema are correction-specific. It remains the
reference consumer.

### Build a new reactive graph DSL

Rejected because signal-kernel already provides the primitives. Loop Runtime
should add lifecycle and settlement, not competing syntax.

### Put agent coordination into Loop Runtime

Rejected because agent identity, routing, messages, and retry policy are host
concerns and have only one current domain example.

### Make LangGraph a required dependency

Rejected because the runtime must be independently useful and framework
neutral.

### Serialize in-flight promises and side effects

Rejected because these values are not portable or safely resumable. Restore
recomputes omitted work instead.

### Add rendering support now

Rejected because rendering has different ownership and performance contracts
and would pull the package into framework-specific concerns.

## Risks

- A lifecycle context may accidentally become a second graph DSL.
- A generic API inferred from one domain may retain hidden correction
  assumptions.
- Trace compatibility can become expensive if too many event types are frozen
  early.
- Snapshot integration may expose stronger coupling between signal-kernel
  package versions than expected.
- Latest-epoch semantics may surprise event-oriented consumers unless FIFO is
  documented as a host responsibility.
- Recomputed provider calls after restore can duplicate external side effects.
- Peer dependency ranges may create installation friction during early `0.x`
  development.

These risks are why the proposal requires multi-agent, restore, and external
consumer validation before package extraction.

## Open Questions

- What is the smallest useful `LoopContext` resource registration contract?
- How should effects report newly generated work to the settlement loop?
- Which snapshot API from `@signal-kernel/snapshot` should loop-runtime expose,
  wrap, or consume directly?
- Which signal-kernel packages require singleton peer resolution?
- What trace event taxonomy is stable enough for `0.1.0`?
- How are loop type identity and snapshot migrations registered?
- Should clocks and ID factories be required injections or testing-only hooks?
- Does the first release need a `/testing` subpath?
- What disposal guarantees are required for pending async resources?

Task 52 must either resolve these questions or explicitly defer them with a
testable limitation before package implementation begins.

## Outcome If Accepted

The signal-kernel ecosystem gains one focused package:

```txt
@signal-kernel/loop-runtime
```

It provides process-local reactive workflow execution and continuity without
owning application domains or orchestration frameworks. The correction project
remains the evidence-producing reference consumer, while multi-agent and
LangGraph scenarios validate the boundary from outside the package.
