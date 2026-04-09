"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { reportError } from "@/lib/error-reporter";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    reportError(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "1.5rem",
            fontFamily: "system-ui, -apple-system, sans-serif",
            backgroundColor: "#f9fafb",
            color: "#1a3b3a",
            textAlign: "center",
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "1rem",
              padding: "2.5rem",
              maxWidth: "28rem",
              width: "100%",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>
              &#x26A0;&#xFE0F;
            </div>
            <h1
              style={{
                fontSize: "1.25rem",
                fontWeight: 700,
                marginBottom: "0.5rem",
              }}
            >
              Algo deu errado
            </h1>
            <p
              style={{
                fontSize: "0.95rem",
                color: "#6b7280",
                marginBottom: "1.5rem",
                lineHeight: 1.5,
              }}
            >
              Ocorreu um erro inesperado. Tente recarregar a
              p&aacute;gina.
            </p>
            <button
              onClick={reset}
              style={{
                backgroundColor: "#1a3b3a",
                color: "#ffffff",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.75rem 1.5rem",
                fontSize: "0.95rem",
                fontWeight: 600,
                cursor: "pointer",
                width: "100%",
              }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
