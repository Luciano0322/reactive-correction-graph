import type { ReceiveExecutionSummary } from "../trace/projectReceiveExecutionSummary.js";
import type {
  ComparisonExecution,
  CorrectionComparisonBaseline,
  CorrectionComparisonReport,
  CorrectionComparisonScenario,
} from "./runCorrectionComparison.js";

export type RecomputeSavingsOperationName =
  | "factCheck"
  | "styleReview"
  | "rewriteDraft";

export type RecomputeSavingsOperation = {
  operation: RecomputeSavingsOperationName;
  eagerCalls: number;
  reactiveCalls: number;
  avoidedCalls: number | null;
  reusedReceives: number;
  supersededCalls: number;
};

export type RecomputeSavingsOperationInput = Omit<
  RecomputeSavingsOperation,
  "avoidedCalls"
>;

export type RecomputeSavingsEvidence = Pick<
  RecomputeSavingsOperation,
  "reusedReceives" | "supersededCalls"
>;

export type RecomputeSavingsScenario = {
  scenario: "style-only" | "claim-changing";
  comparisonStatus: "comparable" | "incomparable";
  incomparableReason: string | null;
  operations: RecomputeSavingsOperation[];
};

export type RecomputeSavingsReport = {
  schemaVersion: 1;
  provider: "deterministic-mock";
  scenarios: RecomputeSavingsScenario[];
};

export type RecomputeSavingsExecutionSummaries = Record<
  CorrectionComparisonScenario["scenario"],
  ReceiveExecutionSummary
>;

const OPERATION_COUNT_KEYS = [
  ["factCheck", "factCheckCalls"],
  ["styleReview", "styleReviewCalls"],
  ["rewriteDraft", "rewriteDraftCalls"],
] as const satisfies ReadonlyArray<
  readonly [RecomputeSavingsOperationName, keyof ComparisonExecution]
>;

export function calculateRecomputeSavingsOperation(
  input: RecomputeSavingsOperationInput,
): RecomputeSavingsOperation {
  return {
    ...input,
    avoidedCalls: input.eagerCalls - input.reactiveCalls,
  };
}

export function summarizeRecomputeSavingsEvidence(
  summaries: ReceiveExecutionSummary[],
  operation: RecomputeSavingsOperationName,
): RecomputeSavingsEvidence {
  return {
    reusedReceives: summaries.filter((summary) =>
      summary.reused.includes(operation),
    ).length,
    supersededCalls: summaries.filter((summary) =>
      summary.superseded.includes(operation),
    ).length,
  };
}

export function createRecomputeSavingsReport(
  comparison: CorrectionComparisonReport,
  baseline: CorrectionComparisonBaseline,
  executionSummaries: RecomputeSavingsExecutionSummaries,
): RecomputeSavingsReport {
  let previous = baseline;

  return {
    schemaVersion: 1,
    provider: comparison.provider,
    scenarios: comparison.scenarios.map((scenario) => {
      const summary = executionSummaries[scenario.scenario];
      const operations = OPERATION_COUNT_KEYS.map(([operation, countKey]) =>
        calculateRecomputeSavingsOperation({
          operation,
          eagerCalls: scenario.eager[countKey] - previous.eager[countKey],
          reactiveCalls:
            scenario.reactive[countKey] - previous.reactive[countKey],
          ...summarizeRecomputeSavingsEvidence([summary], operation),
        }),
      );

      previous = scenario;

      return {
        scenario: scenario.scenario,
        comparisonStatus: "comparable",
        incomparableReason: null,
        operations,
      };
    }),
  };
}

export function serializeRecomputeSavingsReport(
  report: RecomputeSavingsReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
