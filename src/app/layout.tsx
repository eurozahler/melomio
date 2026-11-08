import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { TestModeBanner } from "@/components/test-mode-banner";
import { DEFAULT_LOCALE } from "@/i18n/request";
import "./globals.css";

// Die Schrift wird beim Bauen heruntergeladen und von unserem Server ausgeliefert –
// Besucher verbinden sich also nicht mit Google (DSGVO).
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("title"), description: t("description") };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={DEFAULT_LOCALE} className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <Suspense fallback={null}>
            <TestModeBanner />
          </Suspense>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
