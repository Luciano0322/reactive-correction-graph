import { describe, expect, it } from "vitest";
import {
  createArtifactBundleManifest,
  serializeArtifactBundleManifest,
  validateArtifactBundleManifest,
  type ArtifactBundleManifest,
} from "./artifactBundleManifest.js";

describe("artifactBundleManifest", () => {
  it("rejects malformed bundle schema versions", () => {
    const manifest = createArtifactBundleManifest(
      {
        command: "demo",
        mode: "runtime",
        provider: "deterministic-mock",
        artifacts: {},
      },
      {
        createRunId: () => "run-malformed-version",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    );

    expect(() =>
      validateArtifactBundleManifest({
        ...manifest,
        schemaVersion: "1",
      }),
    ).toThrow("Malformed artifact bundle schema version: expected integer");
  });

  it("rejects unsupported bundle schema versions", () => {
    const manifest = createArtifactBundleManifest(
      {
        command: "demo",
        mode: "runtime",
        provider: "deterministic-mock",
        artifacts: {},
      },
      {
        createRunId: () => "run-unsupported-version",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    );

    expect(() =>
      validateArtifactBundleManifest({
        ...manifest,
        schemaVersion: 2,
      }),
    ).toThrow("Unsupported artifact bundle schema version: 2");
  });

  it("rejects a missing artifact required by the bundle mode", () => {
    const manifest = createArtifactBundleManifest(
      {
        command: "demo",
        mode: "runtime",
        provider: "deterministic-mock",
        artifacts: {
          result: {
            path: "result.md",
            mediaType: "text/markdown",
            schema: null,
          },
          state: {
            path: "state.json",
            mediaType: "application/json",
            schema: { name: "correction-state", version: 1 },
          },
        },
      },
      {
        createRunId: () => "run-missing-trace",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    );

    expect(() => validateArtifactBundleManifest(manifest)).toThrow(
      "Artifact bundle runtime mode requires trace artifact",
    );
  });

  it("rejects artifact paths that escape the bundle directory", () => {
    const manifest = createArtifactBundleManifest(
      {
        command: "demo",
        mode: "runtime",
        provider: "deterministic-mock",
        artifacts: {
          result: {
            path: "result.md",
            mediaType: "text/markdown",
            schema: null,
          },
          state: {
            path: "../state.json",
            mediaType: "application/json",
            schema: { name: "correction-state", version: 1 },
          },
          trace: {
            path: "trace.json",
            mediaType: "application/json",
            schema: { name: "trace-events", version: 1 },
          },
        },
      },
      {
        createRunId: () => "run-escaping-path",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    );

    expect(() => validateArtifactBundleManifest(manifest)).toThrow(
      "Artifact state path must be relative and stay inside the bundle: ../state.json",
    );
  });

  it("rejects unsupported JSON artifact schemas", () => {
    const manifest = createArtifactBundleManifest(
      {
        command: "demo",
        mode: "runtime",
        provider: "deterministic-mock",
        artifacts: {
          result: {
            path: "result.md",
            mediaType: "text/markdown",
            schema: null,
          },
          state: {
            path: "state.json",
            mediaType: "application/json",
            schema: { name: "correction-state", version: 2 },
          },
          trace: {
            path: "trace.json",
            mediaType: "application/json",
            schema: { name: "trace-events", version: 1 },
          },
        },
      },
      {
        createRunId: () => "run-unsupported-artifact-schema",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      },
    );

    expect(() => validateArtifactBundleManifest(manifest)).toThrow(
      "Unsupported artifact schema for state: correction-state@2",
    );
  });

  it("round-trips a versioned manifest with explicit optional artifacts", () => {
    const manifest: ArtifactBundleManifest = {
      schemaVersion: 1,
      run: {
        id: "comparison-run-001",
        generatedAt: "2026-07-02T00:00:00.000Z",
        command: "demo:compare",
        mode: "comparison",
        provider: "deterministic-mock",
      },
      artifacts: {
        result: {
          path: "result.md",
          mediaType: "text/markdown",
          schema: null,
        },
        state: {
          path: "state.json",
          mediaType: "application/json",
          schema: { name: "correction-state", version: 1 },
        },
        trace: {
          path: "trace.json",
          mediaType: "application/json",
          schema: { name: "trace-events", version: 1 },
        },
        executionSummary: null,
        comparison: {
          path: "comparison.json",
          mediaType: "application/json",
          schema: { name: "correction-comparison", version: 1 },
        },
        savings: {
          path: "savings.json",
          mediaType: "application/json",
          schema: { name: "recompute-savings", version: 1 },
        },
        evaluation: null,
        scorecard: null,
        report: null,
      },
    };

    const serialized = serializeArtifactBundleManifest(manifest);
    const validated = validateArtifactBundleManifest(JSON.parse(serialized));

    expect({
      parsed: validated,
      endsWithNewline: serialized.endsWith("\n"),
    }).toEqual({
      parsed: manifest,
      endsWithNewline: true,
    });
  });

  it("creates a deterministic demo manifest with injected run identity", () => {
    const manifest = createArtifactBundleManifest(
      {
        command: "demo",
        mode: "runtime",
        provider: "deterministic-mock",
        artifacts: {
          result: {
            path: "result.md",
            mediaType: "text/markdown",
            schema: null,
          },
          state: {
            path: "state.json",
            mediaType: "application/json",
            schema: { name: "correction-state", version: 1 },
          },
          trace: {
            path: "trace.json",
            mediaType: "application/json",
            schema: { name: "trace-events", version: 1 },
          },
        },
      },
      {
        createRunId: () => "demo-run-001",
        now: () => new Date("2026-07-02T00:00:00.000Z"),
      },
    );

    expect(validateArtifactBundleManifest(manifest)).toEqual({
      schemaVersion: 1,
      run: {
        id: "demo-run-001",
        generatedAt: "2026-07-02T00:00:00.000Z",
        command: "demo",
        mode: "runtime",
        provider: "deterministic-mock",
      },
      artifacts: {
        result: {
          path: "result.md",
          mediaType: "text/markdown",
          schema: null,
        },
        state: {
          path: "state.json",
          mediaType: "application/json",
          schema: { name: "correction-state", version: 1 },
        },
        trace: {
          path: "trace.json",
          mediaType: "application/json",
          schema: { name: "trace-events", version: 1 },
        },
        executionSummary: null,
        comparison: null,
        savings: null,
        evaluation: null,
        scorecard: null,
        report: null,
      },
    });
  });
});
