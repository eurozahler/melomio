"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Notice, PrimaryButton, TextField } from "@/components/auth-ui";
import { authClient } from "@/lib/auth-client";

export function ResetForm({ token }: { token: string | null }) {
  const t = useTranslations("Auth");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"form" | "done" | "invalid">(token ? "form" : "invalid");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password.length < 8 || password.length > 128) return setError(t("register.errorPassword"));
    setBusy(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    setState(error ? "invalid" : "done");
  }

  if (state !== "form") {
    return (
      <>
        <Notice kind={state === "done" ? "success" : "error"}>
          {state === "done" ? t("reset.done") : t("reset.invalid")}
        </Notice>
        <Link
          href={state === "done" ? "/anmelden" : "/passwort-vergessen"}
          className="font-semibold text-brand"
        >
          {state === "done" ? t("reset.toLogin") : t("forgot.title")}
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Notice kind="error">{error}</Notice>}
      <TextField
        id="password"
        label={t("password")}
        hint={t("passwordHint")}
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <PrimaryButton disabled={busy}>{t("reset.submit")}</PrimaryButton>
    </form>
  );
}
