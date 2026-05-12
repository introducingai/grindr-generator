import { findById, loadModuleManifest } from "./moduleLoader";
import type { CompiledPrompt, PromptModules, PromptSelection } from "./types";

function list(values: unknown): string {
  if (Array.isArray(values)) {
    return values.filter(Boolean).join(", ");
  }

  return typeof values === "string" ? values : "";
}

function clampChaos(level?: number) {
  if (typeof level !== "number" || Number.isNaN(level)) {
    return 5;
  }

  return Math.min(10, Math.max(1, Math.round(level)));
}

export function compileImagePrompt(selection: PromptSelection, modules: PromptModules): CompiledPrompt {
  const headline = selection.slogan || modules.theme.slogans?.[0] || "WE EXTRACT";
  const token = selection.tokenTicker?.trim() || "$GRINDR";
  const chaosLevel = clampChaos(selection.chaosLevel);
  const archetypeText = modules.archetypes
    .map((archetype) =>
      [
        `${archetype.id}: ${archetype.role}`,
        archetype.corporate_title,
        list(archetype.traits),
        `visual rules: ${list(archetype.visuals)}`,
        `symbolic function: ${archetype.symbolic_function}`,
        `dialogue energy: ${archetype.dialogue_style}`
      ]
        .filter(Boolean)
        .join("; ")
    )
    .join("\n");

  const symbolText = modules.symbols
    .map((symbol) => [symbol.description || symbol.id, list(symbol.associated_themes)].filter(Boolean).join("; "))
    .join(", ");

  const prompt = [
    `Create a ${modules.format.description || modules.format.id} in the $GRINDR universe.`,
    `Scene: ${modules.theme.summary || "attention converts into liquidity inside a neon black and pink extraction machine."}`,
    `Characters: ${archetypeText}`,
    `Action: ${list(modules.theme.actions) || "public conviction creates follower entry while operators quietly extract."}`,
    `Visual motifs: ${symbolText || "smartphones, private chats, chart candles, hidden wallets, glowing notifications."}`,
    `Branding: GRINDR INDUSTRIES, ${token}, cold corporate satire, luxury degeneracy, memecoin extraction culture.`,
    "Typography: leave clean dark poster space for typography overlays. Do not render exact words, slogans, captions, logos, or readable text inside the image.",
    `Camera and composition: ${modules.format.composition || "clear central composition"}, ${modules.camera.description || modules.camera.id}, ${list(modules.camera.effects)}.`,
    `Style: palette ${list(modules.style.palette)}, textures ${list(modules.style.textures)}, mood ${modules.style.mood || "seductive paranoid satire"}, chaos level ${chaosLevel}/10.`,
    selection.userBrief ? `User brief: ${selection.userBrief}` : "",
    "Make it visually readable, poster-worthy, satirical, self-aware, internet-poisoned, and not generic crypto marketing."
  ]
    .filter(Boolean)
    .join("\n\n");

  const negativePrompt = [
    "wholesome startup ad",
    "generic crypto coin logo",
    "clean sterile minimalism",
    "real person likeness",
    "hate symbols",
    "explicit sexual content",
    "unreadable main text",
    "AI-generated text",
    "misspelled typography",
    "rendered slogans",
    "watermarks",
    "photorealistic depiction of a real brand app interface"
  ].join(", ");

  return {
    prompt,
    negativePrompt,
    caption: `${headline} // ${modules.format.id} // ${modules.theme.id}`,
    overlayText: {
      headline,
      subtext: "ATTENTION HARVESTING DIVISION",
      footer: "GRINDR INDUSTRIES INTERNAL USE ONLY"
    },
    selection: { ...selection, chaosLevel },
    modules
  };
}

export async function compileFromSelection(selection: PromptSelection): Promise<CompiledPrompt> {
  const manifest = await loadModuleManifest();
  const modules: PromptModules = {
    format: findById(manifest.formats, selection.formatId, "format"),
    archetypes: selection.archetypeIds.map((id) => findById(manifest.archetypes, id, "archetype")),
    theme: findById(manifest.themes, selection.themeId, "theme"),
    style: findById(manifest.styles, selection.styleId, "style"),
    camera: findById(manifest.cameras, selection.cameraId, "camera"),
    symbols: selection.symbolIds.map((id) => findById(manifest.symbols, id, "symbol"))
  };

  return compileImagePrompt(selection, modules);
}
