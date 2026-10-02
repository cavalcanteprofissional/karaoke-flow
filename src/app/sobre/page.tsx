import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Code2, Heart, Music4, QrCode, Smartphone, Tv } from "lucide-react";

import { PixDonation } from "@/components/about/pix-donation";
import { SiteFooter } from "@/components/shell/site-footer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sobre",
  description:
    "Como o Karaokê Watch Party funciona, quem faz o projeto e como apoiar o desenvolvimento.",
};

/**
 * Página pública (fora de `(app)`): quem ainda não criou conta precisa poder
 * ler **sobre o que o app é** e apoiar — colocar a doação atrás do login seria
 * exatamente a parede errada aqui.
 */
export default function AboutPage() {
  // Chave Pix é pública por natureza (é o endereço de recebimento), então pode
  // ir no bundle — mas fica em env para não virar código. Sem a chave, a seção
  // avisa em vez de mostrar QR quebrado.
  const chave = process.env.NEXT_PUBLIC_PIX_KEY?.trim() ?? "";
  const cidade = process.env.NEXT_PUBLIC_PIX_CITY?.trim() || "Sao Paulo";
  const nome = process.env.NEXT_PUBLIC_PIX_NAME?.trim() || "Lucas Cavalcante";

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="self-start">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Voltar
          </Link>
        </Button>

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Karaokê Watch Party</h1>
          <p className="text-muted-foreground text-sm">
            Karaokê ao vivo para bar e restaurante: o público pede música pelo celular e a
            playlist toca na TV da casa, em tempo real. Feito por{" "}
            <a
              href="https://github.com/cavalcanteprofissional"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Lucas Cavalcante
            </a>
            .
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Music4 className="size-4" />
              Como funciona
            </CardTitle>
            <CardDescription>A noite inteira em quatro passos.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Passo
              icone={<QrCode className="size-4" />}
              titulo="O host cria a sala e imprime o QR"
              texto="Cada mesa do bar tem um QR. O papel vai na mesa e o QR aponta direto para a sala — sem digitar código."
            />
            <Passo
              icone={<Smartphone className="size-4" />}
              titulo="O guest entra pelo celular"
              texto="Escaneia o QR, vê a fila ao vivo e pede música. Se o bar cobra aprovação, a entrada cai na fila do host — que aprova ou recusa em um toque."
            />
            <Passo
              icone={<Tv className="size-4" />}
              titulo="A TV toca a fila"
              texto="A tela da casa roda a playlist. A TV só começa a tocar depois de um toque humano, porque navegador bloqueia áudio automático."
            />
            <Passo
              icone={<Heart className="size-4" />}
              titulo="Ocupação e presença, na mão do host"
              texto="O dono vê quantas pessoas estão na sala, quantas dentro do raio do bar e quantas em cada mesa — atualizado sozinho. Quem está fora do raio entra e assiste, mas não pede música."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Code2 className="size-4" />
              Sobre o projeto
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
            <p>
              Nasci da irritação real: todo app de karaokê resolve duas pessoas por vez. O
              objetivo aqui é o contrário — a TV toca sem ninguém segurar o celular, e quem
              está na mesa só precisa apontar a câmera.
            </p>
            <p>
              O código é meu, do zero, e está no GitHub. Se você abre bar, restaurante ou
              casa de festa e quiser rodar o seu,{" "}
              <a
                href="https://github.com/cavalcanteprofissional"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-4"
              >
                github.com/cavalcanteprofissional
              </a>
              .
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="size-4" />
              Sobre mim
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            <p>
              Sou Lucas Cavalcante, desenvolvedor e dono do Karaokê Watch Party. Construo
              software que resolve problema de gente — e este projeto nasceu de uma noites
              em que a fila de karaokê virou o centro da conversa. Feedback, bug e crítica
              (principalmente sobre o que ainda não funciona) são bem-vindos.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="text-destructive size-4" />
              Apoiar o projeto
            </CardTitle>
            <CardDescription>
              Pix de qualquer valor, para manter o app de pé. Servidor, busca no YouTube e
              Rate limit têm custo todo mês.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chave ? (
              <PixDonation chave={chave} nome={nome} cidade={cidade} />
            ) : (
              <p className="text-muted-foreground text-sm">
                A chave Pix ainda não foi configurada neste deploy. Para apoiar, me chame no
                GitHub e eu te passo a chave.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}

function Passo({
  icone,
  titulo,
  texto,
}: {
  icone: React.ReactNode;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="bg-muted/50 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md">
        {icone}
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="font-medium">{titulo}</p>
        <p className="text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}
