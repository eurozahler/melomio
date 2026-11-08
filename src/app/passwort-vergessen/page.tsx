"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AuthCard, Notice, PrimaryButton, TextField } from "@/components/auth-ui";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const t = useTranslations("Auth");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Die Antwort verrät absichtlich nicht, ob es das Konto gibt (Schutz vor Ausspähen)
    await authClient.requestPasswordReset({ email, redirectTo: "/passwort-neu" });
    setBusy(false);
    setSent(true);
  }

  return (
    <AuthCard title={t("forgot.title")} intro={sent ? undefined : t("forgot.intro")}>
      {sent ? (
        <Notice kind="success">{t("forgot.sent")}</Notice>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <TextField
            id="email"
            label={t("email")}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <PrimaryButton disabled={busy}>{t("forgot.submit")}</PrimaryButton>
        </form>
      )}
      <Link href="/anmelden" className="text-sm font-semibold text-rose-600">
        {t("forgot.back")}
      </Link>
    </AuthCard>
  );
}
