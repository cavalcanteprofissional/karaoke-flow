"use client";

import { useMemo, useState } from "react";

import { useRouter } from "next/navigation";
import { Mic2, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SiteFooter } from "@/components/shell/site-footer";
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
    <div className="bg-background kf-home-glow flex min-h-dvh flex-col">
      {/* O conteúdo fica num wrapper `flex-1` e o rodapé fora dele: no mesmo
          container, o `gap-16` empurraria a assinatura para 4rem do botão. */}
      <main className="relative flex flex-1 flex-col items-center justify-center gap-16 p-4">
        <h1 className="sr-only">Karaokê Watch Party</h1>

        {/* "Sou dono" sai do fluxo central: fica no canto superior direito e
            menor (`size="sm"`, 32px ≥ 24px do 2.5.8). É a entrada secundária
            (o dono do bar configura a casa); o caminho principal do público é
            "Quero cantar", que fica sozinho e centralizado na tela. */}
        <div className="absolute top-4 right-4">
          <Button
            size="sm"
            variant="outline"
            className="kf-rise ease-neon border-primary/40 hover:bg-accent gap-2 duration-200"
            aria-label={dict.onboarding.host}
            onClick={() => chooseRole("host")}
          >
            <Store className="size-4" />
            {dict.onboarding.host}
          </Button>
        </div>

        <div
          className="flex w-full max-w-sm flex-col gap-4 md:max-w-md"
          role="group"
          aria-label="Escolha seu perfil"
        >
          <Button
            size="lg"
            className="kf-rise ease-neon shadow-glow w-full gap-3 duration-200"
            aria-label={dict.onboarding.sing}
            onClick={() => chooseRole("participant")}
          >
            <Mic2 className="size-5" />
            {dict.onboarding.sing}
          </Button>
        </div>

        <Dialog open={bannerOpen} onOpenChange={() => {}}>
          <DialogContent
            showCloseButton={false}
            onEscapeKeyDown={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            className="max-w-md"
          >
            <DialogHeader>
              <DialogTitle id="kf-consent-title">{dict.consent.title}</DialogTitle>
              <DialogDescription className="leading-relaxed">
                {dict.consent.body}
              </DialogDescription>
            </DialogHeader>
            <Button onClick={acceptConsent}>{dict.consent.accept}</Button>
          </DialogContent>
        </Dialog>
      </main>

      <SiteFooter />
    </div>
  );
}
