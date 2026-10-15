import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

/**
 * Esqueletos de carregamento reutilizados pelos `loading.tsx` (débito M8 —
 * "sem loading.tsx/skeletons", docs/engenharia/melhorias.md). Renderizam
 * **dentro** do `<main>` do `AppShell`, que já traz o `kf-container`; por isso
 * aqui não há largura de container nem cabeçalho do app.
 *
 * São server components de propósito: não usam estado nem hooks.
 */

/** Título + linha de apoio, no topo de uma tela. */
export function SkeletonTitle({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-4 w-60 max-w-full" />
    </div>
  );
}

/** Um card com título e algumas linhas de conteúdo. */
export function SkeletonCard({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("bg-card flex flex-col gap-3 rounded-xl border p-4", className)}>
      <Skeleton className="h-5 w-1/3" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton
            key={index}
            className="h-4"
            style={{ width: `${92 - index * 14}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Uma linha de lista (fila, participantes, códigos…). */
export function SkeletonListRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border p-3", className)}>
      <Skeleton className="size-10 shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/** Lista de `rows` linhas. */
export function SkeletonList({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonListRow key={index} />
      ))}
    </div>
  );
}

/**
 * Esqueleto genérico de tela: título + `cards` cards. É o fallback do grupo
 * `(app)` — cobre qualquer navegação filha que não tenha um `loading.tsx`
 * próprio.
 */
export function ScreenSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonTitle />
      <div className="flex flex-col gap-3">
        {Array.from({ length: cards }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    </div>
  );
}
