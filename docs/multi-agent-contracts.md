# Multi-Agent Contract Boundary

Task 49 defines the language and ownership rules required before the project
implements live multi-agent coordination. It does not turn the existing
correction branches into autonomous agents.

Current factCheck, styleReview, and rewriteDraft branches are not isolated agents.
They are operations inside one correction runtime. An isolated agent has its
own identity, session lifecycle, private runtime state, and serialized message
boundary.

## Roles

- FactCheck Agent owns claim verification and evidence output.
- Writer Agent owns style-aware revision from the draft plus accepted evidence.
- Coordinator owns routing and lifecycle. Task 49 defines this responsibility,
  while Task 50 will implement the first routing behavior.

Each agent owns one private session and runtime state. The coordinator may hold
and dispose those sessions, but it does not expose one agent's live signals,
promises, subscriptions, or runtime object to another agent.

```txt
Coordinator boundary
  |-- FactCheck Agent session
  |     `-- private runtime state
  `-- Writer Agent session
        `-- private runtime state
```

Creating another coordinator boundary creates another pair of sessions.
Mutating or disposing one coordinator's sessions does not affect the other
coordinator.

## Framework-neutral public boundary

The package root exports the initial contracts:

- `AgentIdentity` names the fixed FactCheck and Writer roles.
- `AgentMessageEnvelope` carries identity, message, correlation, causation, and
  input-version data.
- `AgentResult` represents completed, failed, and stale outcomes.
- `parseAgentMessageEnvelope` validates serialized input and rejects malformed,
  unknown-recipient, role-mismatch, and stale-version messages.
- `AgentSessionBoundary` is the minimum private-session lifecycle owned by a
  coordinator.
- `createAgentCoordinatorBoundary` creates and owns one session for each role.

Versioned JSON-serializable envelopes are the only planned live communication
boundary between agents. Runtime instances, signals, callbacks, promises,
subscriptions, and abort controllers never cross that boundary.

The contracts depend on TypeScript and local data only. They do not depend on
LangGraph state, HTTP, DOM APIs, UI frameworks, databases, or model providers.

## Causality and diagnostics

Every envelope includes:

- `schemaVersion`
- `messageId`
- `correlationId`
- `causationId`
- `inputVersion`
- `sender`
- `recipient`
- `messageType`
- JSON-compatible `payload`

The parser accepts an optional current input version. An older incoming version
is rejected as stale before coordination code can mutate agent state. Unknown
agents and malformed envelopes also fail with deterministic diagnostics.

## Explicit non-goals

Task 49 does not implement or claim:

- Autonomous planning
- Dynamic team formation
- Tool selection
- Shared mutable runtime state
- LangGraph-specific coordinator
- React or Vue integration
- Real LLM quality improvement
- message routing or reactive invalidation between the two agents
- snapshot persistence or process recovery
- distributed delivery, retries, or exactly-once execution

Task 50 is responsible for the first deterministic two-agent vertical slice.
Task 51 will evaluate snapshot and restore at the owned agent-runtime boundary.
