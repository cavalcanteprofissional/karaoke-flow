"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createRoomAction } from "@/lib/rooms/actions";
import { cn } from "cn";

type CreateRoomButtonProps = {
  className?: string;
};

export function CreateRoomButton({ className }: CreateRoomButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    try {
      const room = await createRoomAction();
      router.push(`/salas/${room.code}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível criar a sala."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={handleCreate}
      disabled={busy}
      className={cn("w-full", className)}
    >
      {busy ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Plus className="size-4" />
      )}
      Criar nova sala
    </Button>
  );
}
