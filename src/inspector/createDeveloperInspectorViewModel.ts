import type {
  ArtifactBundleArtifacts,
  ArtifactReference,
} from "../artifacts/artifactBundleManifest.js";
import type { LoadedArtifactBundle } from "../artifacts/loadArtifactBundle.js";
import { renderResultMarkdown } from "../cli/renderResultMarkdown.js";
import type { StructuralReliabilityScorecard } from "../evaluation/structuralReliabilityScorecard.js";
import type {
  Claim,
  CorrectionRuntimeInput,
  CorrectionRuntimeOutput,
} from "../schemas/correction.js";
import {
  projectReceiveExecutionSummary,
  type ReceiveExecutionSummary,
  type ReceiveExecutionSummaryReport,
} from "../trace/projectReceiveExecutionSummary.js";
import type { TraceEvent } from "../trace/types.js";

type ArtifactKey = keyof ArtifactBundleArtifacts;

export type DeveloperInspectorArtifactViewModel = {
  key: ArtifactKey;
  label: string;
  status: "available" | "missing";
  path: string | null;
  schema: string | null;
};

export type DeveloperInspectorWarning = {
  code: "artifact-missing";
  artifact: ArtifactKey;
  message: string;
};

export type DeveloperInspectorReceiveExecutionViewModel = {
  receiveEpoch: number;
  recomputed: string[];
  reused: string[];
  skipped: string[];
  superseded: string[];
  emitted: string[];
};

export type DeveloperInspectorInternalStateViewModel = {
  status: "available";
  intent: {
    userIntent: string | null;
    styleGuide: string | null;
  };
  claims: Claim[];
};

