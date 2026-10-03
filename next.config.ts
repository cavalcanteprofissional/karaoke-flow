import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Origens liberadas para o dev server, derivadas das interfaces da máquina.
 *
 * O Next bloqueia, por padrão, qualquer request `/_next` cujo host do `Origin`
 * não seja `localhost` (ver `allowedDevOrigins` no Next 16). Aberta em
 * `http://192.168.100.28:3000`, a página era servida — HTML e CSS passavam —
 * mas os módulos que o entry importa depois iam com `Origin: http://192.168.100.28`
 * e tomavam 403: o grafo nunca fechava, o React não hidratava, e a tela ficava
 * morta (link `<a>` funcionava, `<button onClick>` e `useEffect` não). Por isso
 * os IPs são descobertos aqui em vez de fixos: o DHCP troca o endereço da rede e
 * um valor hardcoded quebraria o dev na LAN de novo.
 *
 * Entrada só com hostname, sem esquema e sem porta — é assim que o Next casa.
 * Só tem efeito em desenvolvimento; em produção a lista é ignorada, então um IP
 * de contêiner (Vercel) ou uma interface virtual não abre nada.
 */
function devOriginsFromNetwork(): string[] {
  const hosts: string[] = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      // IPv4 não-interno só: loopback já é liberado por padrão, e IPv6 de
      // link-local (fe80::) não é o endereço que aparece no link do terminal.
      if (address.family === "IPv4" && !address.internal) hosts.push(address.address);
    }
  }
  return hosts;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devOriginsFromNetwork(),
};

export default nextConfig;