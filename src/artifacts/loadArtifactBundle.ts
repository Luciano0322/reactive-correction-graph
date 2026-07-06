import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateArtifactBundleManifest,
  type ArtifactBundleArtifacts,
  type ArtifactBundleManifest,
  type ArtifactReference,
} from "./artifactBundleManifest.js";

type ArtifactName = keyof ArtifactBundleArtifacts;

export type LoadedArtifact = ArtifactReference & {
  content: unknown;
};

export type LoadedArtifactBundle = {
  manifest: ArtifactBundleManifest;
  artifacts: Partial<Record<ArtifactName, LoadedArtifact>>;
};

export async function loadArtifactBundle(
  directory: string,
): Promise<LoadedArtifactBundle> {
  const manifestSource = await readFile(
    resolve(directory, "manifest.json"),
    "utf8",
  );
  const manifest = validateArtifactBundleManifest(JSON.parse(manifestSource));
  const artifacts: LoadedArtifactBundle["artifacts"] = {};

  for (const [name, reference] of Object.entries(manifest.artifacts) as Array<
    [ArtifactName, ArtifactReference | null]
  >) {
    if (reference === null) {
      continue;
    }

    const source = await readFile(resolve(directory, reference.path), "utf8");
    artifacts[name] = {
      ...reference,
      content:
        reference.mediaType === "application/json"
          ? JSON.parse(source)
          : source,
    };
  }

  return { manifest, artifacts };
}
