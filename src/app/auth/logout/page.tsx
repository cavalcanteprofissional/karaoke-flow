"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const logout = async () => {
      console.log("=== LOGOUT PROCESS ===");

      const projectId = "kskoipyzqcacccepcqpc";
      const wrongProjectId = "itueopegwvlqyfznkuws";

      document.cookie.split(";").forEach((c) => {
        const cookieName = c.trim().split("=")[0];
        
        if (cookieName.includes("sb-")) {
          console.log("Deleting cookie:", cookieName);
          document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=localhost`;
          document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }
      });

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes("supabase") || key.includes("sb-"))) {
          console.log("Clearing localStorage:", key);
          localStorage.removeItem(key);
        }
      }

      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes("supabase") || key.includes("sb-"))) {
          console.log("Clearing sessionStorage:", key);
          sessionStorage.removeItem(key);
        }
      }

      console.log("All cookies and storage cleared");

      localStorage.clear();
      sessionStorage.clear();

      console.log("Redirecting to login");
      router.push("/login");
    };

    logout();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-muted-foreground">Saindo...</p>
      </div>
    </div>
  );
}
