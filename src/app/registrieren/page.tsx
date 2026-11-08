import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth-ui";
import { safeNextPath } from "@/server/session";
import { RegisterForm } from "./register-form";

export default async function RegisterPage({ searchParams }: PageProps<"/registrieren">) {
  const t = await getTranslations("Auth.register");
  return (
    <AuthCard title={t("title")} intro={t("intro")}>
      <Suspense fallback={null}>
        {searchParams.then((p) => (
          <RegisterForm next={safeNextPath(p.next)} />
        ))}
      </Suspense>
    </AuthCard>
  );
}
