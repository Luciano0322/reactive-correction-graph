import type {
  Claim,
  CorrectionPlan,
  CorrectionRuntimeInput,
  FactCheckResult,
  FinalResult,
  StyleReviewResult,
} from "../schemas/correction.js";
import type { CorrectionRuntimeSnapshot } from "../runtime/createCorrectionRuntime.js";
import {
  createCorrectionSession,
  type CorrectionSession,
  type CorrectionSessionOptions,
} from "../session/createCorrectionSession.js";
import type { TraceEvent } from "../trace/types.js";
import type { CorrectionGraphState } from "./createCorrectionGraph.js";

export type CorrectionGraphCheckpointState = {
  draft: string;
  userIntent?: string;
  styleGuide?: string;
  prepared?: boolean;
  finalized?: boolean;
  claims?: Claim[];
  factCheckResult?: FactCheckResult;
  styleReviewResult?: StyleReviewResult;
  correctionPlan?: CorrectionPlan;
  revisedDraft?: string;
  finalResult?: FinalResult;
  trace: TraceEvent[];
  graphTrace: TraceEvent[];
  snapshot?: CorrectionRuntimeSnapshot;
};

export type CorrectionGraphCheckpoint = {
  schemaVersion: 1;
  state: CorrectionGraphCheckpointState;
};

const CHECKPOINT_STATE_KEYS = new Set([
  "draft",
  "userIntent",
  "styleGuide",
  "prepared",
  "finalized",
  "claims",
  "factCheckResult",
  "styleReviewResult",
  "correctionPlan",
  "revisedDraft",
  "finalResult",
  "trace",
  "graphTrace",
  "snapshot",
]);

export function createCorrectionGraphCheckpoint(
  state: CorrectionGraphState,
): CorrectionGraphCheckpoint {
  return parseCorrectionGraphCheckpoint({
    schemaVersion: 1,
    state: omitUndefined({
      draft: state.draft,
      userIntent: state.userIntent,
      styleGuide: state.styleGuide,
      prepared: state.prepared,
      finalized: state.finalized,
      claims: state.claims,
      factCheckResult: state.factCheckResult,
      styleReviewResult: state.styleReviewResult,
      correctionPlan: state.correctionPlan,
      revisedDraft: state.revisedDraft,
      finalResult: state.finalResult,
      trace: state.trace ?? [],
      graphTrace: state.graphTrace ?? [],
      snapshot: state.snapshot,
    }),
  });
}

export function parseCorrectionGraphCheckpoint(
  value: unknown,
): CorrectionGraphCheckpoint {
  if (!isPlainRecord(value)) {
    throw new Error("Correction graph checkpoint must be an object");
  }

  const schemaVersion = value.schemaVersion;
  if (schemaVersion !== 1) {
    throw new Error(
      `Unsupported correction graph checkpoint schema version: ${String(
        schemaVersion,
      )}`,
    );
  }

  assertJsonCompatible(value, "checkpoint");

  if (!isPlainRecord(value.state)) {
    throw new Error("Correction graph checkpoint state must be an object");
  }

  for (const key of Object.keys(value.state)) {
    if (!CHECKPOINT_STATE_KEYS.has(key)) {
      throw new Error(`Unsupported correction graph checkpoint field: ${key}`);
    }
  }

  if (typeof value.state.draft !== "string") {
    throw new Error("Correction graph checkpoint state.draft must be a string");
  }

  if (!Array.isArray(value.state.trace)) {
    throw new Error("Correction graph checkpoint state.trace must be an array");
  }

  if (!Array.isArray(value.state.graphTrace)) {
    throw new Error(
      "Correction graph checkpoint state.graphTrace must be an array",
    );
  }

  return cloneJson(value) as CorrectionGraphCheckpoint;
}

export function restoreCorrectionSessionFromCheckpoint(
  value: unknown,
  options: CorrectionSessionOptions = {},
): CorrectionSession {
  const checkpoint = parseCorrectionGraphCheckpoint(value);
  const session = createCorrectionSession(options);

  session.receive(toRuntimeInput(checkpoint.state));

  return session;
}

function assertJsonCompatible(value: unknown, path: string): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throwNotJsonCompatible(path);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertJsonCompatible(item, `${path}[${index}]`);
    });
    return;
  }

  if (typeof value === "object") {
    if (!isPlainRecord(value)) {
      throwNotJsonCompatible(path);
    }

    for (const [key, item] of Object.entries(value)) {
      assertJsonCompatible(item, `${path}.${key}`);
    }
    return;
  }

  throwNotJsonCompatible(path);
}

function throwNotJsonCompatible(path: string): never {
  throw new Error(
    `Correction graph checkpoint must contain JSON-compatible data at ${path}`,
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function omitUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function toRuntimeInput(
  state: CorrectionGraphCheckpointState,
): CorrectionRuntimeInput {
  return omitUndefined({
    draft: state.draft,
    userIntent: state.userIntent,
    styleGuide: state.styleGuide,
  }) as CorrectionRuntimeInput;
}
