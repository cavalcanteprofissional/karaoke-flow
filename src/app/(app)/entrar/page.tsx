import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { EnterRoomByCode } from "@/components/bars/enter-room-by-code";
import { EntryPreview } from "@/components/bars/entry-preview";
import { EntryTokenForm } from "@/components/bars/entry-token-form";
import { LocationGate } from "@/components/bars/location-gate";
import { getEntryPreviewAction } from "@/lib/bars/actions";
import { createClient } from "@/lib/supabase/server";
import { normalizeRoomCode } from "@/lib/rooms/utils";

type EnterPageProps = {
  searchParams: Promise<Partial<Record<string, string | string[]>>>;
};

export default async function EnterPage({ searchParams }: EnterPageProps) {
  const params = await searchParams;
  const rawBar = firstParam(params.bar);
  const rawCode = firstParam(params.code);
  const rawMesa = firstParam(params.mesa);

  const code = rawBar ?? rawCode;
  const normalized = code ? normalizeRoomCode(code) : "";
  const mesa = rawMesa ? Number(rawMesa) : null;
  const isRoomEntry = !rawBar && !!rawCode;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (normalized) {
    const result = await getEntryPreviewAction(
      normalized,
      Number.isInteger(mesa) ? mesa : null
    );

    if ("error" in result) {
      return (
        <div className="flex flex-col gap-6">
          <SectionHeader title="Entrar na casa" href="/dashboard" linkLabel="Voltar" />
          <div className="text-destructive border-destructive/30 bg-destructive/10 flex items-center gap-2 rounded-lg border p-3 text-sm">
            {result.error}. Confira o código e tente de novo.
          </div>
          <EntryTokenForm />
        </div>
      );
    }

    const isAnonymous = user?.is_anonymous ?? user?.app_metadata?.is_anonymous === true;

    // Código de sala puro (`?code=`/digitado): entrada DIRETA na sala, sem
    // mesa — a mesa é escolhida depois, dentro da sala. A mutação (`join_room`)
    // acontece via Server Action no client (`EnterRoomByCode`), nunca no render.
    if (isRoomEntry) {
      if (user && result.preview.host_id === user.id && !isAnonymous) {
        redirect(`/salas/${result.preview.room_code}`);
      }

      const presence = result.presence;

      return (
        <div className="flex flex-col gap-6">
          <SectionHeader title="Entrar na casa" href="/dashboard" linkLabel="Voltar" />
          {result.preview.status === "closed" ? (
            <div className="text-destructive border-destructive/30 bg-destructive/10 flex items-center gap-2 rounded-lg border p-3 text-sm">
              A sala do bar está encerrada no momento.
            </div>
          ) : presence && !presence.ok ? (
            <LocationGate error={presence.error} />
          ) : (
            <EnterRoomByCode code={normalized} preview={result.preview} />
          )}
          <div className="border-border rounded-xl border border-dashed p-4">
            <p className="text-muted-foreground mb-2 text-sm">Outra casa?</p>
            <EntryTokenForm />
          </div>
        </div>
      );
    }

    if (user && result.preview.host_id === user.id && !isAnonymous) {
      redirect(`/salas/${result.preview.room_code}`);
    }

    return (
      <div className="flex flex-col gap-6">
        <SectionHeader title="Entrar na casa" href="/dashboard" linkLabel="Voltar" />
        {result.preview.status === "closed" ? (
          <div className="text-destructive border-destructive/30 bg-destructive/10 flex items-center gap-2 rounded-lg border p-3 text-sm">
            A sala do bar está encerrada no momento.
          </div>
        ) : (
          <EntryPreview
            preview={result.preview}
            requestedMesa={result.mesa ?? null}
            presence={result.presence}
          />
        )}
        <div className="border-border rounded-xl border border-dashed p-4">
          <p className="text-muted-foreground mb-2 text-sm">Outra casa?</p>
          <EntryTokenForm />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Entrar em uma casa" />
      <p className="text-muted-foreground text-sm">
        Digite o código do cartaz ou da mesa, ou escaneie o QR da casa.
      </p>
      <EntryTokenForm />
    </div>
  );
}

function SectionHeader({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {href && (
        <Link
          href={href}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" />
          {linkLabel}
        </Link>
      )}
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
    </div>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
