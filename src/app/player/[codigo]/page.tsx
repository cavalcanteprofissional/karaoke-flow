import type { Metadata } from "next";

import { PlayerKiosk } from "@/components/rooms/player-kiosk";
import { getPlayerStateAction } from "@/lib/rooms/playback-actions";
import { parsePlayerToken } from "@/lib/rooms/playback";
import { normalizeRoomCode } from "@/lib/rooms/utils";

/**
 * Tela do player (Fase 6) — rota PÚBLICA de propósito: é a TV do bar, aberta
 * em modo quiosque, sem login e sem cookie de sessão. A autorização é o token
 * de capacidade na URL (`?token=`), conferido no banco por `get_player_state`
 * (`security definer`), então esta página não recebe nenhum dado que o token
 * não autorize. Ela também não é quebrada pelo proxy: `/player` não está em
 * `PROTECTED_PREFIXES`.
 */
export const metadata: Metadata = {
  title: "Player do karaokê",
  robots: { index: false, follow: false },
};

type PlayerPageProps = {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

function PlayerNotice({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-black p-8 text-white">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <p className="text-3xl font-bold">{title}</p>
        <p className="text-lg text-zinc-400">{description}</p>
      </div>
    </div>
  );
}

export default async function PlayerPage({ params, searchParams }: PlayerPageProps) {
  const { codigo } = await params;
  const { token: rawToken } = await searchParams;
  const code = normalizeRoomCode(codigo);
  const token = parsePlayerToken(rawToken);

  if (!token) {
    return (
      <PlayerNotice
        title="Link do player incompleto"
        description="Abra o link completo que o dono da sala gerou, com o código do player no final da URL."
      />
    );
  }

  const result = await getPlayerStateAction(code, token);
  if (!result.ok) {
    return (
      <PlayerNotice
        title="Player não autorizado"
        description="Este link do player não é mais válido. Peça um link novo ao dono da sala."
      />
    );
  }

  return <PlayerKiosk roomCode={code} token={token} initialState={result.state} />;
}
