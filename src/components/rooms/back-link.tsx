import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type BackLinkProps = {
  roomCode: string;
  label?: string;
};

/**
 * Volta para a tela ao vivo da sala. Cada tela de configuração da Fase 17
 * monta a própria navegação (o repo não tem `layout.tsx` em `[codigo]` —
 * o mesmo padrão da rota `buscar`).
 */
export function BackLink({ roomCode, label }: BackLinkProps) {
  return (
    <Link
      href={`/salas/${roomCode}`}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
    >
      <ArrowLeft className="size-3.5" />
      {label ?? `Voltar à sala ${roomCode}`}
    </Link>
  );
}
