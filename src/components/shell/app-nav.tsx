"use client";

import { DoorOpen, Radio } from "lucide-react";

import { BottomNav } from "@/components/shell/bottom-nav";

const NAV_ITEMS = [
  { label: "Início", href: "/dashboard", icon: Radio },
  { label: "Entrar", href: "/entrar", icon: DoorOpen, matchExact: true },
];

export function AppNav() {
  return <BottomNav items={NAV_ITEMS} />;
}
