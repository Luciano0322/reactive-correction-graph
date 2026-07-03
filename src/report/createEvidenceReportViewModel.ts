import type { LoadedArtifactBundle } from "../artifacts/loadArtifactBundle.js";
import type {
  RecomputeSavingsOperationName,
  RecomputeSavingsReport,
} from "../comparison/recomputeSavingsReport.js";
import type { CorrectionComparisonReport } from "../comparison/runCorrectionComparison.js";
import type {
  ReliabilityEvidenceStatus,
  StructuralReliabilityHardGates,
  StructuralReliabilityScorecard,
  StructuralReliabilityVerdict,
} from "../evaluation/structuralReliabilityScorecard.js";
import type { ReceiveExecutionSummaryReport } from "../trace/projectReceiveExecutionSummary.js";

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
  execution: {
    receiveEpoch: number;
    recomputed: string[];
    reused: string[];
    superseded: string[];
    emitted: string[];
  };
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
  reliability: {
    structuralVerdict: StructuralReliabilityVerdict;
    structuralScore: number | null;
    providerCompatibility: "evaluated" | "not-evaluated";
    subjectiveCorrectionQuality: "not-evaluated";
    hardGates: Array<{
      key: keyof StructuralReliabilityHardGates;
      label: string;
      status: ReliabilityEvidenceStatus;
    }>;
  };
  evidenceActivity?: {
    verification:
      | {
          status: "reported-separately";
          policyVersion: 1;
          outcome: "agreement" | "disagreement" | "insufficient-evidence";
          verificationAttempts: number;
          independentModels: number;
        }
      | {
          status: "not-evaluated";
          policyVersion: null;
          outcome: null;
          verificationAttempts: null;
          independentModels: null;
        };
    recomputation:
      | {
          status: "reported-separately";
          recomputationCalls: number;
        }
      | {
          status: "not-evaluated";
          recomputationCalls: null;
        };
  };
  evidenceLimits: string[];
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

const WORK_LABELS: Record<string, string> = {
  ...OPERATION_LABELS,
  finalResult: "Final result",
};

const HARD_GATE_LABELS: Record<keyof StructuralReliabilityHardGates, string> = {
  staleResultProtection: "Stale-result protection",
  finalResultIntegrity: "Final-result integrity",
  sessionIsolation: "Session isolation",
};

const EVIDENCE_LIMITS = [
  "Execution counts cover fixed deterministic scenarios only.",
  "Matching outputs do not prove factual correctness, writing quality, or usefulness.",
  "This report is not a latency, token, cost, or general performance benchmark.",
];

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
  const executionSummary = artifactContent<ReceiveExecutionSummaryReport>(
    bundle,
    "executionSummary",
    "receive-execution-summaries",
  );
  const scorecard = optionalArtifactContent<StructuralReliabilityScorecard>(
    bundle,
    "scorecard",
    "structural-reliability-scorecard",
  );

  return {
    title: "Reactive Correction Evidence Report",
    run: {
      id: bundle.manifest.run.id,
      generatedAt: bundle.manifest.run.generatedAt,
      command: "demo:compare",
      provider: "deterministic-mock",
    },
    reliability: reliabilityViewModel(scorecard),
    ...evidenceActivityViewModel(scorecard),
    evidenceLimits: [...EVIDENCE_LIMITS],
    scenarios: savings.scenarios.map((scenario, index) => {
      const comparisonScenario = comparison.scenarios.find(
        (candidate) => candidate.scenario === scenario.scenario,
      );
      if (!comparisonScenario) {
        throw new Error(
          `Comparison artifact is missing scenario: ${scenario.scenario}`,
        );
      }
      const execution = executionSummary.summaries[index];
      if (!execution) {
        throw new Error(
          `Execution summary is missing scenario: ${scenario.scenario}`,
        );
      }

      return {
        key: scenario.scenario,
        label: SCENARIO_LABELS[scenario.scenario],
        comparisonStatus: scenario.comparisonStatus,
        outputsMatch: comparisonScenario.finalResultsMatch,
        execution: {
          receiveEpoch: execution.receiveEpoch,
          recomputed: workLabels(execution.recomputed),
          reused: workLabels(execution.reused),
          superseded: workLabels(execution.superseded),
          emitted: workLabels(execution.emitted),
        },
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

function evidenceActivityViewModel(
  scorecard: StructuralReliabilityScorecard | null,
): Pick<EvidenceReportViewModel, "evidenceActivity"> {
  const corroboration = scorecard?.corroboration;
  const recomputationCalls =
    scorecard?.executionEfficiency.recomputationCalls;

  if (!corroboration && recomputationCalls === undefined) return {};

  return {
    evidenceActivity: {
      verification: corroboration
        ? {
            status: "reported-separately",
            policyVersion: corroboration.policyVersion,
            outcome: corroboration.outcome,
            verificationAttempts: corroboration.verificationAttempts,
            independentModels: corroboration.independentModels,
          }
        : {
            status: "not-evaluated",
            policyVersion: null,
            outcome: null,
            verificationAttempts: null,
            independentModels: null,
          },
      recomputation:
        recomputationCalls === undefined
          ? {
              status: "not-evaluated",
              recomputationCalls: null,
            }
          : {
              status: "reported-separately",
              recomputationCalls,
            },
    },
  };
}

function artifactContent<T>(
  bundle: LoadedArtifactBundle,
  name: "comparison" | "savings" | "executionSummary",
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

function workLabels(labels: string[]): string[] {
  return labels.map((label) => WORK_LABELS[label] ?? label);
}

function optionalArtifactContent<T>(
  bundle: LoadedArtifactBundle,
  name: "scorecard",
  schemaName: string,
): T | null {
  const artifact = bundle.artifacts[name];
  if (!artifact) return null;

  if (
    artifact.mediaType !== "application/json" ||
    artifact.schema?.name !== schemaName ||
    artifact.schema.version !== 1
  ) {
    throw new Error(`Artifact bundle contains incompatible ${name} data`);
  }

  return artifact.content as T;
}

function reliabilityViewModel(
  scorecard: StructuralReliabilityScorecard | null,
): EvidenceReportViewModel["reliability"] {
  if (scorecard) {
    return {
      structuralVerdict: scorecard.structuralReliability.verdict,
      structuralScore: scorecard.structuralReliability.score,
      providerCompatibility: scorecard.providerCompatibility.status,
      subjectiveCorrectionQuality: scorecard.subjectiveCorrectionQuality,
      hardGates: hardGateViewModels(
        scorecard.structuralReliability.hardGates,
      ),
    };
  }

  return {
    structuralVerdict: "insufficient-evidence",
    structuralScore: null,
    providerCompatibility: "not-evaluated",
    subjectiveCorrectionQuality: "not-evaluated",
    hardGates: hardGateViewModels({
      staleResultProtection: "not-evaluated",
      finalResultIntegrity: "not-evaluated",
      sessionIsolation: "not-evaluated",
    }),
  };
}

function hardGateViewModels(hardGates: StructuralReliabilityHardGates) {
  return (Object.keys(HARD_GATE_LABELS) as Array<keyof typeof HARD_GATE_LABELS>).map(
    (key) => ({
      key,
      label: HARD_GATE_LABELS[key],
      status: hardGates[key],
    }),
  );
}
