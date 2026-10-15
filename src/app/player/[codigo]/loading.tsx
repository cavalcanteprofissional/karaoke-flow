import { Skeleton } from "@/components/ui/skeleton";

/**
 * A TV (`/player/[codigo]`) é tela cheia e sempre escura (ver `player-kiosk`).
 * O esqueleto acompanha: `dark` fixo, fundo preto e conteúdo centrado.
 */
export default function PlayerLoading() {
  return (
    <div className="dark flex h-dvh flex-col items-center justify-center gap-6 bg-black p-8">
      <Skeleton className="h-10 w-64 max-w-full" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="mt-4 h-4 w-40 bg-white/10" />
    </div>
  );
}
