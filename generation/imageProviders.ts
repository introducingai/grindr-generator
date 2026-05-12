import { ApiError, createFalClient, fal, type FalClient } from "@fal-ai/client";
import type { CompiledPrompt, ImageGenerationOptions, ImageGenerationResult } from "./types";
import { applyTextOverlay } from "./textOverlay";

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
    overlayText: compiled.overlayText,
    rawProviderResponse: null,
    meta: {
      error: message,
      fallback: true
    }
  } satisfies ImageGenerationResult;
}

function shortPrompt(prompt: string) {
  const core = prompt
    .split(/\n{2,}/)
    .filter((block) =>
      /Transform|Create|User brief|Preset|Slogan|Style|Make it absurd|viral|Crypto Twitter/i.test(block)
    )
    .join("\n\n");

  const compact = core || prompt;
  return compact.length > 1800 ? `${compact.slice(0, 1800)}\n\nMake it readable, viral, satirical, neon pink/black.` : compact;
}

function retryCompiledPrompt(compiled: CompiledPrompt): CompiledPrompt {
  return {
    ...compiled,
    prompt: shortPrompt(compiled.prompt)
  };
}

async function readResponseText(response: Response) {
  const clone = response.clone();
  const contentType = response.headers.get("content-type") || "unknown";
  let body = "";

  try {
    body = await clone.text();
  } catch (error) {
    body = error instanceof Error ? `Could not read response body: ${error.message}` : "Could not read response body.";
  }

  return {
    status: response.status,
    contentType,
    body,
    bodyPreview: body.slice(0, 1200)
  };
}

async function falResponseHandler<Output>(response: Response): Promise<Output> {
  const preview = await readResponseText(response);

  if (!response.ok) {
    console.error("[imageProviders:fAL] Fal returned non-OK response.", preview);
    throw new Error(`Fal returned ${preview.status}: ${preview.bodyPreview || "empty response"}`);
  }

  if (!preview.contentType.includes("application/json")) {
    console.error("[imageProviders:fAL] Fal returned non-JSON response.", preview);
    throw new Error(`Fal returned non-JSON response (${preview.contentType}).`);
  }

  try {
    return JSON.parse(preview.body) as Output;
  } catch (error) {
    console.error("[imageProviders:fAL] Fal returned malformed JSON response.", preview);
    const message = error instanceof Error ? error.message : "Malformed provider JSON.";
    throw new Error(`Fal returned malformed JSON: ${message}`);
  }
}

function logFalError(error: unknown) {
  const base = {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    cause: error instanceof Error && error.cause ? String(error.cause) : null
  };

  if (error instanceof ApiError) {
    console.error("[imageProviders:fAL] Fal ApiError.", {
      ...base,
      status: error.status,
      requestId: error.requestId,
      bodyPreview: JSON.stringify(error.body).slice(0, 1200)
    });
    return;
  }

  console.error("[imageProviders:fAL] Fal unknown error.", base);
}

