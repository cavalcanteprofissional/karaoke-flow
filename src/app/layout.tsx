import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AuthSessionProvider } from "@/components/auth/auth-session-provider";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Karaokê Watch Party",
    template: "%s · Karaokê Watch Party",
  },
  description:
    "Karaokê ao vivo para bares e restaurantes: o público adiciona músicas na fila pelo celular e a playlist roda em tempo real na tela da casa.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col font-sans">
        <ThemeProvider>
          <TooltipProvider>
            <AuthSessionProvider>
              {children}
              <Toaster position="top-center" richColors />
            </AuthSessionProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
