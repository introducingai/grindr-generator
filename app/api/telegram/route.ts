import { NextResponse } from "next/server";
import sharp from "sharp";
import { buildGrindrifyPrompt } from "@/generation/grindrifyPrompt";
import { loadPresets } from "@/generation/moduleLoader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_GENERATIONS_PER_HOUR = 3;
const ONE_HOUR_MS = 60 * 60 * 1000;
const DEFAULT_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const TELEGRAM_DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024;
const TELEGRAM_IMAGE_MAX_SIDE = 1200;
const TELEGRAM_IMAGE_JPEG_QUALITY = 80;
const generationBuckets = new Map<number, number[]>();

type TelegramPhotoSize = {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
};

type TelegramMessage = {
  message_id: number;
  chat: { id: number };
  from?: { id: number; username?: string; first_name?: string };
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  reply_to_message?: TelegramMessage;
};

type TelegramUpdate = {
  message?: TelegramMessage;
};

function telegramApiUrl(method: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN.");
  }

  return `https://api.telegram.org/bot${token}/${method}`;
}

function envFlag(name: string, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function adminIds() {
  return new Set(
    (process.env.TELEGRAM_ADMIN_IDS || "")
      .split(",")
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isFinite(id))
  );
}

function adminUsernames() {
  return new Set(
    (process.env.TELEGRAM_ADMIN_IDS || "")
      .split(",")
      .map((id) => id.trim().replace(/^@/, "").toLowerCase())
      .filter((id) => id && Number.isNaN(Number(id)))
  );
}

function isAdmin(message: TelegramMessage) {
  const userId = message.from?.id;
  const username = message.from?.username?.toLowerCase();
  return (
    (typeof userId === "number" && adminIds().has(userId)) ||
    (typeof username === "string" && adminUsernames().has(username))
  );
}

function isPublicBot() {
  return process.env.TELEGRAM_PUBLIC !== "false";
}

function maxImageBytes() {
  const parsed = Number(process.env.TELEGRAM_MAX_IMAGE_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_IMAGE_BYTES;
}

function isTelegramMessage(value: unknown): value is TelegramMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeMessage = value as Partial<TelegramMessage>;
  return typeof maybeMessage.message_id === "number" && typeof maybeMessage.chat?.id === "number";
}

function checkGenerationAccess(message: TelegramMessage) {
  if (isPublicBot() || isAdmin(message)) {
    return true;
  }

  return false;
}

function checkRateLimit(message: TelegramMessage) {
  const userId = message.from?.id ?? message.chat.id;
  if (typeof userId !== "number" || isAdmin(message)) {
    return { allowed: true };
  }

  const now = Date.now();
  const recent = (generationBuckets.get(userId) || []).filter((timestamp) => now - timestamp < ONE_HOUR_MS);

  if (recent.length >= MAX_GENERATIONS_PER_HOUR) {
    const resetAt = new Date(Math.min(...recent) + ONE_HOUR_MS);
    return { allowed: false, resetAt };
  }

  generationBuckets.set(userId, [...recent, now]);
  return { allowed: true };
}

async function telegramCall<T>(method: string, body: Record<string, unknown>): Promise<T> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn("[api/telegram] Missing TELEGRAM_BOT_TOKEN while attempting Telegram call.", { method });
  }

  const response = await fetch(telegramApiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram ${method} failed.`);
  }

  return payload.result as T;
}

async function telegramFormCall<T>(method: string, body: FormData): Promise<T> {
  const response = await fetch(telegramApiUrl(method), {
    method: "POST",
    body
  });
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram ${method} failed.`);
  }

  return payload.result as T;
}

async function replyText(message: TelegramMessage, text: string) {
  await telegramCall("sendMessage", {
    chat_id: message.chat.id,
    text,
    reply_to_message_id: message.message_id
  });
}

