import { beforeEach, describe, expect, it } from "vitest";

import {
  CONSENT_COOKIE,
  deleteCookie,
  getCookie,
  hasConsent,
  readPreferences,
  setConsent,
  setCookie,
  writePreferences,
  PREFERENCES_COOKIE,
} from "./cookies";

describe("cookie helpers", () => {
  beforeEach(() => {
    document.cookie.split(";").forEach((row) => {
      const name = row.split("=")[0].trim();
      if (name) deleteCookie(name);
    });
  });

  it("grava e lê cookie com valores codificados", () => {
    setCookie("kf-test", '{"a": 1}');
    expect(getCookie("kf-test")).toBe('{"a": 1}');
  });

  it("consentimento inicia ausente e é marcado após aceite", () => {
    expect(hasConsent()).toBe(false);
    setConsent();
    expect(getCookie(CONSENT_COOKIE)).toBe("1");
    expect(hasConsent()).toBe(true);
  });

  it("persiste e lê preferências", () => {
    writePreferences({ lang: "pt-BR", lastProfile: "participant" });
    const prefs = readPreferences();
    expect(prefs).toEqual({ lang: "pt-BR", lastProfile: "participant" });
    expect(getCookie(PREFERENCES_COOKIE)).toContain("participant");
  });

  it("ignora json inválido nas preferências", () => {
    setCookie(PREFERENCES_COOKIE, "{corrompido");
    expect(readPreferences()).toBeNull();
  });

  it("remove cookie com max-age=0", () => {
    setCookie("kf-test", "v");
    deleteCookie("kf-test");
    expect(getCookie("kf-test")).toBeNull();
  });
});
