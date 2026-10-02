"use client";

import { useSyncExternalStore } from "react";

/**
 * `window.location.origin` do cliente — `null` no servidor e durante a hidratação.
 *
 * Serve ao QR porque `NEXT_PUBLIC_APP_URL` é inlinada no bundle em **build
 * time**: num deploy de preview da Vercel — que tem URL própria — a env continua
 * apontando para a produção e o QR da TV manda o visitante para o app errado. O
 * host que a pessoa está vendo é o host que o QR precisa codificar.
 *
 * `useSyncExternalStore` em vez de `useState` + `useEffect`: ele já sabe ler um
 * valor externo sem `setState` dentro de effect (que o React Compiler marca como
 * erro) e o `getServerSnapshot` devolve `null` durante a hidratação, então o
 * HTML do servidor e o primeiro render do cliente batem. Ler `window` direto no
 * render daria hydration mismatch nas páginas SSR-rendered.
 */
export function useClientOrigin(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * `location` não emite eventos, e o origin não muda dentro da vida de uma página:
 * mudá-lo implicou navegar para outro origin, ou seja, outro documento. Um
 * no-op é o contrato certo — quem chama só lê no mount.
 */
function subscribe() {
  return () => {};
}

function getSnapshot(): string {
  return window.location.origin;
}

function getServerSnapshot(): string | null {
  return null;
}
