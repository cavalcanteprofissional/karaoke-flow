"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

import { QrScanner } from "@/components/rooms/qr-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeRoomCode } from "@/lib/rooms/utils";

export function EnterRoomForm() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) return;
    router.push(`/entrar?code=${normalized}`);
  }

  function handleScanned(scannedCode: string) {
    router.push(`/entrar?code=${scannedCode}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Label htmlFor="room-code" className="text-muted-foreground text-xs">
          Código da sala (6 caracteres)
        </Label>
        <div className="flex gap-2">
          <Input
            id="room-code"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            placeholder="EX: KARAOK"
            value={code}
            onChange={(event) => setCode(normalizeRoomCode(event.target.value))}
            className="font-mono text-lg tracking-[0.3em] uppercase"
          />
          <Button type="submit" size="lg" className="px-5">
            <KeyRound className="size-4" />
            Ver sala
          </Button>
        </div>
      </form>

      <div className="text-muted-foreground relative flex items-center gap-2 text-xs">
        <span className="bg-border h-px flex-1" />
        ou
        <span className="bg-border h-px flex-1" />
      </div>

      <div className="flex items-center justify-center gap-2">
        <QrScanner onResult={handleScanned} triggerLabel="Escanear o QR da casa" />
      </div>

      <p className="text-muted-foreground text-center text-xs">
        O código e o QR estão no cartaz ou na tela do karaokê.
      </p>
    </div>
  );
}
