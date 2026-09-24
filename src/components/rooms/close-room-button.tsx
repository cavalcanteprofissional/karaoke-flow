"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Power } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { closeRoomAction } from "@/lib/rooms/actions";

type CloseRoomButtonProps = {
  roomId: string;
  disabled?: boolean;
};

export function CloseRoomButton({ roomId, disabled }: CloseRoomButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClose() {
    const confirmed = window.confirm(
      "Encerrar a sala? A fila será cancelada e interrompida, e todos os participantes serão expulsos. Só você (dono) pode reabrir."
    );
    if (!confirmed) return;

    setBusy(true);
    const result = await closeRoomAction(roomId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível encerrar a sala.");
      return;
    }
    toast.success("Sala encerrada.");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClose}
      disabled={disabled || busy}
    >
      <Power className="size-4" />
      Encerrar sala
    </Button>
  );
}
