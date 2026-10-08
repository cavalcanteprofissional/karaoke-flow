import Link from "next/link";
import { Settings2, Store, Ticket, Tv } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ScreenItem = {
  id: string;
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
};

type HostScreenNavProps = {
  roomCode: string;
  /** Código do bar da sala — sem bar não há tela `/bar/[codigo]` para linkar. */
  barCode: string | null;
};

/**
 * Navegação do host entre as telas de configuração (Fase 17): as
 * configurações saíram de `/salas/[codigo]` — que virou a tela ao vivo —
 * e viraram rotas filhas. Só o host vê; o participante continua na sala.
 * A tela do bar fica em `/bar/[codigo]` porque é configuração DO BAR, não
 * da sala (o mesmo bar pode ter várias salas).
 */
export function HostScreenNav({ roomCode, barCode }: HostScreenNavProps) {
  const items: ScreenItem[] = [
    {
      id: "player",
      href: `/salas/${roomCode}/player`,
      label: "Player",
      hint: "TV, fila e pedidos de entrada",
      icon: Tv,
    },
    {
      id: "sala",
      href: `/salas/${roomCode}/sala`,
      label: "Sala",
      hint: "Como funciona, mesas e código",
      icon: Settings2,
    },
    {
      id: "pulseiras",
      href: `/salas/${roomCode}/pulseiras`,
      label: "Pulseiras",
      hint: "Códigos e valores",
      icon: Ticket,
    },
    ...(barCode
      ? [
          {
            id: "bar",
            href: `/bar/${barCode}`,
            label: "Bar",
            hint: "Raio de presença e busca do YouTube",
            icon: Store,
          },
        ]
      : []),
  ];

  return (
    <nav aria-label="Configurações do host" className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="bg-card hover:bg-accent/60 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors"
        >
          <item.icon className="text-muted-foreground size-4" />
          <span className="flex flex-col leading-tight">
            {item.label}
            <span className="text-muted-foreground text-xs font-normal">{item.hint}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