function assertFalImageResponse(response: { data?: { images?: Array<{ url?: string }> } }) {
  if (!response?.data || !Array.isArray(response.data.images)) {
    console.error("[imageProviders:fAL] Fal response missing data.images.", {
      responsePreview: JSON.stringify(response).slice(0, 1200)
    });
    throw new Error("Fal returned a malformed response: missing data.images.");
  }
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
    overlayText: compiled.overlayText,
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
    const generationFal = createFalClient({ credentials: falKey, responseHandler: falResponseHandler });

    try {
      if (options?.sourceImage) {
        console.info("[imageProviders:fAL] Uploading source image to Fal storage.", {
          imageBytes: options.sourceImage.size,
          imageType: options.sourceImage.type || "unknown"
        });

        let sourceImageUrl: string;
        try {
          sourceImageUrl = await withTimeout("Fal upload", () =>
            fal.storage.upload(options.sourceImage as Blob, {
              lifecycle: { expiresIn: "1d" }
            })
          );
        } catch (error) {
          console.error("[imageProviders:fAL] Fal storage upload failed.");
          logFalError(error);
          throw error;
        }

        console.info("[imageProviders:fAL] Starting Flux Kontext generation.", {
          model: "fal-ai/flux-kontext/dev",
          promptLength: compiled.prompt.length
        });

        let response;
        try {
          response = await runFalKontextWithRetry(generationFal, compiled, sourceImageUrl);
        } catch (error) {
          console.error("[imageProviders:fAL] Fal Kontext subscribe failed after retry.");
          logFalError(error);
          throw error;
        }
        assertFalImageResponse(response);

        console.info("[imageProviders:fAL] Flux Kontext generation complete.", {
          requestId: response.requestId,
          imageCount: response.data.images?.length ?? 0
        });

        const result = {
          provider: "fal",
          status: "complete",
          mode: "image-to-image",
          imageUrl: response.data.images?.[0]?.url ?? null,
          prompt: compiled.prompt,
          negativePrompt: compiled.negativePrompt,
          caption: compiled.caption,
          overlayText: compiled.overlayText,
          rawProviderResponse: response,
          meta: {
            model: "fal-ai/flux-kontext/dev",
            requestId: response.requestId,
            sourceImageUrl
          }
        } satisfies ImageGenerationResult;

        return applyTextOverlay(result, compiled);
      }

      console.info("[imageProviders:fAL] Starting Flux text-to-image generation.", {
        model: "fal-ai/flux/dev",
        promptLength: compiled.prompt.length
      });

      let response;
      try {
        response = await runFalTextWithRetry(generationFal, compiled);
      } catch (error) {
        console.error("[imageProviders:fAL] Fal Flux subscribe failed after retry.");
        logFalError(error);
        throw error;
      }
      assertFalImageResponse(response);

      console.info("[imageProviders:fAL] Flux text-to-image generation complete.", {
        requestId: response.requestId,
        imageCount: response.data.images?.length ?? 0
      });

      const result = {
        provider: "fal",
        status: "complete",
        mode: requestedMode,
        imageUrl: response.data.images?.[0]?.url ?? null,
        prompt: compiled.prompt,
        negativePrompt: compiled.negativePrompt,
        caption: compiled.caption,
        overlayText: compiled.overlayText,
        rawProviderResponse: response,
        meta: {
          model: "fal-ai/flux/dev",
          requestId: response.requestId
        }
      } satisfies ImageGenerationResult;

      return applyTextOverlay(result, compiled);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fal generation failed.";
      logFalError(error);
      console.error("[imageProviders:fAL] Fal provider failed.", {
        message,
        mode: requestedMode,
        promptLength: compiled.prompt.length
      });
      throw new FalProviderError(message, falFailureResult(compiled, options, message), error);
    }
  }
};

async function runFalKontext(generationFal: FalClient, compiled: CompiledPrompt, sourceImageUrl: string) {
  return withTimeout("Fal Kontext generation", (signal) =>
    generationFal.subscribe("fal-ai/flux-kontext/dev", {
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
}

async function runFalKontextWithRetry(generationFal: FalClient, compiled: CompiledPrompt, sourceImageUrl: string) {
  try {
    return await runFalKontext(generationFal, compiled, sourceImageUrl);
  } catch (error) {
    logFalError(error);
    const retry = retryCompiledPrompt(compiled);
    console.warn("[imageProviders:fAL] Retrying Flux Kontext with shorter prompt.", {
      originalLength: compiled.prompt.length,
      retryLength: retry.prompt.length
    });
    return runFalKontext(generationFal, retry, sourceImageUrl);
  }
}

async function runFalText(generationFal: FalClient, compiled: CompiledPrompt) {
  return withTimeout("Fal Flux generation", (signal) =>
    generationFal.subscribe("fal-ai/flux/dev", {
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
}

async function runFalTextWithRetry(generationFal: FalClient, compiled: CompiledPrompt) {
  try {
    return await runFalText(generationFal, compiled);
  } catch (error) {
    logFalError(error);
    const retry = retryCompiledPrompt(compiled);
    console.warn("[imageProviders:fAL] Retrying Flux text-to-image with shorter prompt.", {
      originalLength: compiled.prompt.length,
      retryLength: retry.prompt.length
    });
    return runFalText(generationFal, retry);
  }
}

export function getImageProvider(providerId = "mock"): ImageProvider {
  switch (providerId) {
    case "fal":
      return falProvider;
    case "mock":
    default:
      return mockProvider;
  }
}
