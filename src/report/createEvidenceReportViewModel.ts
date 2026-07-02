import type { LoadedArtifactBundle } from "../artifacts/loadArtifactBundle.js";
import type {
  RecomputeSavingsOperationName,
  RecomputeSavingsReport,
} from "../comparison/recomputeSavingsReport.js";
import type { CorrectionComparisonReport } from "../comparison/runCorrectionComparison.js";

export type EvidenceReportOperationViewModel = {
  key: RecomputeSavingsOperationName;
  label: string;
  eagerCalls: number;
  reactiveCalls: number;
  avoidedCalls: number | null;
};

export type EvidenceReportScenarioViewModel = {
  key: "style-only" | "claim-changing";
  label: string;
  comparisonStatus: "comparable" | "incomparable";
  outputsMatch: boolean;
  operations: EvidenceReportOperationViewModel[];
};

export type EvidenceReportViewModel = {
  title: "Reactive Correction Evidence Report";
  run: {
    id: string;
    generatedAt: string;
    command: "demo:compare";
    provider: "deterministic-mock";
  };
  scenarios: EvidenceReportScenarioViewModel[];
};

const SCENARIO_LABELS = {
  "style-only": "Style-only update",
  "claim-changing": "Claim-changing update",
} as const;

const OPERATION_LABELS = {
  factCheck: "Fact check",
  styleReview: "Style review",
  rewriteDraft: "Rewrite draft",
} as const;

export function createEvidenceReportViewModel(
  bundle: LoadedArtifactBundle,
): EvidenceReportViewModel {
  const comparison = artifactContent<CorrectionComparisonReport>(
    bundle,
    "comparison",
    "correction-comparison",
  );
  const savings = artifactContent<RecomputeSavingsReport>(
    bundle,
    "savings",
    "recompute-savings",
  );

  return {
    title: "Reactive Correction Evidence Report",
    run: {
      id: bundle.manifest.run.id,
      generatedAt: bundle.manifest.run.generatedAt,
      command: "demo:compare",
      provider: "deterministic-mock",
    },
    scenarios: savings.scenarios.map((scenario) => {
      const comparisonScenario = comparison.scenarios.find(
        (candidate) => candidate.scenario === scenario.scenario,
      );
      if (!comparisonScenario) {
        throw new Error(
          `Comparison artifact is missing scenario: ${scenario.scenario}`,
        );
      }

      return {
        key: scenario.scenario,
        label: SCENARIO_LABELS[scenario.scenario],
        comparisonStatus: scenario.comparisonStatus,
        outputsMatch: comparisonScenario.finalResultsMatch,
        operations: scenario.operations.map((operation) => ({
          key: operation.operation,
          label: OPERATION_LABELS[operation.operation],
          eagerCalls: operation.eagerCalls,
          reactiveCalls: operation.reactiveCalls,
          avoidedCalls: operation.avoidedCalls,
        })),
      };
    }),
  };
}

function artifactContent<T>(
  bundle: LoadedArtifactBundle,
  name: "comparison" | "savings",
  schemaName: string,
): T {
  const artifact = bundle.artifacts[name];
  if (
    !artifact ||
    artifact.mediaType !== "application/json" ||
    artifact.schema?.name !== schemaName ||
    artifact.schema.version !== 1
  ) {
    throw new Error(`Artifact bundle is missing compatible ${name} data`);
  }

  return artifact.content as T;
}
