import { NextResponse } from "next/server";
import { loadModuleManifest } from "@/generation/moduleLoader";

export const dynamic = "force-dynamic";

export async function GET() {
  const manifest = await loadModuleManifest();
  return NextResponse.json(manifest);
}
