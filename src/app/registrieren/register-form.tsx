"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Notice, PrimaryButton, TextField } from "@/components/auth-ui";
import { authClient } from "@/lib/auth-client";

export function RegisterForm({ next }: { next: string }) {
  const t = useTranslations("Auth");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8 || password.length > 128) return setError(t("register.errorPassword"));
    setBusy(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      email,
      password,
      name: name.trim(),
      callbackURL: next,
    });
    setBusy(false);
    if (error) return setError(t("register.errorGeneric"));
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <Notice kind="success">
        <p className="font-semibold">{t("register.sentTitle")}</p>
        <p>{t("register.sent", { email: sentTo })}</p>
      </Notice>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <Notice kind="error">{error}</Notice>}
      <TextField
        id="name"
        label={t("name")}
        hint={t("nameOptional")}
        autoComplete="given-name"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <TextField
        id="email"
        label={t("email")}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
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
      <p className="text-xs text-neutral-500">{t("register.privacyNote")}</p>
      <PrimaryButton disabled={busy}>{t("register.submit")}</PrimaryButton>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        {t("register.haveAccount")}{" "}
        <Link href={`/anmelden?next=${encodeURIComponent(next)}`} className="font-semibold text-brand">
          {t("login.title")}
        </Link>
      </p>
    </form>
  );
}
