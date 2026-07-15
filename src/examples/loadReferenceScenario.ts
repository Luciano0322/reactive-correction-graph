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

export type LoadReferenceScenarioOptions = {
  fixtureBaseUrl?: URL;
};

const transitionInputKeys: Record<
  ReferenceScenarioTransitionId,
  keyof ReferenceScenarioInputs
> = {
  initial: "initial",
  "style-only": "styleOnly",
  "claim-changing": "claimChanging",
};

const defaultFixtureBaseUrl = new URL("./", import.meta.url);

export async function loadReferenceScenario(
  options: LoadReferenceScenarioOptions = {},
): Promise<ReferenceScenario> {
  const fixtureBaseUrl = options.fixtureBaseUrl ?? defaultFixtureBaseUrl;
  const metadata = parseMetadata(
    await readFixture("reference-scenario.json", fixtureBaseUrl),
  );
  const [initialDraft, styleGuide] = await Promise.all([
    readFixture(metadata.fixturePaths.initialDraft, fixtureBaseUrl),
    readFixture(metadata.fixturePaths.styleGuide, fixtureBaseUrl),
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

function parseMetadata(raw: string): ReferenceScenarioMetadata {
  try {
    return JSON.parse(raw) as ReferenceScenarioMetadata;
  } catch (error) {
    throw new Error(
      "Reference scenario fixture invalid: reference-scenario.json must be valid JSON",
      { cause: error },
    );
  }
}

async function readFixture(filename: string, fixtureBaseUrl: URL) {
  try {
    return await readFile(new URL(filename, fixtureBaseUrl), "utf8");
  } catch (error) {
    if (isNodeFileError(error) && error.code === "ENOENT") {
      throw new Error(`Reference scenario fixture missing: ${filename}`, {
        cause: error,
      });
    }

    throw error;
  }
}

function isNodeFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
