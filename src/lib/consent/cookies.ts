export const CONSENT_COOKIE = "kf-consent-given";
export const PREFERENCES_COOKIE = "kf-preferences";
export const GEO_COOKIE = "kf-geo";

export const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type ProfilePreference = "participant" | "host";

export type Preferences = {
  lang?: string;
  lastProfile?: ProfilePreference;
  updatedAt?: string;
};

export function setCookie(name: string, value: string, maxAge = ONE_YEAR_SECONDS): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; samesite=lax`;
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function deleteCookie(name: string): void {
  document.cookie = `${name}=; max-age=0; path=/; samesite=lax`;
}

export function hasConsent(): boolean {
  return getCookie(CONSENT_COOKIE) === "1";
}

export function setConsent(): void {
  setCookie(CONSENT_COOKIE, "1");
}

export function readPreferences(): Preferences | null {
  const raw = getCookie(PREFERENCES_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Preferences;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // cookie corrompido/antigo — tratar como ausente
  }
  return null;
}

export function writePreferences(preferences: Preferences): void {
  setCookie(PREFERENCES_COOKIE, JSON.stringify(preferences));
}
