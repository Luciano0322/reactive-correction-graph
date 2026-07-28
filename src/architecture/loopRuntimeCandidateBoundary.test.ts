import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const candidateSourceFiles = [
  "src/runtime/signalNode.ts",
  "src/runtime/createCorrectionRuntime.ts",
  "src/runtime/correctionRuntimeAdapter.ts",
  "src/session/createCorrectionSession.ts",
  "src/trace/types.ts",
  "src/trace/createTraceCollector.ts",
  "src/trace/liveTraceEvents.ts",
  "src/agents/createAgentRuntimeSnapshotAdapter.ts",
  "src/agents/createTwoAgentCorrectionCoordinator.ts",
] as const;

const nodeBuiltins = new Set(
  builtinModules.map((specifier) => specifier.replace(/^node:/, "")),
);

type ForbiddenImportKind =
  | "correction"
  | "coordinator"
  | "langgraph"
  | "node"
  | "dom"
  | "react"
  | "vue";

type ImportViolation = {
  file: string;
  specifier: string;
  kind: ForbiddenImportKind;
};

describe("Loop Runtime candidate package boundary", () => {
  it("matches the published readiness audit for forbidden imports", async () => {
    const [sources, auditJson] = await Promise.all([
      Promise.all(
        candidateSourceFiles.map(async (file) => ({
          file,
          source: await readFile(file, "utf8"),
        })),
      ),
      readFile(
        "docs/rfcs/signal-kernel-loop-runtime-readiness-audit.json",
        "utf8",
      ),
    ]);
    const violations = sources.flatMap(({ file, source }) =>
      collectModuleSpecifiers(file, source).flatMap((specifier) => {
        const kind = classifyForbiddenImport(specifier);
        return kind === null ? [] : [{ file, specifier, kind }];
      }),
    );
    const audit = JSON.parse(auditJson) as {
      architecture: {
        status: "passed" | "blocked";
        candidateSourceFiles: string[];
        violations: ImportViolation[];
      };
    };

    expect({
      status: violations.length === 0 ? "passed" : "blocked",
      candidateSourceFiles: [...candidateSourceFiles],
      violations,
    }).toEqual(audit.architecture);
  });
});

function collectModuleSpecifiers(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function classifyForbiddenImport(
  specifier: string,
): ForbiddenImportKind | null {
  const normalized = specifier.toLowerCase().replaceAll("\\", "/");
  const packageRoot = normalized.startsWith("@")
    ? normalized.split("/").slice(0, 2).join("/")
    : normalized.split("/")[0]!;

  if (normalized.includes("correction")) return "correction";
  if (normalized.includes("coordinator")) return "coordinator";
  if (
    normalized.startsWith("@langchain/langgraph") ||
    normalized.startsWith("@langchain/core")
  ) {
    return "langgraph";
  }
  if (
    normalized.startsWith("node:") ||
    nodeBuiltins.has(packageRoot)
  ) {
    return "node";
  }
  if (
    ["react-dom", "@types/react-dom", "jsdom", "linkedom", "happy-dom"].includes(
      packageRoot,
    )
  ) {
    return "dom";
  }
  if (packageRoot === "react" || packageRoot === "@types/react") return "react";
  if (
    packageRoot === "vue" ||
    packageRoot === "@types/vue" ||
    normalized.startsWith("@vue/")
  ) {
    return "vue";
  }

  return null;
}
