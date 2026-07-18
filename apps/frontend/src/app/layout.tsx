import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import SplashScreen from "@/components/SplashScreen";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SplashProvider } from "@/contexts/SplashContext";
import ConsentBanner from "@/components/ConsentBanner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://urbanflow.app"),
  title: "UrbanFlow Mobility — Mobilité multimodale à Paris",
  description:
    "Calculez vos itinéraires multimodaux (métro, RER, bus, tram, Vélib’) en temps réel à Paris et en Île-de-France. Navigation GPS immersive, alertes lignes et PWA offline.",
  keywords: [
    "UrbanFlow",
    "mobilité",
    "Île-de-France",
    "Paris",
    "transport",
    "itinéraire",
    "métro",
    "RER",
    "bus",
    "tram",
    "Vélib’",
    "temps réel",
    "PWA",
  ],
  manifest: "/manifest.json",
  robots: {
    index: true,
    follow: true,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "UrbanFlow",
    startupImage: "/assets/urbanflow/brand/urbanflow-pictogramme.png",
  },
  openGraph: {
    title: "UrbanFlow Mobility — Mobilité multimodale à Paris",
    description:
      "Calculez vos itinéraires multimodaux en temps réel à Paris et en Île-de-France. Navigation GPS immersive, alertes lignes et PWA offline.",
    type: "website",
    locale: "fr_FR",
    siteName: "UrbanFlow Mobility",
    images: [
      {
        url: "/assets/urbanflow/brand/urbanflow-logo-clair.png",
        width: 800,
        height: 400,
        alt: "UrbanFlow Mobility",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "UrbanFlow Mobility — Mobilité multimodale à Paris",
    description:
      "Calculez vos itinéraires multimodaux en temps réel à Paris et en Île-de-France.",
    images: ["/assets/urbanflow/brand/urbanflow-logo-clair.png"],
  },
  icons: {
    icon: [
      { url: "/assets/urbanflow/app-icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/assets/urbanflow/app-icons/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/assets/urbanflow/app-icons/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/assets/urbanflow/app-icons/apple-touch-icon.png",
    shortcut: "/assets/urbanflow/app-icons/favicon-32.png",
  },
  alternates: {
    canonical: "https://urbanflow.app/",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
              var prefs = JSON.parse(localStorage.getItem('urbanflow_prefs') || '{}');
              var isDark = prefs.darkMode;
              if (isDark === undefined) {
                isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              }
              if (isDark) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
              var a11y = prefs.accessibility;
              if (a11y) {
                document.documentElement.setAttribute('data-accessibility', 'true');
              } else {
                document.documentElement.removeAttribute('data-accessibility');
              }
            } catch (e) {}
          })();`}
        </Script>
        <SplashProvider>
          <AuthProvider>
            <ThemeProvider>
              <SplashScreen />
              {children}
              <ConsentBanner />
            </ThemeProvider>
          </AuthProvider>
        </SplashProvider>
        <ServiceWorkerRegistration />
        <PwaInstallBanner />
      </body>
    </html>
  );
}
