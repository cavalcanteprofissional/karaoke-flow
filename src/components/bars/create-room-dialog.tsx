"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Mic2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRoomAction } from "@/lib/bars/actions";
import { deriveRoomCodeFromName } from "@/lib/rooms/utils";
import { cn } from "cn";

/**
 * Abre mais uma sala (karaokê) dentro de um bar existente.
 *
 * O botão nasce desabilitado só por falta de rota: até a Fase 8b·quater não
 * existia RPC nem action para uma 2ª sala num bar (`create_bar` sempre cria o
 * bar junto com a primeira sala). A autorização é da RPC `create_room`, que
 * exige `bars.host_id = auth.uid()` — aqui só mostramos o formulário.
 */
export function CreateRoomDialog({
  barId,
  barName,
  triggerLabel = "Adicionar sala",
  triggerVariant = "outline",
  triggerSize = "sm",
}: {
  barId: string;
  barName: string;
  triggerLabel?: string;
  triggerVariant?: "outline" | "secondary" | "default" | "ghost";
  triggerSize?: "sm" | "default";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [codigo, setCodigo] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await createRoomAction({
      bar_id: barId,
      codigo_entrada: codigo || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Sala aberta! Código ${result.room.code}.`);
    setOpen(false);
    setCodigo("");
    router.push(`/salas/${result.room.code}`);
    router.refresh();
  }

  const defaultCode = deriveRoomCodeFromName(barName) ?? "KARAOKE";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          <Mic2 className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic2 className="size-4" />
            Nova sala em {barName}
          </DialogTitle>
          <DialogDescription>
            A sala nova nasce com o mesmo dono, as mesmas mesas e o mesmo raio de
            presença do bar — só a fila e o player são dela.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`room-codigo-${barId}`} className="text-xs">
              Código de entrada <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id={`room-codigo-${barId}`}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder={defaultCode}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={12}
              className="font-mono tracking-[0.2em] uppercase"
            />
            <p className="text-muted-foreground text-xs">
              3–12 letras ou números. Se deixar vazio, o banco escolhe um código
              livre.
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={busy} className={cn(busy && "opacity-80")}>
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Abrir sala
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}