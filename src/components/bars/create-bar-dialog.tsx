"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Store } from "lucide-react";
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
import { createBarAction } from "@/lib/bars/actions";
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
  });

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await createBarAction({
      nome: form.nome,
      cidade: form.cidade,
      endereco: form.endereco,
      quantidade_mesas: form.quantidade_mesas,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Bar criado! Código ${result.bar.code}.`);
    setOpen(false);
    router.push(`/salas/${result.bar.room_code}`);
    router.refresh();
  }

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
              Endereço <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="bar-endereco"
              value={form.endereco}
              onChange={(e) => set("endereco", e.target.value)}
              placeholder="Rua, número, bairro"
              maxLength={160}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy} className={cn(busy && "opacity-80")}>
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Criar bar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}