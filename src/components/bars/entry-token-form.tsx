"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

import { QrScanner } from "@/components/rooms/qr-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { entryRoute, extractEntryToken, parseEntryToken } from "@/lib/bars/qr";
import { normalizeRoomCode } from "@/lib/rooms/utils";

export function EntryTokenForm() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function go(tokenText: string) {
    const token = parseEntryToken(tokenText);
    if (!token) return;
    if (!token.bar && !token.roomCode) return;
    router.push(entryRoute(token));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = normalizeRoomCode(value);
    if (!normalized) return;
    go(normalized);
  }

  function handleScanned(text: string) {
    go(text);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Label htmlFor="entry-token" className="text-muted-foreground text-xs">
          Código do bar ou da casa (3–12 caracteres)
        </Label>
        <div className="flex gap-2">
          <Input
            id="entry-token"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={12}
            placeholder="EX: KARAOKE"
            value={value}
            onChange={(event) => setValue(normalizeRoomCode(event.target.value))}
            className="font-mono text-lg tracking-[0.3em] uppercase"
          />
          <Button type="submit" size="lg" className="px-5">
            <KeyRound className="size-4" />
            Ver
          </Button>
        </div>
      </form>

      <div className="text-muted-foreground relative flex items-center gap-2 text-xs">
        <span className="bg-border h-px flex-1" />
        ou
        <span className="bg-border h-px flex-1" />
      </div>

      <div className="flex items-center justify-center">
        <QrScanner
          onResult={handleScanned}
          triggerLabel="Escanear o QR da mesa"
          match={extractEntryToken}
        />
      </div>

      <p className="text-muted-foreground text-center text-xs">
        O código e o QR estão no cartaz ou na mesa da casa.
      </p>
    </div>
  );
}
