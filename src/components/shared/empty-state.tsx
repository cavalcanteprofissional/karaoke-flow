import type { LucideIcon } from "lucide-react";

import { cn } from "cn";

type EmptyStateProps = {
  /** Ícone (lucide) opcional. */
  icon?: LucideIcon;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Ação opcional (botão/link) renderizada abaixo do texto. */
  action?: React.ReactNode;
  /**
   * `bordered` (padrão): caixa tracejada com ícone em selo — para tela/estado
   * vazio de destaque. `quiet`: texto discreto centralizado — para seções
   * internas (fila, listas, contagens).
   */
  variant?: "bordered" | "quiet";
  className?: string;
};

/**
 * Estado vazio/aviso único do app. Antes havia três idiomas visuais (caixa
 * tracejada + ícone, card tracejado e um `<p>` solto) espalhados pelas telas;
 * agora é um só lugar. A cor do ícone herda os tokens do design system.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "bordered",
  className,
}: EmptyStateProps) {
  if (variant === "quiet") {
    return (
      <div className={cn("flex flex-col items-center gap-2 p-4 text-center", className)}>
        {Icon && <Icon className="text-muted-foreground size-5" aria-hidden />}
        {title && <p className="text-sm font-medium">{title}</p>}
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
        {action}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center",
        className
      )}
    >
      {Icon && (
        <span className="bg-secondary text-secondary-foreground flex size-12 items-center justify-center rounded-2xl">
          <Icon className="size-6" aria-hidden />
        </span>
      )}
      {(title || description) && (
        <div className="flex flex-col gap-1">
          {title && <p className="font-medium">{title}</p>}
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
      )}
      {action}
    </div>
  );
}
