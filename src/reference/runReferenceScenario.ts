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

export type ReferenceScenarioRunOptions = CorrectionSessionOptions & {
  scenarioBaseUrl?: URL;
  transitionId?: ReferenceScenarioTransitionId;
};

export type ReferenceScenarioRun = {
  scenario: ReferenceScenario;
  transition: ReferenceScenarioTransition;
  provider: "deterministic-mock";
  state: CorrectionSessionState;
  trace: TraceEvent[];
};

export async function runReferenceScenario(
  options: ReferenceScenarioRunOptions = {},
): Promise<ReferenceScenarioRun> {
  const {
    scenarioBaseUrl,
    transitionId = "initial",
    ...sessionOptions
  } = options;
  const scenario = await loadReferenceScenario({
    fixtureBaseUrl: scenarioBaseUrl,
  });
  const transition = scenario.transitions.find(
    (candidate) => candidate.id === transitionId,
  );

  if (!transition) {
    throw new Error(`Unknown reference scenario transition: ${transitionId}`);
  }

  const session = createCorrectionSession(sessionOptions);

  try {
    session.receive(transition.input);
    await session.runUntilSettled();

    const state = session.emit();
    if (!state.finalResult) {
      throw new Error(
        `Reference scenario transition ${transition.id} settled without a final result`,
      );
    }

    return {
      scenario,
      transition,
      provider: "deterministic-mock",
      state,
      trace: state.trace,
    };
  } finally {
    session.dispose();
  }
}
