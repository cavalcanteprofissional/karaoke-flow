"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";
import { Mic2, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  hasConsent,
  readPreferences,
  setConsent,
  writePreferences,
  type ProfilePreference,
} from "@/lib/consent/cookies";
import { captureGeolocation, readGeoCookie, writeGeoCookie } from "@/lib/consent/geo";
import { detectLocale, type Locale } from "@/lib/i18n";
import { dictionaries } from "@/lib/i18n/dictionaries";

function navigatorLanguages(): string[] {
  if (typeof navigator === "undefined") return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0)
    return navigator.languages as string[];
  if (navigator.language) return [navigator.language];
  return [];
}

function initialLocale(): Locale {
  const prefs = hasConsent() ? readPreferences() : null;
  if (prefs?.lang) return detectLocale([prefs.lang]);
  return detectLocale(navigatorLanguages());
}

const ROLES: Array<{ role: ProfilePreference; icon: typeof Mic2 }> = [
  { role: "participant", icon: Mic2 },
  { role: "host", icon: Store },
];

/**
 * Spec §2.5 (Tela 1 — Onboarding). Bifurcação com apenas dois botões e o
 * banner de consentimento LGPD sobreposto. Nada é coletado antes do aceite.
 */
export function Onboarding() {
  const router = useRouter();
  const locale = useMemo(() => initialLocale(), []);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<ProfilePreference | null>(null);

  const dict = dictionaries[locale];

  function proceed(role: ProfilePreference) {
    writePreferences({
      lang: locale,
      lastProfile: role,
      updatedAt: new Date().toISOString(),
    });
    router.push("/login");
  }

  function chooseRole(role: ProfilePreference) {
    if (hasConsent()) {
      proceed(role);
      return;
    }
    setPendingRole(role);
    setBannerOpen(true);
  }

  function acceptConsent() {
    setConsent();
    writePreferences({
      lang: locale,
      updatedAt: new Date().toISOString(),
    });

    if (!readGeoCookie()) {
      void captureGeolocation().then((geo) => {
        if (geo.status !== "unavailable") writeGeoCookie(geo);
      });
    }

    setBannerOpen(false);
    if (pendingRole) {
      const role = pendingRole;
      setPendingRole(null);
      proceed(role);
    }
  }

  return (
    <div className="bg-background flex min-h-dvh flex-col items-center justify-center gap-16 p-4">
      <div
        className="flex w-full max-w-sm flex-col gap-4"
        role="group"
        aria-label="Escolha seu perfil"
      >
        {ROLES.map(({ role, icon: Icon }) => (
          <Button
            key={role}
            size="lg"
            variant={role === "host" ? "default" : "outline"}
            className="w-full gap-3"
            aria-label={role === "host" ? dict.onboarding.host : dict.onboarding.sing}
            onClick={() => chooseRole(role)}
          >
            <Icon className="size-5" />
            {role === "host" ? dict.onboarding.host : dict.onboarding.sing}
          </Button>
        ))}
      </div>

      {bannerOpen && (
        <div
          className="bg-background/80 fixed inset-0 z-50 flex items-end justify-center p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kf-consent-title"
        >
          <Card className="border-border/60 bg-card w-full max-w-md">
            <CardContent className="flex flex-col gap-4 p-5">
              <h2 id="kf-consent-title" className="text-lg font-semibold">
                {dict.consent.title}
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {dict.consent.body}
              </p>
              <Button onClick={acceptConsent}>{dict.consent.accept}</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
