import { fal } from "@fal-ai/client";
import type { CompiledPrompt, ImageGenerationOptions, ImageGenerationResult } from "./types";

const DEFAULT_FAL_TIMEOUT_MS = 55_000;

export type ImageProvider = {
  id: "mock" | "fal";
  generate(compiled: CompiledPrompt, options?: ImageGenerationOptions): Promise<ImageGenerationResult>;
};

export class FalProviderError extends Error {
  fallback: ImageGenerationResult;

  constructor(message: string, fallback: ImageGenerationResult, cause?: unknown) {
    super(message);
    this.name = "FalProviderError";
    this.fallback = fallback;
    this.cause = cause;
  }
}

function falTimeoutMs() {
  const parsed = Number(process.env.FAL_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FAL_TIMEOUT_MS;
}

async function withTimeout<T>(label: string, operation: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeoutMs = falTimeoutMs();
  let timeout: ReturnType<typeof setTimeout>;

  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort(`${label} timed out after ${timeoutMs}ms`);
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeout!);
  }
}

function falFailureResult(compiled: CompiledPrompt, options: ImageGenerationOptions | undefined, message: string) {
  return {
    provider: "fal",
    status: "failed",
    mode: options?.sourceImage ? "image-to-image" : "text-to-image",
    imageUrl: null,
    prompt: compiled.prompt,
    negativePrompt: compiled.negativePrompt,
    caption: compiled.caption,
    rawProviderResponse: null,
    meta: {
      error: message,
      fallback: true
    }
  } satisfies ImageGenerationResult;
}

const mockProvider: ImageProvider = {
  id: "mock",
  async generate(compiled, options) {
    const mode = options?.sourceImage ? "image-to-image" : "text-to-image";

    return {
      provider: "mock",
      status: "mock",
      mode,
      imageUrl: null,
      prompt: compiled.prompt,
      negativePrompt: compiled.negativePrompt,
      caption: compiled.caption,
      rawProviderResponse: null,
      meta: {
        note: "Mock provider active. Add FAL_KEY to .env.local and select Fal to generate real Flux images.",
        requestedMode: mode
      }
    };
  }
};

const falProvider: ImageProvider = {
  id: "fal",
  async generate(compiled, options) {
    const falKey = process.env.FAL_KEY;
    const requestedMode = options?.sourceImage ? "image-to-image" : "text-to-image";

    if (!falKey) {
      console.warn("[imageProviders:fAL] Missing FAL_KEY; falling back to mock provider.");
      const fallback = await mockProvider.generate(compiled, options);
      return {
        ...fallback,
        meta: {
          ...fallback.meta,
          requestedProvider: "fal",
          fallbackReason: "FAL_KEY is missing. Using mock provider instead."
        }
      };
    }

    fal.config({ credentials: falKey });

    try {
      if (options?.sourceImage) {
        console.info("[imageProviders:fAL] Uploading source image to Fal storage.", {
          imageBytes: options.sourceImage.size,
          imageType: options.sourceImage.type || "unknown"
        });

        const sourceImageUrl = await withTimeout("Fal upload", () =>
          fal.storage.upload(options.sourceImage as Blob, {
            lifecycle: { expiresIn: "1d" }
          })
        );

        console.info("[imageProviders:fAL] Starting Flux Kontext generation.", {
          model: "fal-ai/flux-kontext/dev",
          promptLength: compiled.prompt.length
        });

        const response = await withTimeout("Fal Kontext generation", (signal) =>
          fal.subscribe("fal-ai/flux-kontext/dev", {
            input: {
              prompt: compiled.prompt,
              image_url: sourceImageUrl,
              resolution_mode: "match_input",
              num_images: 1,
              num_inference_steps: 28,
              guidance_scale: 2.5,
              output_format: "png",
              enable_safety_checker: true
            },
            logs: true,
            abortSignal: signal
          })
        );

        console.info("[imageProviders:fAL] Flux Kontext generation complete.", {
          requestId: response.requestId,
          imageCount: response.data.images?.length ?? 0
        });

        return {
          provider: "fal",
          status: "complete",
          mode: "image-to-image",
          imageUrl: response.data.images?.[0]?.url ?? null,
          prompt: compiled.prompt,
          negativePrompt: compiled.negativePrompt,
          caption: compiled.caption,
          rawProviderResponse: response,
          meta: {
            model: "fal-ai/flux-kontext/dev",
            requestId: response.requestId,
            sourceImageUrl
          }
        };
      }

      console.info("[imageProviders:fAL] Starting Flux text-to-image generation.", {
        model: "fal-ai/flux/dev",
        promptLength: compiled.prompt.length
      });

      const response = await withTimeout("Fal Flux generation", (signal) =>
        fal.subscribe("fal-ai/flux/dev", {
          input: {
            prompt: compiled.prompt,
            image_size: "portrait_4_3",
            num_images: 1,
            num_inference_steps: 28,
            guidance_scale: 3.5,
            output_format: "png",
            enable_safety_checker: true
          },
          logs: true,
          abortSignal: signal
        })
      );

      console.info("[imageProviders:fAL] Flux text-to-image generation complete.", {
        requestId: response.requestId,
        imageCount: response.data.images?.length ?? 0
      });

      return {
        provider: "fal",
        status: "complete",
        mode: requestedMode,
        imageUrl: response.data.images?.[0]?.url ?? null,
        prompt: compiled.prompt,
        negativePrompt: compiled.negativePrompt,
        caption: compiled.caption,
        rawProviderResponse: response,
        meta: {
          model: "fal-ai/flux/dev",
          requestId: response.requestId
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fal generation failed.";
      console.error("[imageProviders:fAL] Fal provider failed.", {
        message,
        mode: requestedMode,
        promptLength: compiled.prompt.length
      });
      throw new FalProviderError(message, falFailureResult(compiled, options, message), error);
    }
  }
};

export function getImageProvider(providerId = "mock"): ImageProvider {
  switch (providerId) {
    case "fal":
      return falProvider;
    case "mock":
    default:
      return mockProvider;
  }
}
