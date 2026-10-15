"use client";

import { DoorOpen, Radio } from "lucide-react";

import { BottomNav } from "@/components/shell/bottom-nav";
import type { NavItem } from "@/components/shell/bottom-nav";

/** Itens de navegação do app — fonte única para a barra inferior (mobile) e a
 *  navegação do topo (tablet/desktop). */
export const NAV_ITEMS: NavItem[] = [
  { label: "Início", href: "/dashboard", icon: Radio },
  { label: "Entrar", href: "/entrar", icon: DoorOpen, matchExact: true },
];

export function AppNav() {
  return <BottomNav items={NAV_ITEMS} />;
}
