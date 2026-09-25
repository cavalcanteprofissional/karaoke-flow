"use client";

import { cn } from "cn";

type MesaGridProps = {
  quantidadeMesas: number;
  selected: number | null;
  onSelect: (mesa: number) => void;
};

/** Grade seletora de mesa (1..N do bar) — usada na preview de entrada e na
 * escolha obrigatória dentro da sala (entrada por código, sem mesa). */
export function MesaGrid({ quantidadeMesas, selected, onSelect }: MesaGridProps) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
      {Array.from({ length: quantidadeMesas }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onSelect(n)}
          className={cn(
            "border-border hover:bg-secondary/60 flex h-12 items-center justify-center rounded-lg border font-mono text-base font-semibold transition-colors",
            selected === n && "border-primary bg-primary text-primary-foreground"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
