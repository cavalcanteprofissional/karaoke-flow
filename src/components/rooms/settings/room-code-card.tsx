"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateRoomCodeAction } from "@/lib/rooms/actions";

type RoomCodeCardProps = {
  roomId: string;
  roomCode: string;
};

/**
 * "Código de entrada" — troca o código da sala (`updateRoomCodeAction`).
 * Partido de `room-settings.tsx` na Fase 17; mora em `/salas/[codigo]/sala`.
 * Depois de salvar, navega para a rota nova: o código antigo deixa de existir.
 */
export function RoomCodeCard({ roomId, roomCode }: RoomCodeCardProps) {
  const router = useRouter();
  const [roomCodeInput, setRoomCodeInput] = useState(roomCode);
  const [codeBusy, setCodeBusy] = useState(false);

  async function saveRoomCode() {
    setCodeBusy(true);
    const result = await updateRoomCodeAction(roomId, roomCodeInput);
    setCodeBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível trocar o código.");
      return;
    }
    toast.success(`Código atualizado! Novo link: /salas/${result.newCode}`);
    router.push(`/salas/${result.newCode}/sala`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="text-muted-foreground size-4" />
          Código de entrada
        </CardTitle>
        <CardDescription>
          Quem digita este código na entrada vai direto para a sala — a mesa é escolhida
          depois, dentro do karaokê. Trocar o código muda o link{" "}
          <span className="font-mono">/salas/…</span> e o QR que você compartilha.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            id="room-code"
            value={roomCodeInput}
            onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
            maxLength={12}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="font-mono tracking-[0.2em] uppercase"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={saveRoomCode}
            disabled={codeBusy || roomCodeInput.trim().toUpperCase() === roomCode}
          >
            {codeBusy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            Salvar
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          3–12 letras ou números, sem acentos ou espaços. Padrão: o nome do bar em
          maiúsculas (ex.: <span className="font-mono">KARAOKEDOZE</span>) ou{" "}
          <span className="font-mono">KARAOKE</span> quando não há nome.
        </p>
      </CardContent>
    </Card>
  );
}
