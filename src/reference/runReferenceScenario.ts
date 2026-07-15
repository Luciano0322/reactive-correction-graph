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

export type ReferenceScenarioReceive = {
  receiveEpoch: number;
  transition: ReferenceScenarioTransition;
  state: CorrectionSessionState;
};

export type ReferenceScenarioRun = {
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
    ...sessionOptions
  } = options;
  const scenario = await loadReferenceScenario({
    fixtureBaseUrl: scenarioBaseUrl,
  });
  const transitions = transitionId
    ? [findTransition(scenario, transitionId)]
    : scenario.transitions;

  const session = createCorrectionSession(sessionOptions);

  try {
    let state: CorrectionSessionState | undefined;
    const receives: ReferenceScenarioReceive[] = [];

    for (const transition of transitions) {
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
    }

    const transition = transitions.at(-1);
    if (!transition || !state) {
      throw new Error("Reference scenario has no transitions to run");
    }

    return {
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
