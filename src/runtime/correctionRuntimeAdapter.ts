import type { CorrectionRuntimeInput, CorrectionRuntimeOutput } from "../schemas/correction.js";
import type { TraceEvent } from "../trace/types.js";
import {
  createCorrectionRuntime,
  type CorrectionRuntime,
  type CorrectionRuntimeOptions,
  type CorrectionRuntimeSnapshot,
} from "./createCorrectionRuntime.js";

export type CorrectionRuntimeAdapterState = CorrectionRuntimeInput &
  Partial<CorrectionRuntimeOutput> & {
    trace: TraceEvent[];
    snapshot: CorrectionRuntimeSnapshot;
  };

export type CorrectionRuntimeAdapterOptions = CorrectionRuntimeOptions & {
  runtime?: CorrectionRuntime;
};

export async function invokeCorrectionRuntime(
  input: CorrectionRuntimeInput,
  options: CorrectionRuntimeAdapterOptions = {},
): Promise<CorrectionRuntimeAdapterState> {
  const { runtime: existingRuntime, ...runtimeOptions } = options;
  const runtime = existingRuntime ?? createCorrectionRuntime(runtimeOptions);

  runtime.receive(input);
  await runtime.runUntilSettled();

  return {
    ...input,
    ...runtime.emit(),
    trace: runtime.trace(),
    snapshot: runtime.snapshot(),
  };
}
