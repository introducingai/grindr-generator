import { NextResponse } from "next/server";
import { buildGrindrifyPrompt, buildImagePrompt } from "@/generation/imagePromptBuilder";
import { getImageProvider } from "@/generation/imageProviders";
import { randomizeSelection } from "@/generation/randomizer";
import type { ImageGenerationOptions, PromptSelection } from "@/generation/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
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
      const formData = await request.formData();
      const selectionJson = formData.get("selection");
      const uploadedImage = formData.get("image");

      body = {
        selection: typeof selectionJson === "string" ? JSON.parse(selectionJson) : undefined,
        randomize: formData.get("randomize") === "true",
        provider: String(formData.get("provider") || "mock"),
        mode: String(formData.get("mode") || "text-to-image") as ImageGenerationOptions["mode"],
        preset: String(formData.get("preset") || ""),
        userBrief: String(formData.get("userBrief") || "")
      };

      sourceImage = uploadedImage instanceof File && uploadedImage.size > 0 ? uploadedImage : null;
    } else {
      body = (await request.json().catch(() => ({}))) as {
        selection?: Partial<PromptSelection>;
        randomize?: boolean;
        provider?: string;
        mode?: ImageGenerationOptions["mode"];
        preset?: string;
        userBrief?: string;
      };
    }

    const selection = body.randomize
      ? await randomizeSelection()
      : (body.selection as PromptSelection | undefined);

    const hasPresetBrief = Boolean(body.userBrief || body.preset);

    if (!selection && !hasPresetBrief) {
      return NextResponse.json({ error: "Missing generation selection." }, { status: 400 });
    }

    const compiled = hasPresetBrief
      ? await buildGrindrifyPrompt({
          userBrief: body.userBrief || "make this a viral $GRINDR extraction meme",
          imageMode: Boolean(sourceImage),
          preset: body.preset || undefined
        })
      : await buildImagePrompt(selection as PromptSelection);
    const provider = getImageProvider(body.provider);
    const result = await provider.generate(compiled, {
      mode: sourceImage ? "image-to-image" : body.mode,
      sourceImage
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown generation error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
