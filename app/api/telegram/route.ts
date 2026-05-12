import { NextResponse } from "next/server";
import { buildGrindrifyPrompt } from "@/generation/grindrifyPrompt";
import { loadPresets } from "@/generation/moduleLoader";

export const dynamic = "force-dynamic";

const MAX_GENERATIONS_PER_HOUR = 3;
const ONE_HOUR_MS = 60 * 60 * 1000;
const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
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

function isAdmin(message: TelegramMessage) {
  const userId = message.from?.id;
  return typeof userId === "number" && adminIds().has(userId);
}

function isPublicBot() {
  return process.env.TELEGRAM_PUBLIC !== "false";
}

function maxImageBytes() {
  const parsed = Number(process.env.TELEGRAM_MAX_IMAGE_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_IMAGE_BYTES;
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

async function replyText(message: TelegramMessage, text: string) {
  await telegramCall("sendMessage", {
    chat_id: message.chat.id,
    text,
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
  const file = await telegramCall<{ file_path: string }>("getFile", { file_id: fileId });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);

  if (!fileResponse.ok) {
    throw new Error("Failed to download Telegram image.");
  }

  return fileResponse.blob();
}

function appOrigin(request: Request) {
  return process.env.APP_BASE_URL || new URL(request.url).origin;
}

async function callGenerationApi(request: Request, brief: string, sourceImage?: Blob) {
  const formData = new FormData();
  formData.append("provider", process.env.GRINDR_IMAGE_PROVIDER || "fal");
  formData.append("mode", sourceImage ? "image-to-image" : "text-to-image");
  formData.append("userBrief", brief || "make this a viral $GRINDR extraction meme");

  if (sourceImage) {
    formData.append("image", sourceImage, "telegram-source.jpg");
  }

  const response = await fetch(`${appOrigin(request)}/api/generate-image`, {
    method: "POST",
    body: formData
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Fal failed to generate the image.");
  }

  return payload as { imageUrl: string | null; prompt: string; caption?: string; provider: string; mode: string };
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
  if (!checkGenerationAccess(message)) {
    await replyText(message, "This bot is currently private. Ask an admin to add your Telegram user ID.");
    return;
  }

  const brief = extractCommandText(message);
  const photo = largestPhoto(message) || largestPhoto(message.reply_to_message);
  const maxBytes = maxImageBytes();

  if (photo?.file_size && photo.file_size > maxBytes) {
    await replyText(
      message,
      `That image is too large for launch mode. Please send something under ${Math.floor(maxBytes / 1024 / 1024)}MB.`
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

  const sourceImage = photo ? await downloadTelegramPhoto(photo.file_id) : undefined;

  if (sourceImage && sourceImage.size > maxBytes) {
    await replyText(
      message,
      `That image is too large for launch mode. Please send something under ${Math.floor(maxBytes / 1024 / 1024)}MB.`
    );
    return;
  }

  const result = await callGenerationApi(request, brief, sourceImage);

  if (result.imageUrl) {
    await telegramCall("sendPhoto", {
      chat_id: message.chat.id,
      photo: result.imageUrl,
      caption: result.caption || "$GRINDR INDUSTRIES OUTPUT",
      reply_to_message_id: message.message_id
    });
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
    const update = (await request.json()) as TelegramUpdate;
    const message = update.message;
    const text = message ? commandText(message) : "";

    if (!message) {
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
          `Fal choked on that one. Try a shorter brief or a smaller image.\n\nDetail: ${detail}`
        );
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Telegram bot error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
