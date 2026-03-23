"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthDebugPage() {
  const [results, setResults] = useState<{
    timestamp: string;
    cookies: Record<string, string>;
    localStorage: Record<string, string>;
    getSession: { hasSession: boolean; userId: string | null; error: string | null };
    getUser: { hasUser: boolean; userId: string | null; error: string | null };
    profile: unknown;
  } | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const runDebug = async () => {
      const supabase = createClient();

      const cookies: Record<string, string> = {};
      document.cookie.split(";").forEach((c) => {
        const [k, ...v] = c.trim().split("=");
        if (k.startsWith("sb-")) {
          cookies[k] = v.join("=");
        }
      });

      const localStorageKeys: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes("supabase") || key.includes("sb-"))) {
          localStorageKeys[key] = localStorage.getItem(key) || "";
        }
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const { data: userData, error: userError } = await supabase.auth.getUser();

      let profile: unknown = null;
      if (userData?.user) {
        const { data } = await supabase.from("profiles").select("*").eq("id", userData.user.id).single();
        profile = data;
      }

      setResults({
        timestamp: new Date().toISOString(),
        cookies,
        localStorage: localStorageKeys,
        getSession: {
          hasSession: !!sessionData?.session,
          userId: sessionData?.session?.user?.id || null,
          error: sessionError?.message || null,
        },
        getUser: {
          hasUser: !!userData?.user,
          userId: userData?.user?.id || null,
          error: userError?.message || null,
        },
        profile,
      });

      setLoading(false);
    };

    runDebug();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Diagnosticando autenticação...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Auth Debug</h1>
        <p className="text-muted-foreground mb-8">Diagnóstico de autenticação - {results?.timestamp}</p>

        <div className="space-y-6">
          <Section title="getSession() - Browser Client" status={results?.getSession.hasSession}>
            <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(results?.getSession, null, 2)}
            </pre>
          </Section>

          <Section title="getUser() - Browser Client" status={results?.getUser.hasUser}>
            <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(results?.getUser, null, 2)}
            </pre>
          </Section>

          <Section title="Cookies do Supabase (document.cookie)">
            {Object.keys(results?.cookies || {}).length > 0 ? (
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                {JSON.stringify(results?.cookies, null, 2)}
              </pre>
            ) : (
              <p className="text-red-500">Nenhum cookie sb-* encontrado!</p>
            )}
          </Section>

          <Section title="localStorage do Supabase">
            {Object.keys(results?.localStorage || {}).length > 0 ? (
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                {JSON.stringify(results?.localStorage, null, 2)}
              </pre>
            ) : (
              <p className="text-yellow-500">Nenhuma chave supabase/sb-* no localStorage</p>
            )}
          </Section>

          <Section title="Profile (se logado)">
            <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(results?.profile, null, 2)}
            </pre>
          </Section>
        </div>

        <div className="mt-8 p-4 bg-muted rounded-lg">
          <h2 className="font-semibold mb-2">Resumo:</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>getSession retornou: <strong>{results?.getSession.hasSession ? "✅ Sessão encontrada" : "❌ Sem sessão"}</strong></li>
            <li>getUser retornou: <strong>{results?.getUser.hasUser ? "✅ Usuário encontrado" : "❌ Sem usuário"}</strong></li>
            <li>Cookies sb-* encontrados: <strong>{Object.keys(results?.cookies || {}).length}</strong></li>
            <li>localStorage supabase: <strong>{Object.keys(results?.localStorage || {}).length} chaves</strong></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, status }: { title: string; children: React.ReactNode; status?: boolean }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-semibold">{title}</h2>
        {status !== undefined && (
          <span className={`text-xs px-2 py-1 rounded ${status ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {status ? "✅ OK" : "❌ FAIL"}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
