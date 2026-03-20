import Link from "next/link";
import { Music } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="h-6 w-6" />
            <span className="font-bold text-xl">KaraokeFlow</span>
          </div>
          <nav className="flex gap-4">
            <Link
              href="/login"
              className="text-sm font-medium hover:underline"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90"
            >
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-2xl px-4">
          <h1 className="text-4xl font-bold mb-4">
            Bem-vindo ao KaraokeFlow
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Sistema de karaokê online. Solicite músicas, vote na playlist e
            aproveite a festa com seus amigos!
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:opacity-90"
            >
              Começar
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center border border-input bg-background px-6 py-3 rounded-md font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Entrar
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          KaraokeFlow - Sistema de Karaokê Online
        </div>
      </footer>
    </div>
  );
}
