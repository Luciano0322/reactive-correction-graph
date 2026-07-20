import {
  loadReferenceScenario,
  type ReferenceScenario,
  type ReferenceScenarioTransition,
  type ReferenceScenarioTransitionId,
} from "../examples/loadReferenceScenario.js";
import {
  createCorrectionSession,
  type CorrectionSessionOptions,
  type CorrectionSessionState,
} from "../session/createCorrectionSession.js";
import type { TraceEvent } from "../trace/types.js";
import {
  createInstrumentedCorrectionModel,
  type CorrectionOperationCounts,
} from "../comparison/createInstrumentedCorrectionModel.js";
import type {
  ComparisonExecution,
  CorrectionComparisonBaseline,
  CorrectionComparisonReport,
  CorrectionComparisonScenario,
} from "../comparison/runCorrectionComparison.js";

export type ReferenceScenarioRunOptions = Omit<CorrectionSessionOptions, "model"> & {
  scenarioBaseUrl?: URL;
  transitionId?: ReferenceScenarioTransitionId;
};

export type ReferenceScenarioReceive = {
  receiveEpoch: number;
  transition: ReferenceScenarioTransition;
  state: CorrectionSessionState;
};

export type ReferenceScenarioRun = {
  comparison: CorrectionComparisonReport;
  comparisonBaseline: CorrectionComparisonBaseline;
  scenario: ReferenceScenario;
  transition: ReferenceScenarioTransition;
  receives: ReferenceScenarioReceive[];
  provider: "deterministic-mock";
  state: CorrectionSessionState;
  trace: TraceEvent[];
};

export async function runReferenceScenario(
  options: ReferenceScenarioRunOptions = {},
): Promise<ReferenceScenarioRun> {
  const {
    scenarioBaseUrl,
    transitionId,
    model: _ignoredModel,
    ...sessionOptions
  } = options as ReferenceScenarioRunOptions & Pick<CorrectionSessionOptions, "model">;
  const scenario = await loadReferenceScenario({
    fixtureBaseUrl: scenarioBaseUrl,
  });
  const transitions = transitionId
    ? [findTransition(scenario, transitionId)]
    : scenario.transitions;

  const eagerModel = createInstrumentedCorrectionModel();
  const reactiveModel = createInstrumentedCorrectionModel();
  const session = createCorrectionSession({
    ...sessionOptions,
    model: reactiveModel.model,
  });

  try {
    let state: CorrectionSessionState | undefined;
    const receives: ReferenceScenarioReceive[] = [];
    const comparisonScenarios: CorrectionComparisonScenario[] = [];
    let comparisonBaseline: CorrectionComparisonBaseline = {
      eager: execution(emptyOperationCounts(), undefined),
      reactive: execution(emptyOperationCounts(), undefined),
    };

    for (const transition of transitions) {
      const eagerState = await runFreshTransition(
        transition,
        sessionOptions,
        eagerModel.model,
      );

      session.receive(transition.input);
      await session.runUntilSettled();

      state = session.emit();
      if (!state.finalResult) {
        throw new Error(
          `Reference scenario transition ${transition.id} settled without a final result`,
        );
      }

      receives.push({
        receiveEpoch: receiveEpochFromState(state),
        transition,
        state,
      });

      if (transition.id === "initial") {
        comparisonBaseline = {
          eager: execution(eagerModel.counts(), eagerState.finalResult),
          reactive: execution(reactiveModel.counts(), state.finalResult),
        };
      } else {
        comparisonScenarios.push({
          scenario: transition.id,
          eager: execution(eagerModel.counts(), eagerState.finalResult),
          reactive: execution(reactiveModel.counts(), state.finalResult),
          finalResultsMatch:
            JSON.stringify(eagerState.finalResult) ===
            JSON.stringify(state.finalResult),
        });
      }
    }

    const transition = transitions.at(-1);
    if (!transition || !state) {
      throw new Error("Reference scenario has no transitions to run");
    }

    return {
      comparison: {
        provider: "deterministic-mock",
        scenarios: comparisonScenarios,
      },
      comparisonBaseline,
      scenario,
      transition,
      receives,
      provider: "deterministic-mock",
      state,
      trace: state.trace,
    };
  } finally {
    session.dispose();
  }
}

async function runFreshTransition(
  transition: ReferenceScenarioTransition,
  sessionOptions: Omit<CorrectionSessionOptions, "model">,
  model: CorrectionSessionOptions["model"],
) {
  const session = createCorrectionSession({
    ...sessionOptions,
    model,
  });

  try {
    session.receive(transition.input);
    await session.runUntilSettled();

    const state = session.emit();
    if (!state.finalResult) {
      throw new Error(
        `Reference scenario eager transition ${transition.id} settled without a final result`,
      );
    }

    return state;
  } finally {
    session.dispose();
  }
}

function execution(
  counts: CorrectionOperationCounts,
  finalResult: CorrectionSessionState["finalResult"],
): ComparisonExecution {
  return {
    ...counts,
    finalResultProduced: Boolean(finalResult),
  };
}

function emptyOperationCounts(): CorrectionOperationCounts {
  return {
    factCheckCalls: 0,
    styleReviewCalls: 0,
    rewriteDraftCalls: 0,
  };
}

function receiveEpochFromState(state: CorrectionSessionState) {
  const receiveStartedEvent = state.trace
    .filter(
      (event) =>
        event.scope === "runtime" &&
        event.type === "started" &&
        event.label === "receive" &&
        typeof event.metadata?.receiveEpoch === "number",
    )
    .at(-1);
  const receiveEpoch = receiveStartedEvent?.metadata?.receiveEpoch;

  if (typeof receiveEpoch !== "number") {
    throw new Error("Reference scenario receive did not record a receive epoch");
  }

  return receiveEpoch;
}

function findTransition(
  scenario: ReferenceScenario,
  transitionId: ReferenceScenarioTransitionId,
) {
  const transition = scenario.transitions.find(
    (candidate) => candidate.id === transitionId,
  );

  if (!transition) {
    throw new Error(`Unknown reference scenario transition: ${transitionId}`);
  }

  return transition;
}
