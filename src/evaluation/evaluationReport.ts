export type EvaluationTrialStatus = "settled" | "rejected";

export type EvaluationTrialResult = {
  fixture: string;
  model: string;
  trial: number;
  status: EvaluationTrialStatus;
  durationMs: number;
  extractedClaimCount: number;
  factCheckCoverageCount: number;
  normalizedMissingCount: number;
  ignoredUnknownCount: number;
  unresolvedIssueCount: number;
  error: string | null;
};

export type EvaluationSummary = {
  totalTrials: number;
  settledTrials: number;
  rejectedTrials: number;
  fullCoverageTrials: number;
  trialsWithNormalizedMissing: number;
  trialsWithIgnoredUnknown: number;
  subjectiveCorrectionQuality: "not-evaluated";
};

export type LocalLlmEvaluationReport = {
  schemaVersion: 1;
  provider: "ollama";
  summary: EvaluationSummary;
  trials: EvaluationTrialResult[];
};

export function serializeEvaluationReport(
  report: LocalLlmEvaluationReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function summarizeEvaluationTrials(
  trials: EvaluationTrialResult[],
): EvaluationSummary {
  return {
    totalTrials: trials.length,
    settledTrials: trials.filter((trial) => trial.status === "settled").length,
    rejectedTrials: trials.filter((trial) => trial.status === "rejected").length,
    fullCoverageTrials: trials.filter(
      (trial) =>
        trial.status === "settled" &&
        trial.factCheckCoverageCount === trial.extractedClaimCount,
    ).length,
    trialsWithNormalizedMissing: trials.filter(
      (trial) => trial.normalizedMissingCount > 0,
    ).length,
    trialsWithIgnoredUnknown: trials.filter(
      (trial) => trial.ignoredUnknownCount > 0,
    ).length,
    subjectiveCorrectionQuality: "not-evaluated",
  };
}
