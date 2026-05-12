import sharp from "sharp";
import type { CompiledPrompt, ImageGenerationResult } from "./types";

function textOverlayEnabled() {
  return process.env.TEXT_OVERLAY !== "false";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text: string, maxChars: number) {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines.slice(0, 3);
}

function overlaySvg(width: number, height: number, compiled: CompiledPrompt) {
  const headlineLines = wrapText(compiled.overlayText.headline, width > height ? 22 : 15);
  const headlineSize = Math.max(58, Math.floor(width * 0.085));
  const subtextSize = Math.max(24, Math.floor(width * 0.032));
  const footerSize = Math.max(18, Math.floor(width * 0.022));
  const left = Math.floor(width * 0.07);
  const top = Math.floor(height * 0.07);
  const bottom = Math.floor(height * 0.08);
  const headlineHeight = headlineLines.length * headlineSize * 1.05;
  const panelHeight = headlineHeight + subtextSize * 2.8;

  const headlineTspans = headlineLines
    .map(
      (line, index) =>
        `<tspan x="${left}" dy="${index === 0 ? 0 : headlineSize * 1.05}">${escapeXml(line)}</tspan>`
    )
    .join("");

  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="pinkGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="none"/>
      <rect x="0" y="0" width="${width}" height="${Math.floor(panelHeight + top)}" fill="rgba(0,0,0,0.52)"/>
      <rect x="0" y="${Math.floor(height - bottom * 1.8)}" width="${width}" height="${Math.floor(bottom * 1.8)}" fill="rgba(0,0,0,0.58)"/>
      <text x="${left}" y="${top + headlineSize}" font-family="Arial Black, Impact, Arial, sans-serif" font-size="${headlineSize}" font-weight="900" letter-spacing="1" fill="#ff2ebd" filter="url(#pinkGlow)">${headlineTspans}</text>
      <text x="${left}" y="${Math.floor(top + panelHeight - subtextSize)}" font-family="Arial, Helvetica, sans-serif" font-size="${subtextSize}" font-weight="900" letter-spacing="4" fill="#ffffff">${escapeXml(compiled.overlayText.subtext.toUpperCase())}</text>
      <text x="${left}" y="${Math.floor(height - bottom * 0.55)}" font-family="Arial, Helvetica, sans-serif" font-size="${footerSize}" font-weight="900" letter-spacing="3" fill="#ffffff">${escapeXml(compiled.overlayText.footer.toUpperCase())}</text>
    </svg>
  `);
}

export async function applyTextOverlay(result: ImageGenerationResult, compiled: CompiledPrompt) {
  if (!textOverlayEnabled() || !result.imageUrl) {
    return result;
  }

  console.info("[textOverlay] Downloading generated image for typography overlay.", {
    imageUrl: result.imageUrl,
    headline: compiled.overlayText.headline
  });

  const response = await fetch(result.imageUrl);
  if (!response.ok) {
    console.error("[textOverlay] Failed to download generated image.", {
      status: response.status,
      contentType: response.headers.get("content-type")
    });
    return result;
  }

  const input = Buffer.from(await response.arrayBuffer());
  const image = sharp(input);
  const metadata = await image.metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;

  const output = await image
    .composite([{ input: overlaySvg(width, height, compiled), top: 0, left: 0 }])
    .png()
    .toBuffer();

  console.info("[textOverlay] Typography overlay applied.", {
    width,
    height,
    bytes: output.byteLength
  });

  return {
    ...result,
    imageUrl: `data:image/png;base64,${output.toString("base64")}`,
    meta: {
      ...result.meta,
      textOverlay: true,
      originalImageUrl: result.imageUrl,
      overlayText: compiled.overlayText
    }
  } satisfies ImageGenerationResult;
}
