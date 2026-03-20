"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

export default function DashboardPage() {
  const { user, isLoading, isAdmin } = useAuth(true);

  useEffect(() => {
    console.log("[Dashboard] user:", !!user, "isLoading:", isLoading);
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando autenticação...</p>
          <p className="text-xs text-muted-foreground mt-2">user: {String(!!user)} | loading: {String(isLoading)}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Redirecionando...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Bem-vindo, {user?.full_name || user?.email}!
        </h1>
        <p className="text-muted-foreground">
          Playlist ao vivo - Acompanhe e solicite suas músicas favoritas.
        </p>
        <div className="mt-4 p-4 bg-green-100 rounded-lg">
          <p className="text-green-800">✅ Dashboard carregado!</p>
          <p className="text-sm text-green-600">Email: {user?.email}</p>
          <p className="text-sm text-green-600">Admin: {isAdmin ? "Sim" : "Não"}</p>
        </div>
      </div>
      
      <div className="p-8 border-2 border-dashed border-gray-300 rounded-lg text-center">
        <p className="text-gray-500">Playlist e funcionalidades em breve...</p>
      </div>
    </div>
  );
}
