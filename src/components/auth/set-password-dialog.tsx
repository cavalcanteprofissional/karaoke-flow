"use client";

import { useState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
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
import { createClient } from "@/lib/supabase/client";

type SetPasswordItemProps = {
  /** A conta veio de um provedor externo (GitHub/Google)? Muda só o texto. */
  hasProvider?: boolean;
};

/** Mesma faixa do GoTrue (mínimo 6); 8 só para não aceitar senha de um caractere. */
const MIN_LEN = 8;

/**
 * Define/define-de-novo a senha de quem está logado, para dar uma segunda porta
 * de entrada além do OAuth.
 *
 * Por que `updateUser` e não `admin.updateUserById`: a API de admin é para o
 * backend e alcança qualquer conta; esta roda com o JWT da sessão, ou seja só
 * mexe na própria conta de quem está logado. Para a conta do dono do projeto a
 * service role resolve (senha privada, sem digitar no browser) — ver README.
 *
 * O client NÃO consegue saber se a conta já tem senha: o GoTrue guarda o hash em
 * `auth.users.encrypted_password`, que nunca vai para o `user` do browser. Por
 * isso o item fica sempre disponível em vez de condicional — chamar de novo só
 * troca a senha.
 */
export function SetPasswordItem({ hasProvider = false }: SetPasswordItemProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirm, setConfirm] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    if (senha.length < MIN_LEN) {
      setErro(`A senha precisa de pelo menos ${MIN_LEN} caracteres.`);
      return;
    }
    if (senha !== confirm) {
      setErro("As senhas não batem.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });
    setBusy(false);
    if (error) {
      setErro(error.message);
      toast.error("Não foi possível definir a senha.", { description: error.message });
      return;
    }
    setOpen(false);
    setSenha("");
    setConfirm("");
    toast.success("Senha salva. Agora você também entra com e-mail e senha.");
  }

  const rotulo = hasProvider ? "Definir/alterar senha" : "Definir senha";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex w-full items-center justify-start gap-2 rounded-sm px-2 py-1.5 text-sm font-medium outline-none"
        >
          <KeyRound className="size-4" />
          {rotulo}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            {rotulo}
          </DialogTitle>
          <DialogDescription>
            {hasProvider
              ? "Sua conta entrou pelo GitHub. Uma senha também deixa você entrar sem depender do GitHub — útil se o GitHub cair ou se você trocar de aparelho."
              : "Defina uma senha para conseguir entrar por e-mail, e não só pelo GitHub."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="set-password" className="text-xs">
              Nova senha
            </Label>
            <Input
              id="set-password"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={`mínimo ${MIN_LEN} caracteres`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="set-password-confirm" className="text-xs">
              Repetir a senha
            </Label>
            <Input
              id="set-password-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {erro && <p className="text-destructive text-xs">{erro}</p>}

          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Salvar senha
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
