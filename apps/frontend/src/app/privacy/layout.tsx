import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politique de confidentialité — UrbanFlow Mobility",
  description:
    "Politique de confidentialité et traitement des données personnelles de l'application UrbanFlow Mobility.",
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://urbanflow.app/privacy",
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
