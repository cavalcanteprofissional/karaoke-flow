"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { leaveRoomAction } from "@/lib/rooms/actions";

type LeaveRoomButtonProps = {
  roomId: string;
};

export function LeaveRoomButton({ roomId }: LeaveRoomButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLeave() {
    const confirmed = window.confirm("Sair desta sala? Você para de ver a fila.");
    if (!confirmed) return;

    setBusy(true);
    const result = await leaveRoomAction(roomId);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível sair da sala.");
      return;
    }
    toast.success("Você saiu da sala.");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" onClick={handleLeave} disabled={busy}>
      {busy ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <DoorOpen className="size-4" />
      )}
      Sair da sala
    </Button>
  );
}
