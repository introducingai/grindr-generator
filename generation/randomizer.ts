import { loadModuleManifest } from "./moduleLoader";
import type { PromptSelection } from "./types";
import { randomizeSelectionFromManifest } from "./randomizerCore";

export { randomizeSelectionFromManifest };

export async function randomizeSelection(): Promise<PromptSelection> {
  return randomizeSelectionFromManifest(await loadModuleManifest());
}
