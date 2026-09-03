"use client";

/**
 * Boundary d'erreur globale — dernier rempart quand error.tsx lui-même
 * échoue. Doit rester minimal (pas de dépendance au layout).
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          textAlign: "center",
          background: "#fafafa",
          color: "#1f2937",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p
          style={{
            fontSize: "10px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: "#9ca3af",
            marginBottom: "0.5rem",
          }}
        >
          Erreur grave
        </p>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          L&apos;application a rencontré un problème
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#4b5563", maxWidth: "20rem", marginBottom: "2rem" }}>
          Recharge la page pour revenir à l&apos;application.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "0.625rem 1.25rem",
            borderRadius: "0.75rem",
            background: "#2E7D9B",
            color: "#fff",
            fontWeight: 500,
            cursor: "pointer",
            border: "none",
          }}
        >
          Recharger
        </button>
      </body>
    </html>
  );
}