import { randomUUID } from "node:crypto";

export type ArtifactBundleCommand =
  | "demo"
  | "demo:graph"
  | "demo:compare"
  | "evaluate:ollama"
  | "demo:report";

export type ArtifactBundleMode =
  | "runtime"
  | "graph"
  | "comparison"
  | "evaluation"
  | "report";

export type ArtifactReference = {
  path: string;
  mediaType: "application/json" | "text/markdown" | "text/html";
  schema: {
    name: string;
    version: number;
  } | null;
};

export type ArtifactBundleArtifacts = {
  result: ArtifactReference | null;
  state: ArtifactReference | null;
  trace: ArtifactReference | null;
  executionSummary: ArtifactReference | null;
  comparison: ArtifactReference | null;
  savings: ArtifactReference | null;
  evaluation: ArtifactReference | null;
  scorecard: ArtifactReference | null;
  report: ArtifactReference | null;
};

export type ArtifactBundleManifest = {
  schemaVersion: 1;
  run: {
    id: string;
    generatedAt: string;
    command: ArtifactBundleCommand;
    mode: ArtifactBundleMode;
    provider: "deterministic-mock" | "ollama";
  };
  artifacts: ArtifactBundleArtifacts;
};

export type CreateArtifactBundleManifestInput = {
  command: ArtifactBundleCommand;
  mode: ArtifactBundleMode;
  provider: ArtifactBundleManifest["run"]["provider"];
  artifacts: Partial<ArtifactBundleArtifacts>;
};

export type ArtifactBundleManifestDependencies = {
  createRunId: () => string;
  now: () => Date;
};

const REQUIRED_ARTIFACTS_BY_MODE: Record<
  ArtifactBundleMode,
  readonly (keyof ArtifactBundleArtifacts)[]
> = {
  runtime: ["result", "state", "trace"],
  graph: ["result", "state", "trace"],
  comparison: ["result", "state", "trace", "comparison"],
  evaluation: ["evaluation"],
  report: ["report"],
};

const ARTIFACT_NAMES = [
  "result",
  "state",
  "trace",
  "executionSummary",
  "comparison",
  "savings",
  "evaluation",
  "scorecard",
  "report",
] as const satisfies readonly (keyof ArtifactBundleArtifacts)[];

const ARTIFACT_FORMATS = {
  result: { mediaType: "text/markdown", schema: null },
  state: {
    mediaType: "application/json",
    schema: { name: "correction-state", version: 1 },
  },
  trace: {
    mediaType: "application/json",
    schema: { name: "trace-events", version: 1 },
  },
  executionSummary: {
    mediaType: "application/json",
    schema: { name: "receive-execution-summaries", version: 1 },
  },
  comparison: {
    mediaType: "application/json",
    schema: { name: "correction-comparison", version: 1 },
  },
  savings: {
    mediaType: "application/json",
    schema: { name: "recompute-savings", version: 1 },
  },
  evaluation: {
    mediaType: "application/json",
    schema: { name: "local-llm-evaluation", version: 1 },
  },
  scorecard: {
    mediaType: "application/json",
    schema: { name: "structural-reliability-scorecard", version: 1 },
  },
  report: { mediaType: "text/html", schema: null },
} as const;

export function createArtifactBundleManifest(
  input: CreateArtifactBundleManifestInput,
  dependencies: Partial<ArtifactBundleManifestDependencies> = {},
): ArtifactBundleManifest {
  const createRunId = dependencies.createRunId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());

  return {
    schemaVersion: 1,
    run: {
      id: createRunId(),
      generatedAt: now().toISOString(),
      command: input.command,
      mode: input.mode,
      provider: input.provider,
    },
    artifacts: {
      result: null,
      state: null,
      trace: null,
      executionSummary: null,
      comparison: null,
      savings: null,
      evaluation: null,
      scorecard: null,
      report: null,
      ...input.artifacts,
    },
  };
}

export function serializeArtifactBundleManifest(
  manifest: ArtifactBundleManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function validateArtifactBundleManifest(
  value: unknown,
): ArtifactBundleManifest {
  if (!isRecord(value)) {
    throw new Error("Malformed artifact bundle manifest");
  }

  if (
    typeof value.schemaVersion !== "number" ||
    !Number.isInteger(value.schemaVersion)
  ) {
    throw new Error(
      "Malformed artifact bundle schema version: expected integer",
    );
  }

  if (value.schemaVersion !== 1) {
    throw new Error(
      `Unsupported artifact bundle schema version: ${String(value.schemaVersion)}`,
    );
  }

  if (!isRecord(value.run) || !isArtifactBundleMode(value.run.mode)) {
    throw new Error("Malformed artifact bundle run metadata");
  }

  if (!isRecord(value.artifacts)) {
    throw new Error("Malformed artifact bundle artifacts");
  }

  for (const artifactName of ARTIFACT_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(value.artifacts, artifactName)) {
      throw new Error(
        `Artifact bundle must explicitly declare ${artifactName} artifact`,
      );
    }

    const artifact = value.artifacts[artifactName];
    if (artifact === null) {
      continue;
    }

    if (!isRecord(artifact) || typeof artifact.path !== "string") {
      throw new Error(`Malformed ${artifactName} artifact reference`);
    }

    if (!isSafeRelativeArtifactPath(artifact.path)) {
      throw new Error(
        `Artifact ${artifactName} path must be relative and stay inside the bundle: ${artifact.path}`,
      );
    }

    const expectedFormat = ARTIFACT_FORMATS[artifactName];
    if (artifact.mediaType !== expectedFormat.mediaType) {
      throw new Error(
        `Unsupported media type for ${artifactName}: ${String(artifact.mediaType)}`,
      );
    }

    if (expectedFormat.schema === null) {
      if (artifact.schema !== null) {
        throw new Error(`Malformed artifact schema for ${artifactName}`);
      }
      continue;
    }

    if (
      !isRecord(artifact.schema) ||
      typeof artifact.schema.name !== "string" ||
      typeof artifact.schema.version !== "number"
    ) {
      throw new Error(`Malformed artifact schema for ${artifactName}`);
    }

    if (
      artifact.schema.name !== expectedFormat.schema.name ||
      artifact.schema.version !== expectedFormat.schema.version
    ) {
      throw new Error(
        `Unsupported artifact schema for ${artifactName}: ${artifact.schema.name}@${artifact.schema.version}`,
      );
    }
  }

  for (const artifactName of REQUIRED_ARTIFACTS_BY_MODE[value.run.mode]) {
    if (value.artifacts[artifactName] == null) {
      throw new Error(
        `Artifact bundle ${value.run.mode} mode requires ${artifactName} artifact`,
      );
    }
  }

  return value as ArtifactBundleManifest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArtifactBundleMode(value: unknown): value is ArtifactBundleMode {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(REQUIRED_ARTIFACTS_BY_MODE, value)
  );
}

function isSafeRelativeArtifactPath(path: string): boolean {
  if (
    path.length === 0 ||
    /^[\\/]/.test(path) ||
    /^[A-Za-z]:[\\/]/.test(path)
  ) {
    return false;
  }

  return !path.split(/[\\/]/).includes("..");
}
