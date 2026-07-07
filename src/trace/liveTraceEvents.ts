import type { TraceEvent } from "./types.js";

export type LiveTraceEvent = {
  schemaVersion: 1;
  sequence: number;
  event: TraceEvent;
};

export type LiveTraceEventListener = (event: LiveTraceEvent) => void;

export type LiveTraceEventSubscription = () => void;

export type LiveTraceEventSource = {
  subscribe(listener: LiveTraceEventListener): LiveTraceEventSubscription;
};
