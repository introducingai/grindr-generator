export type JsonModule = {
  id: string;
  [key: string]: unknown;
};

export type ArchetypeModule = JsonModule & {
  role?: string;
  corporate_title?: string;
  traits?: string[];
  dialogue_style?: string;
  visuals?: string[];
  symbolic_function?: string;
  catchphrases?: string[];
};

export type FormatModule = JsonModule & {
  description?: string;
  composition?: string;
  text_density?: string;
  required_elements?: string[];
  best_for?: string[];
};

export type ThemeModule = JsonModule & {
  summary?: string;
  actions?: string[];
  slogans?: string[];
};

export type StyleModule = JsonModule & {
  palette?: string[];
  textures?: string[];
  composition?: string;
  mood?: string;
};

export type CameraModule = JsonModule & {
  description?: string;
  motion?: string;
  effects?: string[];
};

export type SymbolModule = JsonModule & {
  description?: string;
  associated_themes?: string[];
};

export type PromptSelection = {
  formatId: string;
  archetypeIds: string[];
  themeId: string;
  styleId: string;
  cameraId: string;
  symbolIds: string[];
  slogan?: string;
  tokenTicker?: string;
  chaosLevel?: number;
  userBrief?: string;
};

export type PromptModules = {
  format: FormatModule;
  archetypes: ArchetypeModule[];
  theme: ThemeModule;
  style: StyleModule;
  camera: CameraModule;
  symbols: SymbolModule[];
};

export type CompiledPrompt = {
  prompt: string;
  negativePrompt: string;
  caption: string;
  selection: PromptSelection;
  modules: PromptModules;
};

export type ModuleManifest = {
  archetypes: ArchetypeModule[];
  formats: FormatModule[];
  themes: ThemeModule[];
  styles: StyleModule[];
  cameras: CameraModule[];
  symbols: SymbolModule[];
  presets: PresetModule[];
  slogans: string[];
};

export type PresetModule = JsonModule & {
  archetype_pool: string[];
  format: string;
  theme: string;
  style: string;
  camera: string;
  symbols: string[];
  slogan_pool: string[];
  chaos_level: number;
  prompt_prefix: string;
  prompt_constraints: string[];
  negative_prompt: string[];
};

export type ImageGenerationResult = {
  provider: "mock" | "fal";
  status: "mock" | "queued" | "complete" | "failed";
  mode: "text-to-image" | "image-to-image";
  imageUrl: string | null;
  prompt: string;
  negativePrompt: string;
  caption: string;
  rawProviderResponse: unknown;
  meta: Record<string, unknown>;
};

export type ImageGenerationOptions = {
  mode?: "text-to-image" | "image-to-image";
  sourceImage?: Blob | File | null;
};

export type GrindrifyPromptInput = {
  userBrief: string;
  imageMode?: boolean;
  preset?: string;
};
