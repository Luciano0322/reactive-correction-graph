import { exec } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execAsync = promisify(exec);

describe("demo CLI", () => {
  it("writes an explanatory correction narrative for the demo fixture", async () => {
    const cwd = process.cwd();
    const outputDir = resolve(cwd, ".output");
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

    await rm(outputDir, { recursive: true, force: true });
    await execAsync(`${pnpmCommand} demo ./src/examples/input.md`, {
      cwd,
      timeout: 10_000,
    });

    const resultMarkdown = await readFile(resolve(outputDir, "result.md"), "utf8");
    const traceJson = await readFile(resolve(outputDir, "trace.json"), "utf8");
    const stateJson = await readFile(resolve(outputDir, "state.json"), "utf8");

    const trace = JSON.parse(traceJson) as Array<{
      scope?: string;
      type?: string;
      label?: string;
    }>;
    const state = JSON.parse(stateJson) as {
      finalResult?: {
        revisedDraft?: string;
        summary?: string[];
        unresolvedIssues?: string[];
      };
    };

    expect(resultMarkdown).toContain("## Revised Draft");
    expect(resultMarkdown).toContain("Mock correction notes");
    expect(resultMarkdown).toContain("## Correction Summary");
    expect(resultMarkdown).toContain("## Unresolved Issues");
    expect(Array.isArray(trace)).toBe(true);
    expect(trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "effect",
          type: "emitted",
          label: "finalResult",
        }),
      ]),
    );
    expect(state.finalResult?.revisedDraft).toContain("Mock correction notes");
    expect(state.finalResult?.summary).toEqual(
      expect.arrayContaining([
        "Review claim claim-1: This claim is tentative and should be verified.",
        "Apply style guide: Use concise technical language for TypeScript developers.",
        "Respect user intent: Explain why reactive invalidation avoids unnecessary agent work.",
      ]),
    );
    expect(state.finalResult?.unresolvedIssues).toEqual([
      "This claim is tentative and should be verified.",
    ]);
  }, 20_000);

  it("isolates the fact-check signal in the fact-focused fixture", async () => {
    const cwd = process.cwd();
    const outputDir = resolve(cwd, ".output");
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

    await rm(outputDir, { recursive: true, force: true });
    await execAsync(
      `${pnpmCommand} demo ./src/examples/fact-correction.md`,
      { cwd, timeout: 10_000 },
    );

    const stateJson = await readFile(resolve(outputDir, "state.json"), "utf8");
    const state = JSON.parse(stateJson) as {
      finalResult?: {
        summary?: string[];
        unresolvedIssues?: string[];
      };
    };

    expect(state.finalResult).toMatchObject({
      summary: [
        "Review claim claim-1: This claim is tentative and should be verified.",
      ],
      unresolvedIssues: ["This claim is tentative and should be verified."],
    });
  }, 20_000);

  it("isolates the style signal in the style-focused fixture", async () => {
    const cwd = process.cwd();
    const outputDir = resolve(cwd, ".output");
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

    await rm(outputDir, { recursive: true, force: true });
    await execAsync(
      `${pnpmCommand} demo ./src/examples/style-correction.md`,
      { cwd, timeout: 10_000 },
    );

    const stateJson = await readFile(resolve(outputDir, "state.json"), "utf8");
    const state = JSON.parse(stateJson) as {
      finalResult?: {
        summary?: string[];
        unresolvedIssues?: string[];
      };
    };

    expect(state.finalResult).toMatchObject({
      summary: [
        "Apply style guide: Use short, direct sentences without repetition.",
      ],
      unresolvedIssues: [],
    });
  }, 20_000);

  it("writes graph and runtime trace artifacts in graph mode", async () => {
    const cwd = process.cwd();
    const outputDir = resolve(cwd, ".output");
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

    await rm(outputDir, { recursive: true, force: true });
    await execAsync(`${pnpmCommand} run demo:graph`, {
      cwd,
      timeout: 10_000,
    });

    const resultMarkdown = await readFile(resolve(outputDir, "result.md"), "utf8");
    const traceJson = await readFile(resolve(outputDir, "trace.json"), "utf8");
    const stateJson = await readFile(resolve(outputDir, "state.json"), "utf8");

    const trace = JSON.parse(traceJson) as Array<{
      scope?: string;
      type?: string;
      label?: string;
    }>;
    const state = JSON.parse(stateJson) as {
      finalResult?: {
        revisedDraft?: string;
      };
      trace?: typeof trace;
      graphTrace?: typeof trace;
    };

    expect({
      result: resultMarkdown,
      graphTrace: state.graphTrace,
      runtimeTrace: state.trace,
      traceArtifact: trace,
    }).toEqual({
      result: expect.stringContaining("Mock correction notes"),
      graphTrace: expect.arrayContaining([
        expect.objectContaining({
          scope: "graph",
          type: "started",
          label: "prepareInput",
        }),
        expect.objectContaining({
          scope: "graph",
          type: "completed",
          label: "finalize",
        }),
      ]),
      runtimeTrace: expect.arrayContaining([
        expect.objectContaining({
          scope: "effect",
          type: "emitted",
          label: "finalResult",
        }),
      ]),
      traceArtifact: state.trace,
    });
  }, 20_000);

  it("validates provider selection in graph mode", async () => {
    const cwd = process.cwd();
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

    await expect(
      execAsync(`${pnpmCommand} run demo:graph --provider unsupported`, {
        cwd,
        timeout: 10_000,
      }),
    ).rejects.toThrow(/Unsupported CORRECTION_MODEL: unsupported/);
  }, 20_000);

  it("writes an inspectable eager versus reactive comparison artifact", async () => {
    const cwd = process.cwd();
    const outputDir = resolve(cwd, ".output");
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

    await rm(outputDir, { recursive: true, force: true });
    const { stdout } = await execAsync(`${pnpmCommand} run demo:compare`, {
      cwd,
      timeout: 20_000,
    });

    const comparisonJson = await readFile(
      resolve(outputDir, "comparison.json"),
      "utf8",
    );
    const savingsJson = await readFile(
      resolve(outputDir, "savings.json"),
      "utf8",
    );
    const resultMarkdown = await readFile(resolve(outputDir, "result.md"), "utf8");
    const stateJson = await readFile(resolve(outputDir, "state.json"), "utf8");
    const traceJson = await readFile(resolve(outputDir, "trace.json"), "utf8");
    const report = JSON.parse(comparisonJson) as {
      provider?: string;
      scenarios?: Array<{
        scenario?: string;
        eager?: { factCheckCalls?: number };
        reactive?: { factCheckCalls?: number };
      }>;
    };
    const savingsReport = JSON.parse(savingsJson) as {
      schemaVersion?: number;
      scenarios?: Array<{
        scenario?: string;
        operations?: Array<{
          operation?: string;
          avoidedCalls?: number | null;
          reusedReceives?: number;
          supersededCalls?: number;
        }>;
      }>;
    };
    const state = JSON.parse(stateJson) as {
      finalResult?: { revisedDraft?: string };
      trace?: Array<{ scope?: string; type?: string; label?: string }>;
    };
    const trace = JSON.parse(traceJson) as typeof state.trace;
    const styleOnly = report.scenarios?.find(
      (scenario) => scenario.scenario === "style-only",
    );
    const claimChanging = report.scenarios?.find(
      (scenario) => scenario.scenario === "claim-changing",
    );
    const styleOnlySavings = savingsReport.scenarios?.find(
      (scenario) => scenario.scenario === "style-only",
    );
    const claimChangingSavings = savingsReport.scenarios?.find(
      (scenario) => scenario.scenario === "claim-changing",
    );
    const styleOnlyFactCheckSavings = styleOnlySavings?.operations?.find(
      (operation) => operation.operation === "factCheck",
    );
    const claimChangingFactCheckSavings =
      claimChangingSavings?.operations?.find(
        (operation) => operation.operation === "factCheck",
      );

    expect({
      provider: report.provider,
      styleOnlyFactChecks: {
        eager: styleOnly?.eager?.factCheckCalls,
        reactive: styleOnly?.reactive?.factCheckCalls,
      },
      claimChangingFactChecks: {
        eager: claimChanging?.eager?.factCheckCalls,
        reactive: claimChanging?.reactive?.factCheckCalls,
      },
      savingsSchemaVersion: savingsReport.schemaVersion,
      styleOnlyFactCheckSavings,
      claimChangingFactCheckSavings,
      resultMarkdown,
      finalResultProduced: Boolean(state.finalResult?.revisedDraft),
      traceMatchesState: trace === undefined
        ? false
        : JSON.stringify(trace) === JSON.stringify(state.trace),
      finalResultEmitted: trace?.some(
        (event) =>
          event.scope === "effect" &&
          event.type === "emitted" &&
          event.label === "finalResult",
      ),
      stdout,
    }).toEqual({
      provider: "deterministic-mock",
      styleOnlyFactChecks: { eager: 2, reactive: 1 },
      claimChangingFactChecks: { eager: 3, reactive: 2 },
      savingsSchemaVersion: 1,
      styleOnlyFactCheckSavings: expect.objectContaining({
        operation: "factCheck",
        avoidedCalls: 1,
        reusedReceives: 1,
        supersededCalls: 0,
      }),
      claimChangingFactCheckSavings: expect.objectContaining({
        operation: "factCheck",
        avoidedCalls: 0,
        reusedReceives: 0,
        supersededCalls: 0,
      }),
      resultMarkdown: expect.stringContaining("## Revised Draft"),
      finalResultProduced: true,
      traceMatchesState: true,
      finalResultEmitted: true,
      stdout: expect.stringMatching(
        /Recompute savings by update[\s\S]*style-only[\s\S]*factCheck avoided=1 reused=1 superseded=0[\s\S]*claim-changing[\s\S]*factCheck avoided=0 reused=0 superseded=0[\s\S]*not a general performance benchmark[\s\S]*savings\.json/,
      ),
    });
  }, 30_000);

  it("writes a local LLM evaluation report through evaluate:ollama", async () => {
    const cwd = process.cwd();
    const outputDir = resolve(cwd, ".output");
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const ollamaServer = await startFakeOllamaServer();

    try {
      await rm(outputDir, { recursive: true, force: true });
      const { stdout } = await execAsync(
        `${pnpmCommand} run evaluate:ollama`,
        {
          cwd,
          timeout: 20_000,
          env: {
            ...process.env,
            OLLAMA_BASE_URL: ollamaServer.baseUrl,
            OLLAMA_MODEL: "cli-evaluation-model",
            EVALUATION_TRIALS: "1",
          },
        },
      );
      const evaluationJson = await readFile(
        resolve(outputDir, "evaluation.json"),
        "utf8",
      );
      const report = JSON.parse(evaluationJson) as {
        provider?: string;
        trials?: Array<{
          fixture?: string;
          model?: string;
          status?: string;
        }>;
      };

      expect({
        provider: report.provider,
        trials: report.trials?.map((trial) => ({
          fixture: trial.fixture,
          model: trial.model,
          status: trial.status,
        })),
        stdout,
      }).toEqual({
        provider: "ollama",
        trials: [
          settledEvaluationTrial("explanatory-demo"),
          settledEvaluationTrial("fact-correction"),
          settledEvaluationTrial("style-correction"),
        ],
        stdout: expect.stringContaining("./.output/evaluation.json"),
      });
    } finally {
      await closeServer(ollamaServer.server);
    }
  }, 30_000);
});

function settledEvaluationTrial(fixture: string) {
  return {
    fixture,
    model: "cli-evaluation-model",
    status: "settled",
  };
}

async function startFakeOllamaServer() {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      prompt: string;
    };

    response.writeHead(200, {
      "content-type": "application/json",
      connection: "close",
    });
    response.end(
      JSON.stringify({
        response: fakeOllamaResponse(body.prompt),
        done: true,
      }),
    );
  });

  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function fakeOllamaResponse(prompt: string) {
  if (prompt.includes("Task: factCheckClaims")) {
    const claims = JSON.parse(prompt.split("Claims:\n")[1] ?? "[]") as Array<{
      id: string;
    }>;
    return JSON.stringify({
      items: claims.map((claim) => ({
        claimId: claim.id,
        verdict: "supported",
        note: "The CLI evaluation covered this claim.",
      })),
    });
  }

  if (prompt.includes("Task: reviewStyle")) {
    return JSON.stringify({ tone: "clear", suggestions: [] });
  }

  if (prompt.includes("Task: rewriteDraft")) {
    return "CLI evaluation rewrite completed.";
  }

  throw new Error(`Unexpected Ollama prompt: ${prompt}`);
}

async function closeServer(server: Server) {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}
