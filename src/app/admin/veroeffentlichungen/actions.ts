"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import {
  approvePublication,
  PublicationError,
  rejectPublication,
  retryPublication,
} from "@/publishing/service";
import { disconnectDropbox, saveDefaultFolder } from "@/publishing/target";
import { getAdminUser } from "@/server/admin";
import { getSenderBoss } from "@/server/jobs";
import type { AdminResult } from "../actions";

async function run(fn: (userId: string) => Promise<string>): Promise<AdminResult> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, error: "Keine Berechtigung." };
  try {
    const message = await fn(admin.id);
    refresh();
    return { ok: true, message };
  } catch (error) {
    if (error instanceof PublicationError) {
      return {
        ok: false,
        error:
          error.code === "not_found"
            ? "Nicht gefunden."
            : "Im aktuellen Status nicht möglich – Seite neu laden.",
      };
    }
    if (error instanceof Error && error.message.startsWith("Ungültiger Ordner")) {
      return { ok: false, error: error.message };
    }
    console.error("[Admin Veröffentlichung]", error);
    return { ok: false, error: "Das hat nicht geklappt." };
  }
}

export async function approvePublicationAction(id: unknown) {
  return run(async (userId) => {
    if (typeof id !== "string") throw new PublicationError("not_found");
    await approvePublication(getDb(), await getSenderBoss(), id, userId);
    return "Freigegeben – wird hochgeladen.";
  });
}

export async function rejectPublicationAction(id: unknown, reason: string | null) {
  return run(async (userId) => {
    if (typeof id !== "string") throw new PublicationError("not_found");
    await rejectPublication(getDb(), id, userId, reason ?? "");
    return "Abgelehnt.";
  });
}

export async function retryPublicationAction(id: unknown) {
  return run(async (userId) => {
    if (typeof id !== "string") throw new PublicationError("not_found");
    await retryPublication(getDb(), await getSenderBoss(), id, userId);
    return "Wird erneut versucht.";
  });
}

export async function saveDefaultFolderAction(folder: string) {
  return run(async (userId) => `Gespeichert: ${await saveDefaultFolder(getDb(), folder, userId)}`);
}

export async function disconnectDropboxAction() {
  return run(async (userId) => {
    await disconnectDropbox(getDb(), userId);
    return "Dropbox getrennt.";
  });
}
