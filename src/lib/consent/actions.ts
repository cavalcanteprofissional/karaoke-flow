"use server";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import {
  CONSENT_COOKIE,
  GEO_COOKIE,
  PREFERENCES_COOKIE,
  type Preferences,
} from "./cookies";
import type { GeoResult } from "./geo";
import { TERMS_VERSION } from "./terms";

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function friendlyError(message: string): string {
  if (/row-level security|permission denied|policy/i.test(message))
    return "Não foi possível salvar seu consentimento agora. Tente novamente.";
  return message;
}

export type ConsentSyncResult = { stored: boolean };

/**
 * Backfill pós-login: sincroniza o consentimento já dado no dispositivo
 * (cookies kf-*) com a tabela `consents` quando existe sessão. Idempotente —
 * pode ser chamado a cada página protegida sem efeitos colaterais.
 */
export async function syncConsentAction(): Promise<ConsentSyncResult> {
  const store = await cookies();
  if (store.get(CONSENT_COOKIE)?.value !== "1") {
    return { stored: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { stored: false };

  const preferences = parseJson<Preferences>(store.get(PREFERENCES_COOKIE)?.value, {});
  const geoValue = store.get(GEO_COOKIE)?.value;
  const geolocation = geoValue
    ? parseJson<GeoResult>(geoValue, { status: "unavailable", ts: "" })
    : {};

  const { error } = await supabase.from("consents").upsert(
    {
      user_id: user.id,
      terms_version: TERMS_VERSION,
      cookies_preferences: preferences,
      geolocation,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(friendlyError(error.message));
  }

  return { stored: true };
}
