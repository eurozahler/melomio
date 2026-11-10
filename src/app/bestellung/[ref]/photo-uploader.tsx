"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { removePhotoAction } from "./actions";

/** Fotos für die Slideshow im Video hochladen (optional, vor dem Kauf). */
export function PhotoUploader({
  publicRef,
  photos,
  max,
}: {
  publicRef: string;
  photos: Array<{ id: string }>;
  max: number;
}) {
  const t = useTranslations("Photos");
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const left = max - photos.length;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, left)) {
        const body = new FormData();
        body.set("file", file);
        const res = await fetch(`/api/fotos/${encodeURIComponent(publicRef)}`, { method: "POST", body });
        if (!res.ok) {
          const { error: code } = (await res.json().catch(() => ({ error: "failed" }))) as { error?: string };
          setError(t(`errors.${code ?? "failed"}` as "errors.failed"));
          break;
        }
      }
      if (files.length > left) setError(t("errors.too_many", { max }));
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800"
      aria-labelledby={`${id}-h`}
    >
      <div>
        <h2 id={`${id}-h`} className="text-xl font-bold">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t("text", { max })}</p>
      </div>
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" data-testid="photo-list">
          {photos.map((p, i) => (
            <li key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- geschützte Route, keine Bildoptimierung */}
              <img
                src={`/api/fotos/${encodeURIComponent(publicRef)}/${p.id}`}
                alt={t("alt", { n: i + 1 })}
                className="aspect-square w-full rounded-lg object-cover"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => void (await removePhotoAction(publicRef, p.id)))}
                className="absolute top-1 right-1 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white"
                aria-label={t("remove", { n: i + 1 })}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {left > 0 && (
        <label
          htmlFor={`${id}-file`}
          className="cursor-pointer self-start rounded-full border border-neutral-300 px-5 py-2 text-sm font-semibold dark:border-neutral-700"
        >
          {busy ? t("uploading") : t("add", { left })}
          <input
            id={`${id}-file`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            disabled={busy}
            data-testid="photo-input"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}
      <p className="text-xs text-neutral-500">{t("rights")}</p>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
