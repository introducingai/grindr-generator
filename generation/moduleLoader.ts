import { promises as fs } from "fs";
import path from "path";
import type {
  ArchetypeModule,
  CameraModule,
  FormatModule,
  JsonModule,
  ModuleManifest,
  PresetModule,
  StyleModule,
  SymbolModule,
  ThemeModule
} from "./types";

const ROOT = process.cwd();

async function readJsonModules<T extends JsonModule>(directory: string): Promise<T[]> {
  const dir = path.join(ROOT, directory);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const modules = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const filePath = path.join(dir, entry.name);
        const raw = await fs.readFile(filePath, "utf8");
        return JSON.parse(raw) as T;
      })
  );

  return modules.filter((module) => typeof module.id === "string" && module.id.length > 0);
}

async function readSlogans(): Promise<string[]> {
  const dir = path.join(ROOT, "slogans");
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const slogans = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".txt"))
      .map(async (entry) => {
        const raw = await fs.readFile(path.join(dir, entry.name), "utf8");
        return raw
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
      })
  );

  return Array.from(new Set(slogans.flat()));
}

export async function loadArchetypes() {
  return readJsonModules<ArchetypeModule>("archetypes");
}

export async function loadFormats() {
  return readJsonModules<FormatModule>("formats");
}

export async function loadThemes() {
  return readJsonModules<ThemeModule>("themes");
}

export async function loadStyles() {
  return readJsonModules<StyleModule>("styles");
}

export async function loadCameras() {
  return readJsonModules<CameraModule>("camera");
}

export async function loadSymbols() {
  return readJsonModules<SymbolModule>("symbols");
}

export async function loadPresets() {
  return readJsonModules<PresetModule>("presets");
}

export async function loadModuleManifest(): Promise<ModuleManifest> {
  const [archetypes, formats, themes, styles, cameras, symbols, presets, slogans] = await Promise.all([
    loadArchetypes(),
    loadFormats(),
    loadThemes(),
    loadStyles(),
    loadCameras(),
    loadSymbols(),
    loadPresets(),
    readSlogans()
  ]);

  return { archetypes, formats, themes, styles, cameras, symbols, presets, slogans };
}

export function findById<T extends JsonModule>(modules: T[], id: string, type: string): T {
  const module = modules.find((candidate) => candidate.id === id);
  if (!module) {
    throw new Error(`Unknown ${type}: ${id}`);
  }

  return module;
}
