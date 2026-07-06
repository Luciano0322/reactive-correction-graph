import type { Claim } from "../schemas/correction.js";
import { createTraceCollector } from "../trace/createTraceCollector.js";
import type { TraceEvent } from "../trace/types.js";
import {
  corroborateClaim,
  recordCorroborationTrace,
  type ClaimVerifier,
  type CorroborationQuorumPolicy,
  type CorroborationResult,
} from "../verification/corroborateClaim.js";

export type MultiModelCorroborationEvaluationReport = {
  schemaVersion: 1;
  mode: "manual-multi-model-corroboration";
  claim: Claim;
  result: CorroborationResult;
  trace: TraceEvent[];
};

export type RunMultiModelCorroborationEvaluationInput = {
  claim: Claim;
  verifiers: readonly [ClaimVerifier, ClaimVerifier, ...ClaimVerifier[]];
  policy: CorroborationQuorumPolicy;
};

export async function runMultiModelCorroborationEvaluation(
  input: RunMultiModelCorroborationEvaluationInput,
): Promise<MultiModelCorroborationEvaluationReport> {
  const trace = createTraceCollector();
  const result = await corroborateClaim(
    input.claim,
    input.verifiers,
    input.policy,
  );
  recordCorroborationTrace(trace, result);

  return {
    schemaVersion: 1,
    mode: "manual-multi-model-corroboration",
    claim: input.claim,
    result,
    trace: trace.events(),
  };
}

export function serializeMultiModelCorroborationEvaluationReport(
  report: MultiModelCorroborationEvaluationReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
