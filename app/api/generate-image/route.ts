import { NextResponse } from "next/server";
import { buildGrindrifyPrompt, buildImagePrompt } from "@/generation/imagePromptBuilder";
import { FalProviderError, getImageProvider } from "@/generation/imageProviders";
import { randomizeSelection } from "@/generation/randomizer";
import type { ImageGenerationOptions, PromptSelection } from "@/generation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function apiError(message: string, status = 400, details?: Record<string, unknown>) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      details: details || null
    },
    { status }
  );
}

function safeProvider(provider?: string) {
  return provider === "fal" || provider === "mock" ? provider : "mock";
}

function validateImage(file: File | null) {
  if (!file) {
    return null;
  }

  if (!file.type.startsWith("image/")) {
    return `Uploaded file must be an image. Received ${file.type || "unknown file type"}.`;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return `Uploaded image is too large. Max size is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`;
  }

  return null;
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const contentType = request.headers.get("content-type") || "";
    console.info("[api/generate-image] Request received.", {
      requestId,
      contentType,
      falConfigured: Boolean(process.env.FAL_KEY)
    });

    let body: {
      selection?: Partial<PromptSelection>;
      randomize?: boolean;
      provider?: string;
      mode?: ImageGenerationOptions["mode"];
      preset?: string;
      userBrief?: string;
    };
    let sourceImage: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      console.info("[api/generate-image] Parsing multipart form data.", { requestId });

      let formData: FormData;
      try {
        formData = await request.formData();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to parse multipart form data.";
        console.error("[api/generate-image] Multipart parsing failed.", { requestId, message });
        return apiError("Could not read the uploaded form data. Please retry with a smaller image.", 400, {
          requestId
        });
      }

      const selectionJson = formData.get("selection");
      const uploadedImage = formData.get("image");
      let parsedSelection: Partial<PromptSelection> | undefined;

      if (typeof selectionJson === "string" && selectionJson.trim()) {
        try {
          parsedSelection = JSON.parse(selectionJson) as Partial<PromptSelection>;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid selection JSON.";
          console.error("[api/generate-image] Selection JSON parsing failed.", { requestId, message });
          return apiError("Invalid generation selection payload.", 400, { requestId });
        }
      }

      body = {
        selection: parsedSelection,
        randomize: formData.get("randomize") === "true",
        provider: safeProvider(String(formData.get("provider") || "mock")),
        mode: String(formData.get("mode") || "text-to-image") as ImageGenerationOptions["mode"],
        preset: String(formData.get("preset") || ""),
        userBrief: String(formData.get("userBrief") || "")
      };

      sourceImage = uploadedImage instanceof File && uploadedImage.size > 0 ? uploadedImage : null;
      console.info("[api/generate-image] Multipart parsed.", {
        requestId,
        provider: body.provider,
        hasImage: Boolean(sourceImage),
        imageBytes: sourceImage?.size ?? 0,
        imageType: sourceImage?.type || null,
        hasSelection: Boolean(body.selection),
        hasPresetBrief: Boolean(body.userBrief || body.preset)
      });
    } else {
      console.info("[api/generate-image] Parsing JSON body.", { requestId });
      body = (await request.json().catch(() => ({}))) as {
        selection?: Partial<PromptSelection>;
        randomize?: boolean;
        provider?: string;
        mode?: ImageGenerationOptions["mode"];
        preset?: string;
        userBrief?: string;
      };
      body.provider = safeProvider(body.provider);
    }

    if (body.provider === "fal" && !process.env.FAL_KEY) {
      console.warn("[api/generate-image] Fal requested but FAL_KEY is missing. Provider will fall back.", {
        requestId
      });
    }

    const imageError = validateImage(sourceImage);
    if (imageError) {
      console.warn("[api/generate-image] Upload validation failed.", {
        requestId,
        message: imageError,
        imageBytes: sourceImage?.size ?? 0,
        imageType: sourceImage?.type || null
      });
      return apiError(imageError, 413, { requestId, maxBytes: MAX_UPLOAD_BYTES });
    }

    const selection = body.randomize
      ? await randomizeSelection()
      : (body.selection as PromptSelection | undefined);

    const hasPresetBrief = Boolean(body.userBrief || body.preset);

    if (!selection && !hasPresetBrief) {
      return apiError("Missing generation selection or preset brief.", 400, { requestId });
    }

    const compiled = hasPresetBrief
      ? await buildGrindrifyPrompt({
          userBrief: body.userBrief || "make this a viral $GRINDR extraction meme",
          imageMode: Boolean(sourceImage),
          preset: body.preset || undefined
        })
      : await buildImagePrompt(selection as PromptSelection);

    console.info("[api/generate-image] Prompt compiled.", {
      requestId,
      provider: body.provider,
      mode: sourceImage ? "image-to-image" : body.mode || "text-to-image",
      promptLength: compiled.prompt.length,
      caption: compiled.caption
    });

    const provider = getImageProvider(body.provider);
    let result;

    try {
      result = await provider.generate(compiled, {
        mode: sourceImage ? "image-to-image" : body.mode,
        sourceImage
      });
    } catch (error) {
      if (error instanceof FalProviderError) {
        console.error("[api/generate-image] Returning Fal fallback JSON response.", {
          requestId,
          message: error.message
        });
        return NextResponse.json(
          {
            ok: false,
            error: "Fal failed to generate the image. Please try again with a shorter brief or smaller image.",
            requestId,
            ...error.fallback
          },
          { status: 502 }
        );
      }

      throw error;
    }

    console.info("[api/generate-image] Generation complete.", {
      requestId,
      provider: result.provider,
      status: result.status,
      hasImageUrl: Boolean(result.imageUrl)
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown generation error.";
    console.error("[api/generate-image] Request failed.", { requestId, message });
    return apiError("Generation failed. Please retry in a moment.", 500, { requestId, cause: message });
  }
}
