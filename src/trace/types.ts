export type TraceScope =
  | "cli"
  | "runtime"
  | "signal"
  | "computed"
  | "resource"
  | "effect";

export type TraceEventType =
  | "started"
  | "completed"
  | "changed"
  | "stale"
  | "pending"
  | "resolved"
  | "rejected"
  | "skipped"
  | "emitted";

export type TraceEvent = {
  id: string;
  at: number;
  scope: TraceScope;
  type: TraceEventType;
  label: string;
  metadata?: Record<string, unknown>;
};
