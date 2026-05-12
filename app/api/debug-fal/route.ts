import { fal } from "@fal-ai/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      cause: error.cause ? String(error.cause) : null,
      stack: error.stack?.slice(0, 1600) || null
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    cause: null,
    stack: null
  };
}

export async function GET() {
  if (!process.env.FAL_KEY) {
    return NextResponse.json(
      {
        ok: false,
        falConfigured: false,
        error: "Missing FAL_KEY"
      },
      { status: 500 }
    );
  }

  try {
    fal.config({ credentials: process.env.FAL_KEY });
    const result = await fal.subscribe("fal-ai/flux/dev", {
      input: {
        prompt: "pink neon $GRINDR test poster, no text",
        image_size: "square",
        num_images: 1,
        enable_safety_checker: true,
        output_format: "png"
      },
      logs: true
    });

    return NextResponse.json({
      ok: true,
      falConfigured: true,
      status: "complete",
      result
    });
  } catch (error) {
    console.error("[api/debug-fal] Fal debug call failed.", serializeError(error));
    return NextResponse.json(
      {
        ok: false,
        falConfigured: true,
        status: "failed",
        error: serializeError(error)
      },
      { status: 502 }
    );
  }
}
