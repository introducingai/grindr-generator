import { loadModuleManifest } from "@/generation/moduleLoader";
import { randomizeSelectionFromManifest } from "@/generation/randomizerCore";
import { GeneratorConsole } from "@/components/GeneratorConsole";

export default async function GeneratePage() {
  const manifest = await loadModuleManifest();
  const initialSelection = randomizeSelectionFromManifest(manifest);

  return <GeneratorConsole initialManifest={manifest} initialSelection={initialSelection} />;
}
