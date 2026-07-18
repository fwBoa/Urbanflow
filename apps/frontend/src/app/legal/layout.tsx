import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mentions légales — UrbanFlow Mobility",
  description:
    "Mentions légales du site UrbanFlow Mobility : éditeur, hébergeur, propriété intellectuelle et conditions d'utilisation.",
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://urbanflow.app/legal",
  },
};

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
