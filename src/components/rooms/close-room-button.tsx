"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Power, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { closeRoomAction, reopenRoomAction } from "@/lib/rooms/actions";

type CloseRoomButtonProps = {
  roomId: string;
  /** true quando a sala já está encerrada → o botão vira "Reabrir sala". */
  closed?: boolean;
};

export function CloseRoomButton({ roomId, closed }: CloseRoomButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClose() {
    const confirmed = window.confirm(
      "Encerrar o karaokê? A fila será cancelada e interrompida, e todos os participantes serão expulsos. Você poderá reabrir depois."
    );
    if (!confirmed) return;

    setBusy(true);
    const result = await closeRoomAction(roomId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível encerrar o karaokê.");
      return;
    }
    toast.success("Karaokê encerrado.");
    router.refresh();
  }

  async function handleReopen() {
    setBusy(true);
    const result = await reopenRoomAction(roomId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível reabrir o karaokê.");
      return;
    }
    toast.success("Karaokê reaberto — a galera já pode entrar de novo.");
    router.refresh();
  }

  if (closed) {
    return (
      <Button type="button" variant="secondary" onClick={handleReopen} disabled={busy}>
        <RotateCcw className="size-4" />
        Reabrir sala
      </Button>
    );
  }

  return (
    <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>
      <Power className="size-4" />
      Encerrar sala
    </Button>
  );
}
