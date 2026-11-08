import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth-ui";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/passwort-neu">) {
  const t = await getTranslations("Auth.reset");
  return (
    <AuthCard title={t("title")}>
      <Suspense fallback={null}>
        {searchParams.then((p) => (
          <ResetForm token={typeof p.token === "string" ? p.token : null} />
        ))}
      </Suspense>
    </AuthCard>
  );
}
