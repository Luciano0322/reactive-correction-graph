import type { TraceEvent, TraceEventType, TraceScope } from "./types.js";
import type {
  LiveTraceEvent,
  LiveTraceEventListener,
  LiveTraceEventSubscription,
} from "./liveTraceEvents.js";

type TraceInput = Omit<TraceEvent, "id" | "at"> & {
  id?: string;
  at?: number;
};

export type TraceCollector = {
  record(event: TraceInput): TraceEvent;
  events(): TraceEvent[];
  subscribe(listener: LiveTraceEventListener): LiveTraceEventSubscription;
  started(scope: TraceScope, label: string, metadata?: Record<string, unknown>): TraceEvent;
  completed(scope: TraceScope, label: string, metadata?: Record<string, unknown>): TraceEvent;
  changed(scope: TraceScope, label: string, metadata?: Record<string, unknown>): TraceEvent;
  stale(scope: TraceScope, label: string, metadata?: Record<string, unknown>): TraceEvent;
  pending(scope: TraceScope, label: string, metadata?: Record<string, unknown>): TraceEvent;
  resolved(scope: TraceScope, label: string, metadata?: Record<string, unknown>): TraceEvent;
  rejected(scope: TraceScope, label: string, metadata?: Record<string, unknown>): TraceEvent;
  skipped(scope: TraceScope, label: string, metadata?: Record<string, unknown>): TraceEvent;
  emitted(scope: TraceScope, label: string, metadata?: Record<string, unknown>): TraceEvent;
};

export function createTraceCollector(): TraceCollector {
  const items: TraceEvent[] = [];
  const listeners = new Set<LiveTraceEventListener>();
  let nextId = 1;
  let nextSequence = 1;

  function record(event: TraceInput): TraceEvent {
    const fullEvent: TraceEvent = {
      id: event.id ?? `trace-${nextId++}`,
      at: event.at ?? Date.now(),
      scope: event.scope,
      type: event.type,
      label: event.label,
      ...(event.metadata === undefined ? {} : { metadata: event.metadata }),
    };

    items.push(fullEvent);
    const liveEvent: LiveTraceEvent = {
      schemaVersion: 1,
      sequence: nextSequence++,
      event: cloneTraceEvent(fullEvent),
    };
    for (const listener of listeners) {
      listener({
        schemaVersion: liveEvent.schemaVersion,
        sequence: liveEvent.sequence,
        event: cloneTraceEvent(liveEvent.event),
      });
    }
    return fullEvent;
  }

  function recordType(type: TraceEventType) {
    return (
      scope: TraceScope,
      label: string,
      metadata?: Record<string, unknown>,
    ) => record({ scope, type, label, metadata });
  }

  return {
    record,
    events: () => [...items],
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    started: recordType("started"),
    completed: recordType("completed"),
    changed: recordType("changed"),
    stale: recordType("stale"),
    pending: recordType("pending"),
    resolved: recordType("resolved"),
    rejected: recordType("rejected"),
    skipped: recordType("skipped"),
    emitted: recordType("emitted"),
  };
}

function cloneTraceEvent(event: TraceEvent): TraceEvent {
  return {
    id: event.id,
    at: event.at,
    scope: event.scope,
    type: event.type,
    label: event.label,
    ...(event.metadata === undefined
      ? {}
      : { metadata: cloneMetadata(event.metadata) }),
  };
}

function cloneMetadata(metadata: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
}
