import { describe, expect, it } from "vitest";
import {
  createLangGraphReferenceWorkflow,
  runLangGraphReferenceWorkflowExample,
} from "./langGraphReferenceWorkflow.js";

describe("LangGraph reference workflow example", () => {
  it("runs a correction runtime as one node in an external LangGraph workflow", async () => {
    const result = await runLangGraphReferenceWorkflowExample();

    expect({
      prepared: result.prepared,
      correctionCompleted: result.correctionCompleted,
      finalized: result.finalized,
      revisedDraft: result.revisedDraft,
      summary: result.summary,
      workflowTraceLabels: result.workflowTraceLabels,
      runtimeTraceEventCount: result.runtimeTraceEventCount,
    }).toEqual({
      prepared: true,
      correctionCompleted: true,
      finalized: true,
      revisedDraft: expect.stringContaining("Mock correction notes"),
      summary: expect.arrayContaining([
        "Apply style guide: Use concise technical language.",
        "Respect user intent: Explain this as a reference LangGraph node.",
      ]),
      workflowTraceLabels: [
        "prepareReferenceInput",
        "runCorrectionNode",
        "finalizeReferenceOutput",
      ],
      runtimeTraceEventCount: expect.any(Number),
    });
    expect(result.runtimeTraceEventCount).toBeGreaterThan(0);
  });

  it("keeps workflow state serializable and free of live runtime handles", async () => {
    const workflow = createLangGraphReferenceWorkflow();
    const state = await workflow.invoke({
      draft: "Signal-kernel coordinates async correction branches.",
      userIntent: "Explain this as a reference LangGraph node.",
      styleGuide: "Use concise technical language.",
    });
    const roundTrippedState = JSON.parse(JSON.stringify(state)) as typeof state;

    expect({
      stateKeys: Object.keys(state).sort(),
      nonJsonCompatiblePaths: collectNonJsonCompatiblePaths(state),
      forbiddenLiveHandlePaths: collectForbiddenLiveHandlePaths(state),
      roundTrippedState,
    }).toEqual({
      stateKeys: [
        "correctionCompleted",
        "draft",
        "finalized",
        "prepared",
        "revisedDraft",
        "runtimeTrace",
        "styleGuide",
        "summary",
        "userIntent",
        "workflowTraceLabels",
      ],
      nonJsonCompatiblePaths: [],
      forbiddenLiveHandlePaths: [],
      roundTrippedState: state,
    });
  });
});

function collectNonJsonCompatiblePaths(
  value: unknown,
  path = "state",
): string[] {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return [];
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? [] : [path];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectNonJsonCompatiblePaths(item, `${path}[${index}]`),
    );
  }

  if (isPlainRecord(value)) {
    return Object.entries(value).flatMap(([key, item]) =>
      collectNonJsonCompatiblePaths(item, `${path}.${key}`),
    );
  }

  return [path];
}

function collectForbiddenLiveHandlePaths(
  value: unknown,
  path = "state",
): string[] {
  const forbiddenKeys = new Set([
    "abortController",
    "computed",
    "effect",
    "promise",
    "runtime",
    "session",
    "signal",
    "subscription",
  ]);

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectForbiddenLiveHandlePaths(item, `${path}[${index}]`),
    );
  }

  if (!isPlainRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, item]) => {
    const nextPath = `${path}.${key}`;
    const current = forbiddenKeys.has(key) ? [nextPath] : [];
    return current.concat(collectForbiddenLiveHandlePaths(item, nextPath));
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
