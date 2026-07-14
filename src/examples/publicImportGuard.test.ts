import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const referenceExamples = [
  "minimalSdkUsage.ts",
  "langGraphCheckpointUsage.ts",
  "langGraphReferenceWorkflow.ts",
  "langGraphPersistentSessionWorkflow.ts",
] as const;

describe("public import guard for reference examples", () => {
  it("keeps reference examples away from internal source paths", async () => {
    const importEntries = await Promise.all(
      referenceExamples.map(async (fileName) => ({
        fileName,
        specifiers: await readImportSpecifiers(fileName),
      })),
    );
    const forbiddenImports = importEntries.flatMap(
      ({ fileName, specifiers }) =>
        specifiers
          .filter(isForbiddenInternalImport)
          .map((specifier) => `${fileName}: ${specifier}`),
    );
    const referenceWorkflowImports =
      importEntries.find(
        ({ fileName }) => fileName === "langGraphReferenceWorkflow.ts",
      )?.specifiers ?? [];

    expect({
      forbiddenImports,
      referenceWorkflowImports: [...referenceWorkflowImports].sort(),
    }).toEqual({
      forbiddenImports: [],
      referenceWorkflowImports: [
        "@langchain/langgraph",
        "reactive-correction-graph",
      ],
    });
  });
});

async function readImportSpecifiers(fileName: string): Promise<string[]> {
  const source = await readFile(new URL(fileName, import.meta.url), "utf8");

  return Array.from(
    source.matchAll(/from\s+["']([^"']+)["']/g),
    ([, specifier]) => specifier,
  );
}

function isForbiddenInternalImport(specifier: string) {
  return (
    specifier.startsWith(".") ||
    specifier.includes("/src/") ||
    specifier.startsWith("reactive-correction-graph/")
  );
}
