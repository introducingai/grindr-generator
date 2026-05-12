import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    falConfigured: Boolean(process.env.FAL_KEY),
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN)
  });
}
