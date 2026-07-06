import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ConsentBanner from "@/components/ConsentBanner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "UrbanFlow Mobility",
  description:
    "Plateforme intelligente de mobilité multimodale pour Paris et son agglomération",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "UrbanFlow",
  },
  openGraph: {
    title: "UrbanFlow Mobility",
    description:
      "Plateforme intelligente de mobilité multimodale pour Paris et son agglomération",
    type: "website",
    locale: "fr_FR",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#2E7D9B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans bg-background text-[var(--color-text-primary)]" suppressHydrationWarning>
        {/*
          No-FOUC dark-mode : inline script injecté côté serveur dans <head> et
          exécuté avant tout paint/hydratation. next/script (id + strategy
          beforeInteractive) est le moyen officiellement supporté en App Router —
          un <script dangerouslySetInnerHTML> brut n'est pas exécuté par React 19.
          Doit vivre À L'INTÉRIEUR de <body> (sibling de </body> = hors document
          → erreur Next 16 « Cannot render a sync or defer <script> outside the
          main document »). beforeInteractive le remonte dans <head> au render.
        */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function() {
            try {
              var prefs = JSON.parse(localStorage.getItem('urbanflow_preferences') || '{}');
              var isDark = prefs.darkMode;
              if (isDark === undefined) {
                isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              }
              if (isDark) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            } catch (e) {}
          })();`}
        </Script>
        <AuthProvider>
          <ThemeProvider>
            {children}
            <ConsentBanner />
          </ThemeProvider>
        </AuthProvider>
        <ServiceWorkerRegistration />
        <PwaInstallBanner />
      </body>
    </html>
  );
}
