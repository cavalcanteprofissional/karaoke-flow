"use client";

import Link from "next/link";
import { Music, ListMusic, CheckCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/useUser";

export default function AdminDashboardPage() {
  const user = useUser();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Painel de Administração</h1>
        <p className="text-muted-foreground">
          Bem-vindo, {user?.full_name || user?.email}. Gerencie a playlist e aprovações.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/administracao/approvals">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Aprovações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Revise e aprove as solicitações de músicas pendentes.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/administracao/playlist-manager">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListMusic className="h-5 w-5" />
                Gerenciar Playlist
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Reordene, remova músicas e controle a reprodução.
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/player">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music className="h-5 w-5" />
                Player
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Controle a reprodução de música em tela cheia.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
