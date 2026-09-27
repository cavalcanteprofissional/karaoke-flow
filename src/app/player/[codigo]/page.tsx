import type { Metadata } from "next";

import { PlayerErrorBoundary } from "@/components/rooms/player-error-boundary";
import { PlayerKiosk } from "@/components/rooms/player-kiosk";
import { getPlayerStateAction } from "@/lib/rooms/playback-actions";
import { parsePlayerToken } from "@/lib/rooms/playback";
import { normalizeRoomCode } from "@/lib/rooms/utils";

/**
 * Tela do player (Fase 6/8a) — rota PÚBLICA de propósito: é a TV do bar, aberta
 * em modo quiosque, sem login e sem cookie de sessão. A autorização tem duas
 * portas, conferidas no banco por `player_room_id` (`security definer`):
 *
 *   - `?token=` → a TV, com o token de capacidade que o host gerou;
 *   - sem token  → a sessão de quem está abrindo: dono da sala ou membro
 *     `approved`. É o caminho do participante que acabou de pedir uma música
 *     (ele vai para `/player/<codigo>` sem nunca ver o token).
 *
 * Esta página não recebe nenhum dado que essas duas portas não autorizem, e
 * ela também não é quebrada pelo proxy: `/player` não está em
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

  // Sem token: tenta a sessão. Quem não tem sessão nenhuma cai no aviso com o
  // caminho do QR (é o caso da TV aberta sem o link completo).
  const result = await getPlayerStateAction(code, token);
  if (!result.ok) {
    if (token) {
      return (
        <PlayerNotice
          title="Player não autorizado"
          description="Este link do player não é mais válido. Peça um link novo ao dono da sala."
        />
      );
    }
    return (
      <PlayerNotice
        title="Abra o link do player"
        description={`Entre na sala ${code} para assistir, ou peça ao dono da sala o link completo da TV.`}
      />
    );
  }

  // O boundary fica acima do quiosque de propósito: exceção no player (ou em
  // qualquer efeito da tela) vira o aviso com botão de recarregar, no lugar do
  // overlay de erro que deixava a TV morta durante a festa.
  return (
    <PlayerErrorBoundary>
      <PlayerKiosk roomCode={code} token={token} initialState={result.state} />
    </PlayerErrorBoundary>
  );
}
