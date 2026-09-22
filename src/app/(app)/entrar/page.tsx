import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, DoorOpen, ShieldCheck, User } from "lucide-react";

import { EnterRoomForm } from "@/components/rooms/enter-room-form";
import { JoinConfirm } from "@/components/rooms/join-confirm";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRoomPreviewAction } from "@/lib/rooms/actions";
import { createClient } from "@/lib/supabase/server";
import { normalizeRoomCode } from "@/lib/rooms/utils";

type EnterPageProps = {
  searchParams: Promise<{ code?: string }>;
};

export default async function EnterPage({ searchParams }: EnterPageProps) {
  const { code: rawCode } = await searchParams;
  const code = rawCode ? normalizeRoomCode(rawCode) : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (code) {
    const { preview } = await getRoomPreviewAction(code);

    if (preview) {
      if (user && preview.host_id === user.id) {
        redirect(`/salas/${code}`);
      }

      return (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
            >
              <ArrowLeft className="size-4" />
              Voltar
            </Link>
            <h1 className="text-lg font-semibold tracking-tight">Entrar na sala</h1>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-xl tracking-[0.2em]">
                {preview.code}
              </CardTitle>
              <CardDescription className="flex items-center gap-1.5">
                <User className="size-3.5" />
                Sala de {preview.host_name}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                {preview.entry_mode === "open" ? (
                  <Badge variant="secondary">
                    <DoorOpen className="size-3.5" />
                    Entrada livre
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    <ShieldCheck className="size-3.5" />
                    Entrada com aprovação
                  </Badge>
                )}
              </div>
              <JoinConfirm code={preview.code} />
            </CardContent>
          </Card>

          <div className="border-border rounded-xl border border-dashed p-4">
            <p className="text-muted-foreground mb-2 text-sm">Outra sala?</p>
            <EnterRoomForm />
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-6">
        <div className="text-destructive border-destructive/30 bg-destructive/10 flex items-center gap-2 rounded-lg border p-3 text-sm">
          Sala não encontrada ou inativa. Confira o código e tente de novo.
        </div>
        <EnterRoomForm />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Entrar em uma sala</h1>
        <p className="text-muted-foreground text-sm">
          Digite o código do cartaz ou escaneie o QR da casa.
        </p>
      </div>
      <EnterRoomForm />
    </div>
  );
}
