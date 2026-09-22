"use client";

import { useEffect, useRef } from "react";

import { CONSENT_COOKIE, getCookie } from "@/lib/consent/cookies";
import { syncConsentAction } from "@/lib/consent/actions";

/**
 * Backfill do consentimento dado no dispositivo (cookies kf-*) para a tabela
 * `consents`, quando há sessão. Roda nas páginas protegidas, após login.
 */
export function ConsentSync() {
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current) return;
    if (getCookie(CONSENT_COOKIE) === "1") {
      synced.current = true;
      void syncConsentAction().catch(() => {
        // falha silenciosa: será re-sincronizado na próxima visita
      });
    }
  }, []);

  return null;
}
