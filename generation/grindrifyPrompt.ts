import { findById, loadModuleManifest } from "./moduleLoader";
import type { CompiledPrompt, GrindrifyPromptInput, PresetModule, PromptModules, PromptSelection } from "./types";

function pick<T>(items: T[]): T {
  if (items.length === 0) {
    throw new Error("Cannot pick from an empty preset pool.");
  }

  return items[Math.floor(Math.random() * items.length)];
}

function resolvePresetId(userBrief: string, requestedPreset?: string) {
  if (requestedPreset) {
    return requestedPreset;
  }

  const brief = userBrief.toLowerCase();

  if (brief.includes("schizo") || brief.includes("psyop") || brief.includes("collage")) {
    return "schizo_psyop";
  }

  if (brief.includes("luxury") || brief.includes("balenciaga") || brief.includes("campaign")) {
    return "luxury_campaign";
  }

  if (brief.includes("dating") || brief.includes("profile") || brief.includes("bio")) {
    return "dating_profile";
  }

  if (brief.includes("leak") || brief.includes("internal") || brief.includes("chat") || brief.includes("memo")) {
    return "internal_leak";
  }

  if (brief.includes("fomo") || brief.includes("farmer") || brief.includes("pump")) {
    return "fomo_engineering";
  }

  if (brief.includes("poster") || brief.includes("propaganda")) {
    return "propaganda_poster";
  }

  return "grindrify_default";
}

function presetSelection(preset: PresetModule, userBrief: string): PromptSelection {
  return {
    formatId: preset.format,
    archetypeIds: [pick(preset.archetype_pool)],
    themeId: preset.theme,
    styleId: preset.style,
    cameraId: preset.camera,
    symbolIds: preset.symbols,
    slogan: pick(preset.slogan_pool),
    tokenTicker: "$GRINDR",
    chaosLevel: preset.chaos_level,
    userBrief
  };
}

export async function buildGrindrifyPrompt({
  userBrief,
  imageMode = false,
  preset
}: GrindrifyPromptInput): Promise<CompiledPrompt> {
  const manifest = await loadModuleManifest();
  const presetId = resolvePresetId(userBrief, preset);
  const recipe = findById(manifest.presets, presetId, "preset");
  const selection = presetSelection(recipe, userBrief);

  const modules: PromptModules = {
    format: findById(manifest.formats, selection.formatId, "format"),
    archetypes: selection.archetypeIds.map((id) => findById(manifest.archetypes, id, "archetype")),
    theme: findById(manifest.themes, selection.themeId, "theme"),
    style: findById(manifest.styles, selection.styleId, "style"),
    camera: findById(manifest.cameras, selection.cameraId, "camera"),
    symbols: selection.symbolIds.map((id) => findById(manifest.symbols, id, "symbol"))
  };

  const archetype = modules.archetypes[0];
  const prompt = [
    recipe.prompt_prefix,
    imageMode
      ? "Transform the uploaded person or image into the subject of the meme. Preserve the recognizable composition and useful visual cues, but mutate the context into $GRINDR INDUSTRIES propaganda."
      : "Create an original $GRINDR meme image from the brief with no user-supplied source image.",
    `User brief: ${userBrief || "make this feel like a viral $GRINDR extraction meme"}.`,
    `Preset: ${recipe.id}. Format: ${modules.format.description || modules.format.id}.`,
    `Archetype to embody: ${archetype.id}, ${archetype.role}, ${archetype.corporate_title}. Traits: ${(archetype.traits || []).join(", ")}. Visual tells: ${(archetype.visuals || []).join(", ")}.`,
    `Theme: ${modules.theme.summary}. Actions: ${(modules.theme.actions || []).join(", ")}.`,
    `Symbols: ${modules.symbols.map((symbol) => symbol.description || symbol.id).join(", ")}.`,
    `Slogan/text: headline "${selection.slogan}", subtext "ATTENTION HARVESTING DIVISION", footer "GRINDR INDUSTRIES INTERNAL LEAK".`,
    `Style: ${(modules.style.palette || []).join(", ")} palette, ${(modules.style.textures || []).join(", ")} textures, ${modules.style.mood || "internet-poisoned luxury paranoia"}.`,
    `Camera: ${modules.camera.description || modules.camera.id}, ${(modules.camera.effects || []).join(", ")}.`,
    `Chaos level: ${selection.chaosLevel}/10.`,
    "Make it absurd, viral, darkly funny, neon pink/black, highly internet-poisoned, and visually legible at phone-screen size.",
    "It should feel like a screenshot people would instantly repost on Crypto Twitter because it is ridiculous but uncomfortably true.",
    ...recipe.prompt_constraints
  ].join("\n\n");

  return {
    prompt,
    negativePrompt: recipe.negative_prompt.join(", "),
    caption: `${selection.slogan} // ${recipe.id}`,
    selection,
    modules
  };
}

export { resolvePresetId };
