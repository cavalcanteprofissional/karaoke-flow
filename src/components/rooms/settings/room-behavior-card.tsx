"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

export type RoomBehaviorInitial = {
  entry_mode: RoomEntryMode;
  queue_approval_mode: RoomQueueApprovalMode;
  require_song_confirmation: boolean;
  pre_approval_24h: boolean;
  no_stop: boolean;
  max_active_songs: number;
};

type RoomBehaviorCardProps = {
  roomId: string;
  initial: RoomBehaviorInitial;
};

/**
 * "Como a sala funciona" — os quatro toggles da sala. Partido de
 * `room-settings.tsx` na Fase 17, quando as configurações do host viraram
 * telas separadas (esta mora em `/salas/[codigo]/sala`).
 */
export function RoomBehaviorCard({ roomId, initial }: RoomBehaviorCardProps) {
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const optimistic = useRef(settings);

  async function commit(next: RoomBehaviorInitial) {
    optimistic.current = next;
    setSettings(next);
    setBusy(true);
    const result = await updateRoomSettingsAction(roomId, {
      entry_mode: next.entry_mode,
      queue_approval_mode: next.queue_approval_mode,
      require_song_confirmation: next.require_song_confirmation,
      pre_approval_24h: next.pre_approval_24h,
      no_stop: next.no_stop,
      max_active_songs: next.max_active_songs,
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
                ? "Qualquer um com o QR entra direto — mas só passa quem estiver dentro do raio de presença."
                : "Cada entrada precisa da sua aprovação — e de estar dentro do raio de presença."}
            </p>
          </div>
          <Switch
            id="toggle-entry"
            checked={settings.entry_mode === "open"}
            onCheckedChange={(checked) =>
              commit({
                ...optimistic.current,
                entry_mode: checked ? "open" : "approval",
              })
            }
          />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="toggle-queue" className="flex items-center gap-1.5">
              {settings.no_stop && <Lock className="size-3.5" />}
              Música com aprovação
            </Label>
            <p className="text-muted-foreground text-xs">
              {settings.no_stop
                ? "O modo no-stop dispensa aprovação: toda música já entra na fila."
                : settings.queue_approval_mode === "manual"
                  ? "Cada música fica pendente até você aprovar."
                  : "A música já entra direto na fila."}
            </p>
          </div>
          <Switch
            id="toggle-queue"
            checked={!settings.no_stop && settings.queue_approval_mode === "manual"}
            disabled={settings.no_stop}
            onCheckedChange={(checked) =>
              commit({
                ...optimistic.current,
                queue_approval_mode: checked ? "manual" : "auto",
              })
            }
          />
        </div>

        {/* Modo no-stop (Fase 19): rodízio por rodadas, várias músicas por
            pessoa e nada de aprovação. Ligado, a fila reordena na hora. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="toggle-no-stop">Modo no-stop (rodízio)</Label>
              <p className="text-muted-foreground text-xs">
                {settings.no_stop
                  ? "Todos podem pedir sem esperar a vez acabar. A fila roda por rodadas: a 1ª de cada um, depois a 2ª…"
                  : "Pedido só entra quando a sua música anterior termina, e cada pedido passa pela aprovação."}
              </p>
            </div>
            <Switch
              id="toggle-no-stop"
              checked={settings.no_stop}
              onCheckedChange={(checked) =>
                commit({ ...optimistic.current, no_stop: checked })
              }
            />
          </div>

          {settings.no_stop && (
            <div className="flex items-center justify-between gap-3 pl-1">
              <Label htmlFor="max-active-songs" className="text-xs">
                Músicas por pessoa
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-7"
                  aria-label="Diminuir o limite de músicas por pessoa"
                  disabled={busy || settings.max_active_songs <= 1}
                  onClick={() =>
                    commit({
                      ...optimistic.current,
                      max_active_songs: Math.max(1, settings.max_active_songs - 1),
                    })
                  }
                >
                  <span aria-hidden>−</span>
                </Button>
                <span
                  id="max-active-songs"
                  className="w-5 text-center text-sm font-medium"
                  aria-live="polite"
                >
                  {settings.max_active_songs}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-7"
                  aria-label="Aumentar o limite de músicas por pessoa"
                  disabled={busy || settings.max_active_songs >= 10}
                  onClick={() =>
                    commit({
                      ...optimistic.current,
                      max_active_songs: Math.min(10, settings.max_active_songs + 1),
                    })
                  }
                >
                  <span aria-hidden>+</span>
                </Button>
              </div>
            </div>
          )}
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

        {/* Pré-aprovação de 24h: o toggle é funcional (o estado OFF existe,
            está no banco e a regra respeita), mas fica TRAVADO em ON por
            decisão do PO — com "Entrada livre" desligada, quem foi aprovado
            há mais de 24h volta a pedir aprovação. Para liberar, basta
            remover o `disabled` e o `onCheckedChange` abaixo. */}
        <div className="flex items-start justify-between gap-3 opacity-60">
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="toggle-pre-approval" className="flex items-center gap-1.5">
              <Lock className="size-3.5" />
              Aprovação vale por 24h
            </Label>
            <p className="text-muted-foreground text-xs">
              Quem tem login e foi aprovado nas últimas 24h entra direto ao voltar para a
              sala. Usuário sem login nunca é pré-aprovado.
            </p>
          </div>
          <Switch
            id="toggle-pre-approval"
            checked={settings.pre_approval_24h}
            disabled
            aria-describedby="toggle-pre-approval-desc"
          />
          <span id="toggle-pre-approval-desc" className="sr-only">
            Padrão do app: pré-aprovação de 24h para usuários autenticados. O host não
            pode desligar esta opção.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
