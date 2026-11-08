import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth-ui";
import { getSessionUser, safeNextPath } from "@/server/session";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/anmelden">) {
  const t = await getTranslations("Auth.login");
  return (
    <AuthCard title={t("title")} intro={t("intro")}>
      <Suspense fallback={null}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function LoginContent({ searchParams }: Pick<PageProps<"/anmelden">, "searchParams">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const user = await getSessionUser();
  if (user?.emailVerified) redirect(next);
  const linkError = params.fehler === "link" || typeof params.error === "string";
  return <LoginForm next={next} linkError={linkError} />;
}
