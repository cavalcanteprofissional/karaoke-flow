import { ScreenSkeleton } from "@/components/shared/loading-skeletons";

/**
 * Fallback do grupo `(app)`: aparece durante a navegação entre telas
 * autenticadas (o `Header`/nav continuam visíveis, pois este boundary fica
 * dentro do `<main>` do `AppShell`). Resolve o débito M8.
 */
export default function AppLoading() {
  return <ScreenSkeleton />;
}
