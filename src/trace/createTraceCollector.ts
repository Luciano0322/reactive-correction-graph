import type { TraceEvent, TraceEventType, TraceScope } from "./types.js";

type TraceInput = Omit<TraceEvent, "id" | "at"> & {
  id?: string;
  at?: number;
};

export type TraceCollector = {
  record(event: TraceInput): TraceEvent;
  events(): TraceEvent[];
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
  let nextId = 1;

  function record(event: TraceInput): TraceEvent {
    const fullEvent: TraceEvent = {
      id: event.id ?? `trace-${nextId++}`,
      at: event.at ?? Date.now(),
      scope: event.scope,
      type: event.type,
      label: event.label,
      metadata: event.metadata,
    };

    items.push(fullEvent);
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
