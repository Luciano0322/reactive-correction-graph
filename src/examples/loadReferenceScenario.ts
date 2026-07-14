import { readFile } from "node:fs/promises";
import type { CorrectionRuntimeInput } from "../schemas/correction.js";

export type ReferenceScenario = {
  id: "technical-article-correction";
  title: "Technical article correction";
  initialDraft: string;
  styleGuide: string;
  metadata: ReferenceScenarioMetadata;
  inputs: ReferenceScenarioInputs;
  transitions: ReferenceScenarioTransition[];
};

export type ReferenceScenarioMetadata = {
  kind: "reference-application";
  fixturePaths: {
    initialDraft: string;
    styleGuide: string;
    metadata: "reference-scenario.json";
  };
  proofTarget: string;
  description: string;
  initialUserIntent: string;
  styleOnlyStyleGuide: string;
  claimChangingDraftAppendix: string;
  executionBoundary: ReferenceScenarioExecutionBoundary;
  transitions: ReferenceScenarioTransitionMetadata[];
};

export type ReferenceScenarioExecutionBoundary = {
  provider: "mock";
  requiresNetwork: false;
  requiresOllama: false;
  requiresLangSmith: false;
  requiresApiKey: false;
};

export type ReferenceScenarioInputs = {
  initial: CorrectionRuntimeInput;
  styleOnly: CorrectionRuntimeInput;
  claimChanging: CorrectionRuntimeInput;
};

export type ReferenceScenarioTransitionId =
  | "initial"
  | "style-only"
  | "claim-changing";

export type ReferenceScenarioTransitionMetadata = {
  id: ReferenceScenarioTransitionId;
  proofTarget: string;
};

export type ReferenceScenarioTransition =
  ReferenceScenarioTransitionMetadata & {
    input: CorrectionRuntimeInput;
  };

const transitionInputKeys: Record<
  ReferenceScenarioTransitionId,
  keyof ReferenceScenarioInputs
> = {
  initial: "initial",
  "style-only": "styleOnly",
  "claim-changing": "claimChanging",
};

export async function loadReferenceScenario(): Promise<ReferenceScenario> {
  const metadata = JSON.parse(
    await readFixture("reference-scenario.json"),
  ) as ReferenceScenarioMetadata;
  const [initialDraft, styleGuide] = await Promise.all([
    readFixture(metadata.fixturePaths.initialDraft),
    readFixture(metadata.fixturePaths.styleGuide),
  ]);

  const inputs: ReferenceScenarioInputs = {
    initial: {
      draft: initialDraft,
      userIntent: metadata.initialUserIntent,
      styleGuide,
    },
    styleOnly: {
      draft: initialDraft,
      userIntent: metadata.initialUserIntent,
      styleGuide: metadata.styleOnlyStyleGuide,
    },
    claimChanging: {
      draft: `${initialDraft.trim()}\n\n${metadata.claimChangingDraftAppendix}\n`,
      userIntent: metadata.initialUserIntent,
      styleGuide: metadata.styleOnlyStyleGuide,
    },
  };

  const transitions = metadata.transitions.map((transition) => ({
    ...transition,
    input: inputs[transitionInputKeys[transition.id]],
  }));

  return {
    id: "technical-article-correction",
    title: "Technical article correction",
    initialDraft,
    styleGuide,
    metadata,
    inputs,
    transitions,
  };
}

function readFixture(filename: string) {
  return readFile(new URL(`./${filename}`, import.meta.url), "utf8");
}
