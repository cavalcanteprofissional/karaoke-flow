"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, MapPin, Navigation, Plus, Store } from "lucide-react";
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
import { createBarAction, geocodeBarAddressAction } from "@/lib/bars/actions";
import { captureGeolocation, roundCoords, type GeoCoordinates } from "@/lib/consent/geo";
import { deriveRoomCodeFromName } from "@/lib/rooms/utils";
import { cn } from "cn";

export function CreateBarDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    cidade: "",
    endereco: "",
    quantidade_mesas: "1",
    raio_permitido_metros: "500",
    codigo_entrada: "",
  });
  const [coords, setCoords] = useState<GeoCoordinates | null>(null);
  const [locSource, setLocSource] = useState<"address" | "gps" | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function localizarPorEndereco() {
    if (!form.endereco.trim()) {
      toast.error("Preencha o endereço antes de localizar.");
      return;
    }
    setLocSource("address");
    const result = await geocodeBarAddressAction(form.endereco, form.cidade);
    setLocSource(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCoords({ latitude: result.latitude, longitude: result.longitude });
    toast.success("Endereço localizado. Raio de presença configurado sobre ele.");
  }

  async function usarLocalizacaoAtual() {
    setLocSource("gps");
    const geo = await captureGeolocation();
    setLocSource(null);
    if (geo.status !== "granted" || !geo.coords) {
      toast.error(
        geo.status === "denied"
          ? "Localização negada no navegador. Libere nas configurações."
          : "Não foi possível obter sua localização."
      );
      return;
    }
    setCoords({ latitude: geo.coords.latitude, longitude: geo.coords.longitude });
    toast.success("Localização atual do bar registrada.");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await createBarAction({
      nome: form.nome,
      cidade: form.cidade,
      endereco: form.endereco,
      quantidade_mesas: form.quantidade_mesas,
      raio_permitido_metros: Number(form.raio_permitido_metros) || 500,
      latitude: coords ? roundCoords(coords.latitude, 5) : null,
      longitude: coords ? roundCoords(coords.longitude, 5) : null,
      codigo_entrada: form.codigo_entrada || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      coords
        ? "Bar criado! Localização e raio de presença registrados."
        : `Bar criado! Código ${result.bar.code}. Dica: registre a localização do bar para ativar a proteção de presença.`
    );
    setOpen(false);
    router.push(`/salas/${result.bar.room_code}`);
    router.refresh();
  }

  const locResolving = locSource !== null;
  const defaultCode = form.nome.trim()
    ? (deriveRoomCodeFromName(form.nome) ?? "KARAOKE")
    : "KARAOKE";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Plus className="size-4" />
          Criar meu bar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="size-4" />
            Criar meu bar
          </DialogTitle>
          <DialogDescription>
            O seu bar vira um perfil com QR próprio e seguimos para mesas e karaokês.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bar-nome" className="text-xs">
              Nome do bar
            </Label>
            <Input
              id="bar-nome"
              value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              placeholder="Ex: Karaokê do Zé"
              required
              maxLength={80}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bar-cidade" className="text-xs">
                Cidade
              </Label>
              <Input
                id="bar-cidade"
                value={form.cidade}
                onChange={(e) => set("cidade", e.target.value)}
                placeholder="Ex: São Paulo"
                maxLength={80}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bar-mesas" className="text-xs">
                Quantidade de mesas
              </Label>
              <Input
                id="bar-mesas"
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                value={form.quantidade_mesas}
                onChange={(e) => set("quantidade_mesas", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bar-endereco" className="text-xs">
              Endereço <span className="text-muted-foreground">(recomendado)</span>
            </Label>
            <Input
              id="bar-endereco"
              value={form.endereco}
              onChange={(e) => set("endereco", e.target.value)}
              placeholder="Rua, número, bairro"
              maxLength={160}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bar-codigo" className="text-xs">
              Código de entrada <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="bar-codigo"
              value={form.codigo_entrada}
              onChange={(e) => set("codigo_entrada", e.target.value)}
              placeholder={defaultCode}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={12}
              className="font-mono tracking-[0.2em] uppercase"
            />
            <p className="text-muted-foreground text-xs">
              Quem digitar este código entra direto na sala, sem mesa (a mesa é escolhida
              depois). Padrão: <span className="font-mono">{defaultCode}</span> — 3–12
              letras ou números, sem acentos.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Localização do bar (GPS)</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={localizarPorEndereco}
                disabled={locResolving}
              >
                {locSource === "address" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <MapPin className="size-4" />
                )}
                Localizar pelo endereço
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={usarLocalizacaoAtual}
                disabled={locResolving}
              >
                {locSource === "gps" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Navigation className="size-4" />
                )}
                Usar minha localização atual
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {coords
                ? "Localização registrada (somos aqui)."
                : "Ainda sem localização — a proteção de presença ficará desativada."}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bar-raio" className="text-xs">
              Raio de presença (metros)
            </Label>
            <Input
              id="bar-raio"
              type="number"
              inputMode="numeric"
              min={50}
              max={1000}
              value={form.raio_permitido_metros}
              onChange={(e) => set("raio_permitido_metros", e.target.value)}
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <p className="text-xs leading-relaxed">
              A localização e o raio de presença confirmam que quem pede música está{" "}
              <strong>fisicamente no bar</strong>, bloqueando acesso remoto à fila. Se o
              bar não tiver localização, essa proteção fica desativada.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy} className={cn(busy && "opacity-80")}>
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Criar bar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
