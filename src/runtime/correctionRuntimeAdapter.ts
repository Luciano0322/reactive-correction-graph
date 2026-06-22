import type { CorrectionRuntimeInput, CorrectionRuntimeOutput } from "../schemas/correction.js";
import type { TraceEvent } from "../trace/types.js";
import {
  createCorrectionRuntime,
  type CorrectionRuntimeOptions,
  type CorrectionRuntimeSnapshot,
} from "./createCorrectionRuntime.js";

export type CorrectionRuntimeAdapterState = CorrectionRuntimeInput &
  Partial<CorrectionRuntimeOutput> & {
    trace: TraceEvent[];
    snapshot: CorrectionRuntimeSnapshot;
  };

export async function invokeCorrectionRuntime(
  input: CorrectionRuntimeInput,
  options?: CorrectionRuntimeOptions,
): Promise<CorrectionRuntimeAdapterState> {
  const runtime = createCorrectionRuntime(options);

  runtime.receive(input);
  await runtime.runUntilSettled();

  return {
    ...input,
    ...runtime.emit(),
    trace: runtime.trace(),
    snapshot: runtime.snapshot(),
  };
}
