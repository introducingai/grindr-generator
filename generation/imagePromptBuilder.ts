import { compileFromSelection } from "./promptCompiler";
import type { CompiledPrompt, PromptSelection } from "./types";

export async function buildImagePrompt(selection: PromptSelection): Promise<CompiledPrompt> {
  return compileFromSelection(selection);
}

export { buildGrindrifyPrompt } from "./grindrifyPrompt";
