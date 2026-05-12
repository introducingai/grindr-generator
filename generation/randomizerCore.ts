import type { ModuleManifest, PromptSelection } from "./types";

function pick<T>(items: T[]): T {
  if (items.length === 0) {
    throw new Error("Cannot randomize from an empty module list.");
  }

  return items[Math.floor(Math.random() * items.length)];
}

function pickMany<T>(items: T[], count: number): T[] {
  return [...items].sort(() => Math.random() - 0.5).slice(0, Math.min(count, items.length));
}

export function randomizeSelectionFromManifest(manifest: ModuleManifest): PromptSelection {
  return {
    formatId: pick(manifest.formats).id,
    archetypeIds: pickMany(manifest.archetypes, Math.random() > 0.72 ? 2 : 1).map((item) => item.id),
    themeId: pick(manifest.themes).id,
    styleId: pick(manifest.styles).id,
    cameraId: pick(manifest.cameras).id,
    symbolIds: pickMany(manifest.symbols, 2).map((item) => item.id),
    slogan: pick(manifest.slogans.length ? manifest.slogans : ["WE EXTRACT"]),
    tokenTicker: "$GRINDR",
    chaosLevel: Math.floor(Math.random() * 10) + 1
  };
}
