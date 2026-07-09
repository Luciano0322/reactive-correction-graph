import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runLangGraphCheckpointUsageExample } from "./langGraphCheckpointUsage.js";

describe("LangGraph checkpoint usage example", () => {
  it("restores a graph session checkpoint through the public package root only", async () => {
    const source = await readFile(
      new URL("./langGraphCheckpointUsage.ts", import.meta.url),
      "utf8",
    );
    const importSpecifiers = Array.from(
      source.matchAll(/from\s+["']([^"']+)["']/g),
      ([, specifier]) => specifier,
    );

    const result = await runLangGraphCheckpointUsageExample();

    expect({
      importSpecifiers,
      checkpointSchemaVersion: result.checkpointSchemaVersion,
      parsedCheckpointSchemaVersion: result.parsedCheckpointSchemaVersion,
      restoredCheckpointSchemaVersion: result.restoredCheckpointSchemaVersion,
      receiveEpochs: result.receiveEpochs,
      factCheckPendingOnRestore: result.factCheckPendingOnRestore,
      styleReviewPendingOnRestore: result.styleReviewPendingOnRestore,
      rewriteDraftPendingOnRestore: result.rewriteDraftPendingOnRestore,
      finalResultChangedAfterRestore: result.finalResultChangedAfterRestore,
      summary: result.summary,
      serializedCheckpointContainsLiveSession:
        result.serializedCheckpointContainsLiveSession,
    }).toEqual({
      importSpecifiers: ["reactive-correction-graph"],
      checkpointSchemaVersion: 1,
      parsedCheckpointSchemaVersion: 1,
      restoredCheckpointSchemaVersion: 1,
      receiveEpochs: [1, 2],
      factCheckPendingOnRestore: false,
      styleReviewPendingOnRestore: true,
      rewriteDraftPendingOnRestore: true,
      finalResultChangedAfterRestore: true,
      summary: expect.arrayContaining([
        "Apply style guide: Use concise technical language.",
        "Respect user intent: Explain durable graph session restore.",
      ]),
      serializedCheckpointContainsLiveSession: false,
    });
  });
});
