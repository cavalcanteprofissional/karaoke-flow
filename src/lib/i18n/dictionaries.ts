import type { Locale } from "./index";

export type Dict = {
  onboarding: {
    sing: string;
    host: string;
  };
  consent: {
    title: string;
    body: string;
    accept: string;
  };
};

// [REVISAR] Textos de consentimento são um rascunho funcional — precisam de
// validação jurídica antes de produção (LGPD).
const pt_BR: Dict = {
  onboarding: {
    sing: "Quero cantar",
    host: "Sou dono",
  },
  consent: {
    title: "Cookies e privacidade",
    body:
      "Este serviço respeita a LGPD. Nada é coletado antes do seu aceite. Ao " +
      "aceitar: (1) salvamos um cookie estritamente necessário registrando o " +
      "aceite; (2) passamos a salvar preferências (idioma e último modo " +
      "escolhido); (3) podemos solicitar sua localização aproximada para " +
      "sugestões de bares — você pode negar sem perder acesso (apenas não " +
      "poderá adicionar músicas em mesas). Você pode revisar esta política a " +
      "qualquer momento.",
    accept: "Aceitar",
  },
};

const en: Dict = {
  onboarding: {
    sing: "I want to sing",
    host: "I'm a host",
  },
  consent: {
    title: "Cookies & privacy",
    body:
      "Nothing is collected before you accept. By accepting: (1) we store a " +
      "strictly necessary cookie recording this consent; (2) we may store your " +
      "preferences (language and last chosen mode); (3) we may request your " +
      "approximate location for bar suggestions — you can deny it and still " +
      "keep access (you just can't add songs from a table).",
    accept: "Accept",
  },
};

const es: Dict = {
  onboarding: {
    sing: "Quiero cantar",
    host: "Soy dueño",
  },
  consent: {
    title: "Cookies y privacidad",
    body:
      "No se recopila nada antes de que lo aceptes. Al aceptar: (1) guardamos " +
      "una cookie estrictamente necesaria que registra el consentimiento; " +
      "(2) podemos guardar preferencias (idioma y último modo elegido); " +
      "(3) podemos solicitar tu ubicación aproximada para sugerir bares — " +
      "puedes denegarlo y seguir con acceso (solo no podrás añadir canciones " +
      "desde una mesa).",
    accept: "Aceptar",
  },
};

export const dictionaries: Record<Locale, Dict> = {
  "pt-BR": pt_BR,
  en,
  es,
};
