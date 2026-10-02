import Image from "next/image";
import Link from "next/link";

/**
 * Rodapé do app (2026-10-03), copiado do linktree do dev.
 *
 * Duas decisões que não são óbvias:
 *
 *   1. **Não entra na `/player`.** A tela da TV é `fixed inset-0`, sem rolagem:
 *      um rodapé empurraria o player para fora da tela ou apareceria cortado. É
 *      por isso que o rodapé é montado nas telas de app (`(app)`, `/login`,
 *      landing e `/sobre`) e não no layout raiz.
 *   2. **O ano vem do servidor.** `new Date()` num client component é um
 *      convite a hydration mismatch na virada de ano (o servidor renderiza
 *      2026, o cliente já está em 2027). Aqui ele é server component.
 *
 * O link "Sobre" é `/sobre`, a página com o projeto, o dev e a doação Pix.
 */
export function SiteFooter() {
  return (
    <footer className="mt-12 w-full border-t pt-8 pb-6">
      <div className="text-muted-foreground mx-auto flex max-w-md flex-col items-center justify-between gap-4 px-4 text-xs sm:flex-row">
        <p className="text-center sm:text-left">
          © {new Date().getFullYear()} Lucas Cavalcante.
          <br className="hidden sm:block" />
          Todos os direitos reservados.
        </p>
        <div className="flex items-center gap-4">
          <Link href="/sobre" className="hover:text-foreground transition-colors">
            Sobre
          </Link>
          <a
            href="https://github.com/cavalcanteprofissional"
            target="_blank"
            rel="noopener noreferrer"
            className="group hover:text-primary flex items-center gap-2 transition-colors"
          >
            <span>Produzido por</span>
            <Image
              src="/images/assinatura-lucas.png"
              alt="Lucas Cavalcante"
              width={103}
              height={80}
              className="h-7 w-auto opacity-70 transition-opacity group-hover:opacity-100"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
