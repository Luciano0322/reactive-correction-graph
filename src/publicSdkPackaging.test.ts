import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type PackageJson = {
  main?: unknown;
  types?: unknown;
  exports?: unknown;
  scripts?: Record<string, unknown>;
};

type TsConfigJson = {
  compilerOptions?: Record<string, unknown>;
  exclude?: unknown;
};

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")) as T;
}

describe("public SDK packaging", () => {
  it("publishes a single built package root with declaration types", async () => {
    const packageJson = await readJson<PackageJson>("../package.json");
    const buildConfig = await readJson<TsConfigJson>(
      "../tsconfig.build.json",
    );

    expect({
      main: packageJson.main,
      types: packageJson.types,
      exports: packageJson.exports,
      build: packageJson.scripts?.build,
      buildTypes: packageJson.scripts?.["build:types"],
      declaration: buildConfig.compilerOptions?.declaration,
      declarationMap: buildConfig.compilerOptions?.declarationMap,
      excludedTests: buildConfig.exclude,
    }).toEqual({
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
        },
      },
      build: "tsc -p tsconfig.build.json",
      buildTypes: "tsc -p tsconfig.build.json --emitDeclarationOnly",
      declaration: true,
      declarationMap: true,
      excludedTests: [
        "src/**/*.test.ts",
        "src/**/*.manual.test.ts",
        "src/**/*.pw.ts",
      ],
    });
  });
});
