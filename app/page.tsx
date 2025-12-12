import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Target, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If logged in, redirect to dashboard
  if (user) {
    redirect("/admin/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-secondary">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
          <Target className="h-14 w-14 text-primary" />
        </div>

        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-6xl">
          Archery Manager
        </h1>

        <p className="mb-8 text-lg text-muted-foreground sm:text-xl">
          Sistema de gestión de torneos de tiro con arco.
          <br />
          Puntuación en tiempo real, brackets automáticos y resultados en vivo.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/login">
              Iniciar Sesión
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>

        <div className="mt-16 grid gap-8 text-left sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-6">
            <h3 className="mb-2 font-semibold">📱 Mobile First</h3>
            <p className="text-sm text-muted-foreground">
              Interfaz optimizada para que los arqueros puntúen desde sus teléfonos.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <h3 className="mb-2 font-semibold">⚡ Tiempo Real</h3>
            <p className="text-sm text-muted-foreground">
              Visualiza el progreso del torneo con actualizaciones instantáneas.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <h3 className="mb-2 font-semibold">🎯 World Archery</h3>
            <p className="text-sm text-muted-foreground">
              Reglas oficiales con sistema de sets y shoot-offs automáticos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
