"use client";

import { useAuth } from "@/hooks/useAuth";

export default function DashboardPage() {
  const { user, isAdmin, isLoading } = useAuth(true);

  console.log("[Dashboard] Render - isLoading:", isLoading, "user:", !!user);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando autenticação...</p>
          <p className="text-xs text-muted-foreground mt-2">isLoading: {String(isLoading)}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Redirecionando para login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">
        Dashboard Carregado!
      </h1>
      <p className="text-muted-foreground">
        Bem-vindo, {user?.full_name || user?.email}!
      </p>
      <div className="mt-8 p-4 border rounded-lg">
        <p>✅ Autenticação funcionando!</p>
        <p>📧 Email: {user?.email}</p>
        <p>👤 Nome: {user?.full_name || "Não definido"}</p>
        <p>🔐 Role: {user?.role || "user"}</p>
        <p>⭐ Admin: {isAdmin ? "Sim" : "Não"}</p>
      </div>
    </div>
  );
}
