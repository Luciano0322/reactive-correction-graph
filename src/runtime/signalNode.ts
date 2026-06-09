import type { TraceEvent } from "../trace/types.js";

export type SignalNode<InputState, OutputState> = {
  receive(state: InputState): void;
  runUntilSettled(): Promise<void>;
  emit(): Partial<OutputState>;
  trace(): TraceEvent[];
};
