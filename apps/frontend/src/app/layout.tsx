import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import { AuthProvider } from "@/contexts/AuthContext";
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
      <body className="min-h-full flex flex-col font-sans bg-white text-[var(--color-text-primary)]" suppressHydrationWarning>
        <AuthProvider>
          {children}
          <ConsentBanner />
        </AuthProvider>
        <ServiceWorkerRegistration />
        <PwaInstallBanner />
      </body>
    </html>
  );
}