async function replyPhoto(message: TelegramMessage, imageUrl: string, caption: string) {
  if (imageUrl.startsWith("data:image/")) {
    const [header, base64] = imageUrl.split(",", 2);
    const mime = header.match(/^data:(.*?);base64$/)?.[1] || "image/png";
    const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
    const formData = new FormData();
    formData.append("chat_id", String(message.chat.id));
    formData.append("reply_to_message_id", String(message.message_id));
    formData.append("caption", caption);
    formData.append("photo", new Blob([bytes], { type: mime }), "grindr-output.png");
    await telegramFormCall("sendPhoto", formData);
    return;
  }

  await telegramCall("sendPhoto", {
    chat_id: message.chat.id,
    photo: imageUrl,
    caption,
    reply_to_message_id: message.message_id
  });
}

function commandText(message: TelegramMessage) {
  return message.caption || message.text || "";
}

function extractCommandText(message: TelegramMessage, command = "grindr") {
  const raw = message.caption || message.text || "";
  return raw.replace(new RegExp(`^/${command}(?:@\\w+)?`, "i"), "").trim();
}

function largestPhoto(message?: TelegramMessage) {
  const photos = message?.photo || [];
  return [...photos].sort((a, b) => (b.file_size || b.width * b.height) - (a.file_size || a.width * a.height))[0];
}

async function downloadTelegramPhoto(fileId: string): Promise<Blob> {
  console.info("[api/telegram] Downloading Telegram photo.", { fileId });
  const file = await telegramCall<{ file_path: string }>("getFile", { file_id: fileId });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);

  if (!fileResponse.ok) {
    throw new Error("Failed to download Telegram image.");
  }

  const blob = await fileResponse.blob();
  const firstBytes = Buffer.from(await blob.slice(0, 16).arrayBuffer()).toString("hex");
  console.info("[api/telegram] Telegram photo downloaded.", {
    size: blob.size,
    mimeType: blob.type || "unknown",
    contentType: fileResponse.headers.get("content-type") || "unknown",
    firstBytes
  });

  return blob;
}