export type DeveloperInspectorEvidenceViewModel = {
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

export type DeveloperInspectorViewModel = {
  title: "Reactive Correction Developer Inspector";
  source:
    | {
        type: "artifact-bundle";
        runId: string;
        generatedAt: string;
        command: LoadedArtifactBundle["manifest"]["run"]["command"];
        mode: LoadedArtifactBundle["manifest"]["run"]["mode"];
        provider: LoadedArtifactBundle["manifest"]["run"]["provider"];
      }
    | {
        type: "live-session";
        sessionId: string;
        mode: "runtime" | "graph";
        provider: LoadedArtifactBundle["manifest"]["run"]["provider"];
      };
  userFacing: {
    resultMarkdown: string | null;
  };
  developerDiagnostics: {
    trace:
      | {
          status: "available";
          eventCount: number;
        }
      | {
          status: "missing";
          eventCount: null;
        };
    artifacts: DeveloperInspectorArtifactViewModel[];
    warnings: DeveloperInspectorWarning[];
    execution?: {
      status: "available";
      receives: DeveloperInspectorReceiveExecutionViewModel[];
    };
    internalState?: DeveloperInspectorInternalStateViewModel;
    evidence?: DeveloperInspectorEvidenceViewModel;
  };
};

export type DeveloperInspectorLiveSessionSnapshot = {
  sessionId: string;
  state: CorrectionRuntimeInput &
    Partial<CorrectionRuntimeOutput> & {
      trace?: TraceEvent[];
    };
  mode?: "runtime" | "graph";
  provider?: LoadedArtifactBundle["manifest"]["run"]["provider"];
};

const ARTIFACT_LABELS: Record<ArtifactKey, string> = {
  result: "Result",
  state: "State",
  trace: "Trace",
  executionSummary: "Execution summary",
  comparison: "Comparison",
  savings: "Savings",
  evaluation: "Evaluation",
  scorecard: "Scorecard",
  report: "Report",
};

const ARTIFACT_KEYS = Object.keys(ARTIFACT_LABELS) as ArtifactKey[];

const WORK_LABELS: Record<string, string> = {
  factCheck: "Fact check",
  styleReview: "Style review",
  rewriteDraft: "Rewrite draft",
  finalResult: "Final result",
};

export function createDeveloperInspectorViewModel(
  bundle: LoadedArtifactBundle,
): DeveloperInspectorViewModel {
  const artifacts = ARTIFACT_KEYS.map((key) =>
    artifactViewModel(key, bundle.manifest.artifacts[key]),
  );
  const warnings = artifacts
    .filter((artifact) => artifact.status === "missing")
    .map((artifact) => ({
      code: "artifact-missing" as const,
      artifact: artifact.key,
      message: `${artifact.label} artifact is not available in this bundle.`,
    }));

  return {
    title: "Reactive Correction Developer Inspector",
    source: {
      type: "artifact-bundle",
      runId: bundle.manifest.run.id,
      generatedAt: bundle.manifest.run.generatedAt,
      command: bundle.manifest.run.command,
      mode: bundle.manifest.run.mode,
      provider: bundle.manifest.run.provider,
    },
    userFacing: {
      resultMarkdown: resultMarkdown(bundle),
    },
    developerDiagnostics: {
      trace: traceDiagnostics(bundle),
      artifacts,
      warnings,
      ...executionDiagnostics(bundle),
      ...internalStateDiagnostics(bundle),
      ...evidenceDiagnostics(bundle),
    },
  };
}

export function createDeveloperInspectorViewModelFromLiveSessionSnapshot(
  snapshot: DeveloperInspectorLiveSessionSnapshot,
): DeveloperInspectorViewModel {
  const trace = snapshot.state.trace ?? [];

  return {
    title: "Reactive Correction Developer Inspector",
    source: {
      type: "live-session",
      sessionId: snapshot.sessionId,
      mode: snapshot.mode ?? "runtime",
      provider: snapshot.provider ?? "deterministic-mock",
    },
    userFacing: {
      resultMarkdown: renderResultMarkdown(snapshot.state.finalResult),
    },
    developerDiagnostics: {
      trace: traceDiagnosticsFromTrace(trace),
      artifacts: [],
      warnings: [],
      ...liveExecutionDiagnostics(trace),
      ...internalStateDiagnosticsFromRecord(snapshot.state),
    },
  };
}

function artifactViewModel(
  key: ArtifactKey,
  reference: ArtifactReference | null,
): DeveloperInspectorArtifactViewModel {
  if (!reference) {
    return {
      key,
      label: ARTIFACT_LABELS[key],
      status: "missing",
      path: null,
      schema: null,
    };
  }

  return {
    key,
    label: ARTIFACT_LABELS[key],
    status: "available",
    path: reference.path,
    schema: formatSchema(reference.schema),
  };
}

function resultMarkdown(bundle: LoadedArtifactBundle): string | null {
  const result = bundle.artifacts.result;
  return typeof result?.content === "string" ? result.content : null;
}

function traceDiagnostics(
  bundle: LoadedArtifactBundle,
): DeveloperInspectorViewModel["developerDiagnostics"]["trace"] {
  const trace = bundle.artifacts.trace?.content;
  if (!Array.isArray(trace)) {
    return {
      status: "missing",
      eventCount: null,
    };
  }

  return {
    status: "available",
    eventCount: trace.length,
  };
}

function traceDiagnosticsFromTrace(
  trace: TraceEvent[],
): DeveloperInspectorViewModel["developerDiagnostics"]["trace"] {
  return {
    status: "available",
    eventCount: trace.length,
  };
}

function formatSchema(schema: ArtifactReference["schema"]): string | null {
  if (!schema) return null;
  return `${schema.name}@${schema.version}`;
}

function executionDiagnostics(
  bundle: LoadedArtifactBundle,
): Pick<DeveloperInspectorViewModel["developerDiagnostics"], "execution"> {
  const report = compatibleExecutionSummaryReport(bundle);
  if (!report) return {};

  const trace = traceEvents(bundle);

  return {
    execution: {
      status: "available",
      receives: report.summaries.map((summary) =>
        receiveExecutionViewModel(trace, summary),
      ),
    },
  };
}

function liveExecutionDiagnostics(
  trace: TraceEvent[],
): Pick<DeveloperInspectorViewModel["developerDiagnostics"], "execution"> {
  const receiveEpochs = trace
    .filter(
      (event) =>
        event.scope === "runtime" &&
        event.type === "started" &&
        event.label === "receive" &&
        typeof event.metadata?.receiveEpoch === "number",
    )
    .map((event) => event.metadata?.receiveEpoch)
    .filter((epoch): epoch is number => typeof epoch === "number");

  if (receiveEpochs.length === 0) return {};

  return {
    execution: {
      status: "available",
      receives: receiveEpochs.map((receiveEpoch) =>
        receiveExecutionViewModel(
          trace,
          projectReceiveExecutionSummary(trace, receiveEpoch),
        ),
      ),
    },
  };
}

function receiveExecutionViewModel(
  trace: TraceEvent[],
  summary: ReceiveExecutionSummary,
): DeveloperInspectorReceiveExecutionViewModel {
  return {
    receiveEpoch: summary.receiveEpoch,
    recomputed: workLabels(summary.recomputed),
    reused: workLabels(summary.reused),
    skipped: workLabels(
      skippedResourceLabelsForReceive(
        trace,
        summary.receiveEpoch,
        summary.superseded,
      ),
    ),
    superseded: workLabels(summary.superseded),
    emitted: workLabels(summary.emitted),
  };
}

function internalStateDiagnostics(
  bundle: LoadedArtifactBundle,
): Pick<DeveloperInspectorViewModel["developerDiagnostics"], "internalState"> {
  const state = compatibleState(bundle);
  if (!state) return {};

  return internalStateDiagnosticsFromRecord(state);
}

function internalStateDiagnosticsFromRecord(
  state: { userIntent?: unknown; styleGuide?: unknown; claims?: unknown },
): Pick<DeveloperInspectorViewModel["developerDiagnostics"], "internalState"> {
  const userIntent =
    typeof state.userIntent === "string" ? state.userIntent : null;
  const styleGuide =
    typeof state.styleGuide === "string" ? state.styleGuide : null;
  const claims = Array.isArray(state.claims)
    ? state.claims.filter(isClaim)
    : [];

  if (!userIntent && !styleGuide && claims.length === 0) return {};

  return {
    internalState: {
      status: "available",
      intent: {
        userIntent,
        styleGuide,
      },
      claims,
    },
  };
}

function evidenceDiagnostics(
  bundle: LoadedArtifactBundle,
): Pick<DeveloperInspectorViewModel["developerDiagnostics"], "evidence"> {
  const scorecard = compatibleScorecard(bundle);
  if (!scorecard) return {};

  const corroboration = scorecard.corroboration;
  const recomputationCalls =
    scorecard.executionEfficiency.recomputationCalls;

  if (!corroboration && recomputationCalls === undefined) return {};

  return {
    evidence: {
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

function compatibleExecutionSummaryReport(
  bundle: LoadedArtifactBundle,
): ReceiveExecutionSummaryReport | null {
  const artifact = bundle.artifacts.executionSummary;
  if (
    !artifact ||
    artifact.mediaType !== "application/json" ||
    artifact.schema?.name !== "receive-execution-summaries" ||
    artifact.schema.version !== 1 ||
    !isReceiveExecutionSummaryReport(artifact.content)
  ) {
    return null;
  }

  return artifact.content;
}

function compatibleState(
  bundle: LoadedArtifactBundle,
): Record<string, unknown> | null {
  const artifact = bundle.artifacts.state;
  if (
    !artifact ||
    artifact.mediaType !== "application/json" ||
    artifact.schema?.name !== "correction-state" ||
    artifact.schema.version !== 1 ||
    !isRecord(artifact.content)
  ) {
    return null;
  }

  return artifact.content;
}

function compatibleScorecard(
  bundle: LoadedArtifactBundle,
): StructuralReliabilityScorecard | null {
  const artifact = bundle.artifacts.scorecard;
  if (
    !artifact ||
    artifact.mediaType !== "application/json" ||
    artifact.schema?.name !== "structural-reliability-scorecard" ||
    artifact.schema.version !== 1
  ) {
    return null;
  }

  return artifact.content as StructuralReliabilityScorecard;
}

function isReceiveExecutionSummaryReport(
  value: unknown,
): value is ReceiveExecutionSummaryReport {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  return Array.isArray(value.summaries);
}

function traceEvents(bundle: LoadedArtifactBundle): TraceEvent[] {
  const trace = bundle.artifacts.trace?.content;
  return Array.isArray(trace) ? (trace as TraceEvent[]) : [];
}

function skippedResourceLabelsForReceive(
  trace: TraceEvent[],
  receiveEpoch: number,
  superseded: string[],
) {
  const startIndex = trace.findIndex(
    (event) =>
      event.scope === "runtime" &&
      event.type === "started" &&
      event.label === "receive" &&
      event.metadata?.receiveEpoch === receiveEpoch,
  );
  if (startIndex === -1) return [];

  const nextReceiveIndex = trace.findIndex(
    (event, index) =>
      index > startIndex &&
      event.scope === "runtime" &&
      event.type === "started" &&
      event.label === "receive",
  );
  const receiveTrace = trace.slice(
    startIndex,
    nextReceiveIndex === -1 ? trace.length : nextReceiveIndex,
  );
  const supersededLabels = new Set(superseded);

  return [
    ...new Set(
      receiveTrace
        .filter(
          (event) =>
            event.scope === "resource" &&
            event.type === "skipped" &&
            !supersededLabels.has(event.label),
        )
        .map((event) => event.label),
    ),
  ];
}

function workLabels(labels: string[]): string[] {
  return labels.map((label) => WORK_LABELS[label] ?? label);
}

function isClaim(value: unknown): value is Claim {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.text === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
