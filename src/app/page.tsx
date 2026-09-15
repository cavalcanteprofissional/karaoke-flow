import Link from "next/link";
import { Mic2, MonitorPlay, QrCode, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Header } from "@/components/shell/header";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Header />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-28 pt-4">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <QrCode className="size-3.5" />
              Celular na mão, música na tela
            </span>
            <h1 className="text-4xl font-bold leading-tight tracking-tight">
              Karaokê ao vivo para bares e restaurantes
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              Seu público escaneia o QR code, adiciona as músicas na fila pelo
              celular e a playlist roda em tempo real na tela da casa — tudo
              controlado por você.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button asChild size="lg">
              <Link href="/login">Entrar / Criar sala</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/login">Explorar como participar</Link>
            </Button>
          </div>
        </section>

        <section className="mt-10 grid gap-3">
          <Card className="border-border/60 bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <QrCode className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Entrada em 1 toque</p>
                <p className="text-sm text-muted-foreground">
                  Escaneie o QR ou digite o código da casa e entre na fila.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <Mic2 className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Você escolhe a música</p>
                <p className="text-sm text-muted-foreground">
                  Busque no YouTube e adicione à fila em segundos.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <Smartphone className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Controle pelo celular</p>
                <p className="text-sm text-muted-foreground">
                  Pule, pause e reordene a fila sem tocar no dispositivo da TV.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-card">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <MonitorPlay className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Uma tela pra todo mundo</p>
                <p className="text-sm text-muted-foreground">
                  TV ou projetor em modo quiosque, com a fila legível a
                  distância.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}