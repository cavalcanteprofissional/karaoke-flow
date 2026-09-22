"use client";

import { useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { updateRoomSettingsAction } from "@/lib/rooms/actions";
import type { RoomEntryMode, RoomQueueApprovalMode } from "@/types/room";

type RoomSettingsProps = {
  roomId: string;
  initial: {
    entry_mode: RoomEntryMode;
    queue_approval_mode: RoomQueueApprovalMode;
    require_song_confirmation: boolean;
  };
};

export function RoomSettings({ roomId, initial }: RoomSettingsProps) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const optimistic = useRef(settings);

  async function commit(next: typeof optimistic.current) {
    optimistic.current = next;
    setSettings(next);
    setBusy(true);
    const result = await updateRoomSettingsAction(roomId, {
      entry_mode: next.entry_mode,
      queue_approval_mode: next.queue_approval_mode,
      require_song_confirmation: next.require_song_confirmation,
    });
    if (!result.ok) {
      optimistic.current = initial;
      setSettings(initial);
      toast.error(result.error ?? "Não foi possível salvar.");
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Como a sala funciona
          {busy && (
            <LoaderCircle className="text-muted-foreground size-3.5 animate-spin" />
          )}
        </CardTitle>
        <CardDescription>
          As mudanças valem na hora e ficam salvas para a próxima reentrada.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="toggle-entry">Entrada livre</Label>
            <p className="text-muted-foreground text-xs">
              {settings.entry_mode === "open"
                ? "Qualquer um com o QR entra direto."
                : "Cada entrada precisa da sua aprovação."}
            </p>
          </div>
          <Switch
            id="toggle-entry"
            checked={settings.entry_mode === "open"}
            onCheckedChange={(checked) =>
              commit({ ...optimistic.current, entry_mode: checked ? "open" : "approval" })
            }
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="toggle-queue">Música sem aprovação</Label>
            <p className="text-muted-foreground text-xs">
              {settings.queue_approval_mode === "auto"
                ? "A música já entra direto na fila."
                : "Cada música fica pendente até você aprovar."}
            </p>
          </div>
          <Switch
            id="toggle-queue"
            checked={settings.queue_approval_mode === "auto"}
            onCheckedChange={(checked) =>
              commit({
                ...optimistic.current,
                queue_approval_mode: checked ? "auto" : "manual",
              })
            }
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div>
            <Label htmlFor="toggle-confirm">Pedir confirmação do vídeo</Label>
            <p className="text-muted-foreground text-xs">
              Mostra thumbnail e duração antes de entrar na fila.
            </p>
          </div>
          <Switch
            id="toggle-confirm"
            checked={settings.require_song_confirmation}
            onCheckedChange={(checked) =>
              commit({ ...optimistic.current, require_song_confirmation: checked })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
