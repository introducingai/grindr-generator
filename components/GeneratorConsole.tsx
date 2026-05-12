"use client";

import { useEffect, useMemo, useState } from "react";
import type { ImageGenerationResult, ModuleManifest, PromptSelection } from "@/generation/types";
import { randomizeSelectionFromManifest } from "@/generation/randomizerCore";

type Props = {
  initialManifest: ModuleManifest;
  initialSelection: PromptSelection;
};

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function moduleLabel(id: string) {
  return id
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function SelectControl({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: { id: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-xs uppercase tracking-[0.22em] text-pink-100/60">
      {label}
      <select
        className="h-11 rounded border border-pink-400/25 bg-black/50 px-3 text-sm normal-case tracking-normal text-pink-50 outline-none transition focus:border-grindr-pink focus:shadow-neon"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {moduleLabel(option.id)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GeneratorConsole({ initialManifest, initialSelection }: Props) {
  const [selection, setSelection] = useState<PromptSelection>(initialSelection);
  const [provider, setProvider] = useState<"mock" | "fal">("fal");
  const [mode, setMode] = useState<"text-to-image" | "image-to-image">("text-to-image");
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ImageGenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectedFormat = useMemo(
    () => initialManifest.formats.find((format) => format.id === selection.formatId),
    [initialManifest.formats, selection.formatId]
  );

  useEffect(() => {
    if (!sourceImage) {
      setSourcePreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(sourceImage);
    setSourcePreviewUrl(nextPreviewUrl);

    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [sourceImage]);

  function updateSelection(patch: Partial<PromptSelection>) {
    setSelection((current) => ({ ...current, ...patch }));
  }

  function randomize() {
    setResult(null);
    setError(null);
    setSelection(randomizeSelectionFromManifest(initialManifest));
  }

  async function generate() {
    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append("selection", JSON.stringify(selection));
      formData.append("provider", provider);
      formData.append("mode", sourceImage ? "image-to-image" : mode);

      if (sourceImage) {
        formData.append("image", sourceImage);
      }

      const response = await fetch("/api/generate-image", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error || "Generation failed.");
        return;
      }

      setResult(payload);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Generation failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden px-4 py-6 text-pink-50 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6">
        <header className="flex flex-col gap-4 border-b border-pink-400/20 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-grindr-green">
              GRINDR INDUSTRIES INTERNAL
            </p>
            <h1 className="mt-2 text-4xl font-black uppercase tracking-normal text-white sm:text-6xl">
              $GRINDR Generator
            </h1>
          </div>
          <div className="max-w-xl text-sm leading-6 text-pink-100/70">
            Modular propaganda compiler for image prompts. Video generation is intentionally offline for this MVP.
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[380px_1fr]">
          <aside className="rounded-lg border border-pink-400/25 bg-black/45 p-4 shadow-insetNeon backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold uppercase text-white">Prompt Modules</h2>
                <p className="text-xs uppercase tracking-[0.22em] text-pink-200/45">JSON loaders active</p>
              </div>
              <button
                className="h-10 rounded border border-grindr-green/60 px-3 text-xs font-bold uppercase tracking-[0.16em] text-grindr-green transition hover:bg-grindr-green hover:text-black"
                type="button"
                onClick={randomize}
              >
                Random
              </button>
            </div>

            <div className="grid gap-4">
              <SelectControl
                label="Format"
                value={selection.formatId}
                options={initialManifest.formats}
                onChange={(formatId) => updateSelection({ formatId })}
              />
              <SelectControl
                label="Archetype"
                value={selection.archetypeIds[0] || ""}
                options={initialManifest.archetypes}
                onChange={(archetypeId) => updateSelection({ archetypeIds: [archetypeId] })}
              />
              <SelectControl
                label="Theme"
                value={selection.themeId}
                options={initialManifest.themes}
                onChange={(themeId) => updateSelection({ themeId })}
              />
              <SelectControl
                label="Style"
                value={selection.styleId}
                options={initialManifest.styles}
                onChange={(styleId) => updateSelection({ styleId })}
              />
              <SelectControl
                label="Camera"
                value={selection.cameraId}
                options={initialManifest.cameras}
                onChange={(cameraId) => updateSelection({ cameraId })}
              />
              <SelectControl
                label="Symbol"
                value={selection.symbolIds[0] || ""}
                options={initialManifest.symbols}
                onChange={(symbolId) => updateSelection({ symbolIds: [symbolId] })}
              />

              <label className="grid gap-2 text-xs uppercase tracking-[0.22em] text-pink-100/60">
                Provider
                <select
                  className="h-11 rounded border border-pink-400/25 bg-black/50 px-3 text-sm normal-case tracking-normal text-pink-50 outline-none transition focus:border-grindr-pink focus:shadow-neon"
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as "mock" | "fal")}
                >
                  <option value="fal">Fal / Flux</option>
                  <option value="mock">Mock</option>
                </select>
              </label>

              <label className="grid gap-2 text-xs uppercase tracking-[0.22em] text-pink-100/60">
                Mode
                <select
                  className="h-11 rounded border border-pink-400/25 bg-black/50 px-3 text-sm normal-case tracking-normal text-pink-50 outline-none transition focus:border-grindr-pink focus:shadow-neon"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as "text-to-image" | "image-to-image")}
                >
                  <option value="text-to-image">Text to Image</option>
                  <option value="image-to-image">Image to Image</option>
                </select>
              </label>

              <label className="grid gap-2 text-xs uppercase tracking-[0.22em] text-pink-100/60">
                Upload Image
                <input
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  className="rounded border border-pink-400/25 bg-black/50 p-2 text-sm normal-case tracking-normal text-pink-50 file:mr-3 file:rounded file:border-0 file:bg-grindr-pink file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase file:tracking-[0.14em] file:text-black"
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setError(null);

                    if (file && file.size > MAX_UPLOAD_BYTES) {
                      setSourceImage(null);
                      event.target.value = "";
                      setError("Uploaded image is too large. Max size is 4MB.");
                      return;
                    }

                    if (file && !file.type.startsWith("image/")) {
                      setSourceImage(null);
                      event.target.value = "";
                      setError("Uploaded file must be an image.");
                      return;
                    }

                    setSourceImage(file);
                    if (file) {
                      setMode("image-to-image");
                    }
                  }}
                />
              </label>

              {sourcePreviewUrl ? (
                <div className="grid gap-2 rounded border border-pink-400/20 bg-black/35 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-pink-100/55">Source Preview</p>
                    <button
                      className="rounded border border-pink-400/45 px-2 py-1 text-xs uppercase tracking-[0.14em] text-pink-100 transition hover:bg-grindr-pink hover:text-black"
                      type="button"
                      onClick={() => setSourceImage(null)}
                    >
                      Clear
                    </button>
                  </div>
                  <img
                    src={sourcePreviewUrl}
                    alt="Uploaded source preview"
                    className="max-h-56 w-full rounded border border-pink-400/20 object-contain"
                  />
                </div>
              ) : null}

              <label className="grid gap-2 text-xs uppercase tracking-[0.22em] text-pink-100/60">
                Slogan
                <input
                  className="h-11 rounded border border-pink-400/25 bg-black/50 px-3 text-sm normal-case tracking-normal text-pink-50 outline-none transition focus:border-grindr-pink focus:shadow-neon"
                  value={selection.slogan || ""}
                  onChange={(event) => updateSelection({ slogan: event.target.value })}
                />
              </label>

              <label className="grid gap-2 text-xs uppercase tracking-[0.22em] text-pink-100/60">
                Chaos {selection.chaosLevel}/10
                <input
                  min={1}
                  max={10}
                  type="range"
                  value={selection.chaosLevel || 5}
                  onChange={(event) => updateSelection({ chaosLevel: Number(event.target.value) })}
                  className="accent-grindr-pink"
                />
              </label>

              <label className="grid gap-2 text-xs uppercase tracking-[0.22em] text-pink-100/60">
                Brief
                <textarea
                  className="min-h-24 resize-y rounded border border-pink-400/25 bg-black/50 p-3 text-sm normal-case tracking-normal text-pink-50 outline-none transition focus:border-grindr-pink focus:shadow-neon"
                  placeholder="Optional scene instruction..."
                  value={selection.userBrief || ""}
                  onChange={(event) => updateSelection({ userBrief: event.target.value })}
                />
              </label>

              <button
                className="h-12 rounded bg-grindr-pink px-4 text-sm font-black uppercase tracking-[0.2em] text-black shadow-neon transition hover:bg-white disabled:cursor-wait disabled:opacity-70"
                type="button"
                onClick={generate}
                disabled={isLoading}
              >
                {isLoading ? "Generating" : "Generate Image"}
              </button>
            </div>
          </aside>

          <section className="grid gap-5">
            <div className="rounded-lg border border-pink-400/25 bg-black/40 p-5 shadow-insetNeon">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-grindr-green">Active Format</p>
                  <h2 className="text-2xl font-black uppercase text-white">
                    {moduleLabel(selection.formatId)}
                  </h2>
                </div>
                <p className="max-w-md text-sm leading-6 text-pink-100/65">{selectedFormat?.description}</p>
              </div>
              <div className="scanline min-h-[260px] rounded border border-pink-400/15 bg-grindr-panel/70 p-4">
                {error ? (
                  <div className="rounded border border-red-400/40 bg-red-950/35 p-3 text-sm text-red-200">
                    {error}
                  </div>
                ) : null}
                {isLoading ? (
                  <div className="flex min-h-[220px] items-center justify-center text-center text-sm uppercase tracking-[0.22em] text-pink-100/55">
                    Compiling prompt and contacting{" "}
                    {provider === "fal"
                      ? sourceImage
                        ? "Fal Flux Kontext"
                        : "Fal Flux"
                      : "mock provider"}
                  </div>
                ) : null}
                {result ? (
                  <div className="grid gap-4">
                    <div className="rounded border border-grindr-green/40 bg-black/55 p-3 text-xs uppercase tracking-[0.2em] text-grindr-green">
                      {result.provider} provider returned {result.status} / {result.mode}
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-pink-50">
                      {result.prompt}
                    </pre>
                    {sourcePreviewUrl ? (
                      <div className="grid gap-2 border-t border-pink-400/20 pt-4">
                        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white">
                          Uploaded Image
                        </h3>
                        <img
                          src={sourcePreviewUrl}
                          alt="Uploaded source"
                          className="max-h-[420px] w-full rounded border border-pink-400/25 bg-black object-contain"
                        />
                      </div>
                    ) : null}
                    {result.imageUrl ? (
                      <div className="grid gap-3 border-t border-pink-400/20 pt-4">
                        <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white">
                          Generated Output
                        </h3>
                        <img
                          src={result.imageUrl}
                          alt={result.caption}
                          className="w-full rounded border border-pink-400/25 bg-black object-contain shadow-neon"
                        />
                        <div className="flex flex-wrap gap-3">
                          <a
                            className="rounded border border-grindr-green/60 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-grindr-green transition hover:bg-grindr-green hover:text-black"
                            href={result.imageUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open Image
                          </a>
                          <a
                            className="rounded border border-pink-400/60 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-pink-100 transition hover:bg-grindr-pink hover:text-black"
                            href={result.imageUrl}
                            download={`${result.caption.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`}
                          >
                            Download
                          </a>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : !isLoading ? (
                  <div className="flex min-h-[220px] items-center justify-center text-center text-sm uppercase tracking-[0.22em] text-pink-100/45">
                    Awaiting extraction directive
                  </div>
                ) : null}
              </div>
            </div>

            {result ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-pink-400/20 bg-black/35 p-4">
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-white">Caption</h3>
                  <p className="text-sm text-pink-100/75">{result.caption}</p>
                </div>
                <div className="rounded-lg border border-pink-400/20 bg-black/35 p-4">
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-white">
                    Negative Prompt
                  </h3>
                  <p className="text-sm text-pink-100/75">{result.negativePrompt}</p>
                </div>
              </div>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}