async function compressTelegramImage(image: Blob): Promise<Blob> {
  const input = Buffer.from(await image.arrayBuffer());
  const firstBytes = input.subarray(0, 16).toString("hex");
  const imageInfo = await sharp(input).metadata().catch((error) => {
    console.error("[api/telegram] Sharp could not read Telegram image metadata.", {
      message: error instanceof Error ? error.message : String(error),
      inputBytes: input.byteLength,
      mimeType: image.type || "unknown",
      firstBytes
    });
    return null;
  });

  if (!image.type.startsWith("image/") && !imageInfo?.format) {
    throw new Error(`Telegram file is not a valid image. mime=${image.type || "unknown"} firstBytes=${firstBytes}`);
  }

  console.info("[api/telegram] Compressing Telegram image before Fal upload.", {
    inputBytes: input.byteLength,
    mimeType: image.type || "unknown",
    firstBytes,
    detectedFormat: imageInfo?.format || "unknown",
    width: imageInfo?.width || null,
    height: imageInfo?.height || null,
    maxSide: TELEGRAM_IMAGE_MAX_SIDE,
    quality: TELEGRAM_IMAGE_JPEG_QUALITY,
    outputType: "image/jpeg"
  });

  const output = await sharp(input)
    .rotate()
    .resize({
      width: TELEGRAM_IMAGE_MAX_SIDE,
      height: TELEGRAM_IMAGE_MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true
    })
    .jpeg({ quality: TELEGRAM_IMAGE_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  console.info("[api/telegram] Telegram image compressed.", {
    inputBytes: input.byteLength,
    outputBytes: output.byteLength
  });

  return new Blob([output], { type: "image/jpeg" });
}

function appOrigin(request: Request) {
  const configured = process.env.APP_BASE_URL;
  if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) {
    return configured;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return configured || new URL(request.url).origin;
}

type GenerationApiPayload = {
  ok?: boolean;
  error?: string;
  imageUrl: string | null;
  prompt: string;
  caption?: string;
  provider: string;
  mode: string;
  status?: string;
};

async function callGenerationApi(
  request: Request,
  brief: string,
  sourceImage?: Blob,
  forcedMode?: "text-to-image" | "image-to-image"
): Promise<GenerationApiPayload> {
  const mode = forcedMode || (sourceImage ? "image-to-image" : "text-to-image");
  const formData = new FormData();
  formData.append("provider", process.env.GRINDR_IMAGE_PROVIDER || "fal");
  formData.append("mode", mode);
  formData.append("userBrief", brief || "make this a viral $GRINDR extraction meme");

  if (sourceImage && mode === "image-to-image") {
    formData.append("image", sourceImage, "telegram-source.jpg");
  }

  console.info("[api/telegram] Calling generation API.", {
    origin: appOrigin(request),
    mode,
    provider: process.env.GRINDR_IMAGE_PROVIDER || "fal",
    imageBytes: sourceImage?.size ?? 0
  });

  const response = await fetch(`${appOrigin(request)}/api/generate-image`, {
    method: "POST",
    body: formData
  });
  const payload = await response.json().catch(() => ({
    error: "Generation API returned a non-JSON response."
  }));

  if (!response.ok) {
    return {
      ok: false,
      error: payload.error || "Fal failed to generate the image.",
      imageUrl: payload.imageUrl ?? null,
      prompt: payload.prompt || "Prompt unavailable.",
      caption: payload.caption,
      provider: payload.provider || "fal",
      mode: payload.mode || mode,
      status: payload.status || "failed"
    };
  }

  return payload as GenerationApiPayload;
}

async function handleHelpCommand(message: TelegramMessage) {
  await replyText(
    message,
    [
      "$GRINDR Generator",
      "",
      "Use:",
      "/grindr <short brief>",
      "",
      "Examples:",
      "/grindr make him a fomo farmer",
      "/grindr luxury extraction ad",
      "/grindr schizo psyop poster",
      "/grindr dating profile",
      "/grindr internal leak",
      "",
      "Send a photo with /grindr in the caption, or reply to a photo with /grindr <brief>.",
      "Limit: 3 generations per hour."
    ].join("\n")
  );
}

async function handlePresetsCommand(message: TelegramMessage) {
  const presets = await loadPresets();
  await replyText(
    message,
    [
      "Available $GRINDR presets:",
      "",
      ...presets.map((preset) => `- ${preset.id}`),
      "",
      "You usually do not need to pick one. The machine infers the recipe from your brief."
    ].join("\n")
  );
}

async function handleLogOnlyCommand(message: TelegramMessage, brief: string, hasImage: boolean) {
  const compiled = await buildGrindrifyPrompt({
    userBrief: brief || "make this a viral $GRINDR extraction meme",
    imageMode: hasImage
  });

  await replyText(
    message,
    [`LOG_ONLY mode active. Prompt compiled:`, "", compiled.prompt, "", `Negative: ${compiled.negativePrompt}`].join(
      "\n"
    )
  );
}

async function handleGrindrCommand(request: Request, message: TelegramMessage) {
  console.info("[api/telegram] Handling /grindr command.", {
    chatId: message.chat.id,
    userId: message.from?.id ?? null,
    public: isPublicBot(),
    logOnly: envFlag("TELEGRAM_LOG_ONLY")
  });

  if (!checkGenerationAccess(message)) {
    await replyText(message, "This bot is currently private. Ask an admin to add your Telegram user ID.");
    return;
  }

  const brief = extractCommandText(message);
  const photo = largestPhoto(message) || largestPhoto(message.reply_to_message);
  const maxBytes = maxImageBytes();

  if (photo?.file_size && photo.file_size > TELEGRAM_DOWNLOAD_MAX_BYTES) {
    console.warn("[api/telegram] Telegram photo rejected before download.", {
      chatId: message.chat.id,
      fileSize: photo.file_size,
      maxBytes: TELEGRAM_DOWNLOAD_MAX_BYTES
    });
    await replyText(
      message,
      `That image is too large to process. Please send something under ${Math.floor(
        TELEGRAM_DOWNLOAD_MAX_BYTES / 1024 / 1024
      )}MB.`
    );
    return;
  }

  if (envFlag("TELEGRAM_LOG_ONLY")) {
    await handleLogOnlyCommand(message, brief, Boolean(photo));
    return;
  }

  const rateLimit = checkRateLimit(message);
  if (!rateLimit.allowed) {
    await replyText(
      message,
      `The machine is cooling down. You get 3 generations per hour. Try again after ${rateLimit.resetAt?.toLocaleTimeString(
        "en-US",
        { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }
      )}.`
    );
    return;
  }

  await telegramCall("sendChatAction", {
    chat_id: message.chat.id,
    action: "upload_photo"
  });

  const downloadedImage = photo ? await downloadTelegramPhoto(photo.file_id) : undefined;
  const sourceImage = downloadedImage ? await compressTelegramImage(downloadedImage) : undefined;

  if (sourceImage && sourceImage.size > maxBytes) {
    console.warn("[api/telegram] Telegram photo rejected after download.", {
      chatId: message.chat.id,
      imageBytes: sourceImage.size,
      maxBytes
    });
    await replyText(
      message,
      `That image is too large for launch mode. Please send something under ${Math.floor(maxBytes / 1024 / 1024)}MB.`
    );
    return;
  }

  let result = await callGenerationApi(request, brief, sourceImage);

  if ((result.error || result.status === "failed") && sourceImage) {
    console.warn("[api/telegram] Image-to-image failed; retrying text-to-image fallback.", {
      chatId: message.chat.id,
      reason: result.error || "status failed"
    });
    const textOnlyResult = await callGenerationApi(request, brief, undefined, "text-to-image");

    if (textOnlyResult.imageUrl) {
      await replyPhoto(
        message,
        textOnlyResult.imageUrl,
        `image reference failed, cooked a text-only version instead\n\n${textOnlyResult.caption || "$GRINDR INDUSTRIES OUTPUT"}`
      );
      return;
    }

    result = {
      ...textOnlyResult,
      error: textOnlyResult.error || result.error || "Image reference failed and text-only fallback failed.",
      prompt: textOnlyResult.prompt || result.prompt
    };
  }

  if (result.error || result.status === "failed") {
    const debugPrompt = envFlag("TELEGRAM_DEBUG") ? ["", "Prompt:", result.prompt].join("\n") : "";
    await replyText(
      message,
      [
        "Fal failed, but the machine still compiled the directive.",
        "",
        `Reason: ${result.error || "Provider returned no generated image."}`,
        debugPrompt
      ].join("\n")
    );
    return;
  }

  if (result.imageUrl) {
    await replyPhoto(message, result.imageUrl, result.caption || "$GRINDR INDUSTRIES OUTPUT");
    return;
  }

  await telegramCall("sendMessage", {
    chat_id: message.chat.id,
    text: `Mock mode active. Prompt compiled:\n\n${result.prompt}`,
    reply_to_message_id: message.message_id
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    command: "/grindr <brief>",
    commands: ["/grindr <brief>", "/help", "/presets"],
    public: isPublicBot(),
    logOnly: envFlag("TELEGRAM_LOG_ONLY"),
    note: "Set TELEGRAM_BOT_TOKEN and webhook this route to enable the Telegram MVP."
  });
}

export async function POST(request: Request) {
  try {
    const update = (await request.json().catch((error) => {
      const message = error instanceof Error ? error.message : "Invalid JSON.";
      console.warn("[api/telegram] Ignoring malformed JSON update.", { message });
      return null;
    })) as TelegramUpdate | null;

    if (!update || typeof update !== "object") {
      return NextResponse.json({ ok: true, ignored: true, reason: "malformed_update" });
    }

    const message = isTelegramMessage(update.message) ? update.message : undefined;
    const text = message ? commandText(message) : "";

    if (!message) {
      console.info("[api/telegram] Ignoring unsupported or malformed Telegram update.");
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (/^\/help(?:@\w+)?(?:\s|$)/i.test(text) || /^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
      await handleHelpCommand(message);
      return NextResponse.json({ ok: true });
    }

    if (/^\/presets(?:@\w+)?(?:\s|$)/i.test(text)) {
      await handlePresetsCommand(message);
      return NextResponse.json({ ok: true });
    }

    if (/^\/grindr(?:@\w+)?(?:\s|$)/i.test(text)) {
      try {
        await handleGrindrCommand(request, message);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown provider error.";
        await replyText(
          message,
          `Fal choked before a prompt response came back. Try a shorter brief or a smaller image.\n\nDetail: ${detail}`
        );
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Telegram bot error.";
    console.error("[api/telegram] Webhook handling failed without crashing.", { message });
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
