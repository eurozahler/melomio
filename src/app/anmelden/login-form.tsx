"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Notice, PrimaryButton, TextField } from "@/components/auth-ui";
import { authClient } from "@/lib/auth-client";

type Mode = "link" | "password";

export function LoginForm({
  next,
  linkError,
  testMailbox = false,
}: {
  next: string;
  linkError: boolean;
  testMailbox?: boolean;
}) {
  const t = useTranslations("Auth");
  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(linkError ? t("login.errorLink") : null);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);

  const errorCallbackURL = `/anmelden?fehler=link&next=${encodeURIComponent(next)}`;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: next,
      newUserCallbackURL: next,
      errorCallbackURL,
    });
    setBusy(false);
    if (error) return setError(t("login.errorGeneric"));
    setLinkSentTo(email);
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email, password, callbackURL: next });
    if (error) {
      setBusy(false);
      if (error.code === "EMAIL_NOT_VERIFIED") return setError(t("login.errorUnverified"));
      if (error.code === "INVALID_EMAIL_OR_PASSWORD") return setError(t("login.errorInvalid"));
      return setError(t("login.errorGeneric"));
    }
    window.location.assign(next);
  }

  if (linkSentTo) {
    return (
      <Notice kind="success">
        <p className="font-semibold">{t("login.linkSentTitle")}</p>
        <p>{t("login.linkSent", { email: linkSentTo })}</p>
        {testMailbox && (
          <a
            href="/dev/mailbox"
            className="mt-2 inline-block font-semibold underline"
            data-testid="to-mailbox"
          >
            {t("toMailbox")} →
          </a>
        )}
      </Notice>
    );
  }

  const tab = (value: Mode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => {
        setMode(value);
        setError(null);
      }}
      className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold ${
        mode === value ? "bg-white shadow dark:bg-neutral-800" : "text-neutral-500"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div role="tablist" className="flex gap-1 rounded-full bg-neutral-100 p-1 dark:bg-neutral-900">
        {tab("link", t("login.tabLink"))}
        {tab("password", t("login.tabPassword"))}
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      {mode === "link" ? (
        <form onSubmit={sendLink} className="flex flex-col gap-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{t("login.linkHelp")}</p>
          <TextField
            id="email"
            label={t("email")}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <PrimaryButton disabled={busy}>{t("login.sendLink")}</PrimaryButton>
        </form>
      ) : (
        <form onSubmit={signInWithPassword} className="flex flex-col gap-4">
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
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PrimaryButton disabled={busy}>{t("login.submit")}</PrimaryButton>
          <Link href="/passwort-vergessen" className="text-sm font-semibold text-brand">
            {t("login.forgot")}
          </Link>
        </form>
      )}

      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        {t("login.noAccount")}{" "}
        <Link href={`/registrieren?next=${encodeURIComponent(next)}`} className="font-semibold text-brand">
          {t("login.register")}
        </Link>
      </p>
    </>
  );
}
