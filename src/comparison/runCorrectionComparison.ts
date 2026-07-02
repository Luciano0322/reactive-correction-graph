import {
  createCorrectionGraph,
  createCorrectionGraphSession,
  type CorrectionGraphState,
} from "../graph/createCorrectionGraph.js";
import type { CorrectionRuntimeInput, FinalResult } from "../schemas/correction.js";
import {
  createInstrumentedCorrectionModel,
  type CorrectionOperationCounts,
  type InstrumentedCorrectionModel,
} from "./createInstrumentedCorrectionModel.js";

export type ComparisonExecution = CorrectionOperationCounts & {
  finalResultProduced: boolean;
};

export type CorrectionComparisonScenario = {
  scenario: "style-only" | "claim-changing";
  eager: ComparisonExecution;
  reactive: ComparisonExecution;
  finalResultsMatch: boolean;
};

export type CorrectionComparisonReport = {
  provider: "deterministic-mock";
  scenarios: CorrectionComparisonScenario[];
};

export type CorrectionComparisonBaseline = {
  eager: ComparisonExecution;
  reactive: ComparisonExecution;
};

export type CorrectionComparisonRun = {
  report: CorrectionComparisonReport;
  state: CorrectionGraphState;
  baseline: CorrectionComparisonBaseline;
};

const INITIAL_DRAFT = "Signal-kernel coordinates async correction branches.";

export async function runCorrectionComparison(): Promise<CorrectionComparisonReport> {
  return (await runCorrectionComparisonWithArtifacts()).report;
}

export async function runCorrectionComparisonWithArtifacts(): Promise<CorrectionComparisonRun> {
  const eagerModel = createInstrumentedCorrectionModel();
  const reactiveModel = createInstrumentedCorrectionModel();
  const eagerGraph = createCorrectionGraph({ model: eagerModel.model });
  const reactiveSession = createCorrectionGraphSession({
    model: reactiveModel.model,
  });

  const initialInput: CorrectionRuntimeInput = { draft: INITIAL_DRAFT };
  const eagerInitialState = await eagerGraph.invoke(initialInput);
  const reactiveInitialState = await reactiveSession.invoke(initialInput);
  const baseline: CorrectionComparisonBaseline = {
    eager: execution(eagerModel.counts(), eagerInitialState.finalResult),
    reactive: execution(
      reactiveModel.counts(),
      reactiveInitialState.finalResult,
    ),
  };

  const styleOnlyInput: CorrectionRuntimeInput = {
    draft: INITIAL_DRAFT,
    styleGuide: "Use concise technical language.",
  };
  const eagerStyleState = await eagerGraph.invoke(styleOnlyInput);
  const reactiveStyleState = await reactiveSession.invoke(styleOnlyInput);
  const styleOnlyScenario = createScenario(
    "style-only",
    eagerModel,
    eagerStyleState.finalResult,
    reactiveModel,
    reactiveStyleState.finalResult,
  );

  const claimChangingInput: CorrectionRuntimeInput = {
    draft: `${INITIAL_DRAFT} A new claim now requires verification.`,
    styleGuide: styleOnlyInput.styleGuide,
  };
  const eagerClaimState = await eagerGraph.invoke(claimChangingInput);
  const reactiveClaimState = await reactiveSession.invoke(claimChangingInput);

  return {
    baseline,
    report: {
      provider: "deterministic-mock",
      scenarios: [
        styleOnlyScenario,
        createScenario(
          "claim-changing",
          eagerModel,
          eagerClaimState.finalResult,
          reactiveModel,
          reactiveClaimState.finalResult,
        ),
      ],
    },
    state: reactiveClaimState,
  };
}

function createScenario(
  scenario: CorrectionComparisonScenario["scenario"],
  eagerModel: InstrumentedCorrectionModel,
  eagerFinalResult: FinalResult | undefined,
  reactiveModel: InstrumentedCorrectionModel,
  reactiveFinalResult: FinalResult | undefined,
): CorrectionComparisonScenario {
  return {
    scenario,
    eager: execution(eagerModel.counts(), eagerFinalResult),
    reactive: execution(reactiveModel.counts(), reactiveFinalResult),
    finalResultsMatch:
      JSON.stringify(eagerFinalResult) === JSON.stringify(reactiveFinalResult),
  };
}

function execution(
  counts: CorrectionOperationCounts,
  finalResult: FinalResult | undefined,
): ComparisonExecution {
  return {
    ...counts,
    finalResultProduced: Boolean(finalResult),
  };
}
