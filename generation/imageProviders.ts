import { fal } from "@fal-ai/client";
import type { CompiledPrompt, ImageGenerationOptions, ImageGenerationResult } from "./types";

export type ImageProvider = {
  id: "mock" | "fal";
  generate(compiled: CompiledPrompt, options?: ImageGenerationOptions): Promise<ImageGenerationResult>;
};

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

    if (options?.sourceImage) {
      const sourceImageUrl = await fal.storage.upload(options.sourceImage, {
        lifecycle: { expiresIn: "1d" }
      });

      const response = await fal.subscribe("fal-ai/flux-kontext/dev", {
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
        logs: true
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

    const response = await fal.subscribe("fal-ai/flux/dev", {
      input: {
        prompt: compiled.prompt,
        image_size: "portrait_4_3",
        num_images: 1,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        output_format: "png",
        enable_safety_checker: true
      },
      logs: true
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
