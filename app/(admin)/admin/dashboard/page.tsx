import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Trophy, Users, Target, ArrowRight, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
    const supabase = await createClient();

    // Fetch stats
    const [tournamentsRes, archersRes, targetsRes] = await Promise.all([
        supabase.from("tournaments").select("*", { count: "exact", head: true }),
        supabase.from("archers").select("*", { count: "exact", head: true }),
        supabase.from("targets").select("*", { count: "exact", head: true }),
    ]);

    // Fetch recent tournaments
    const { data: recentTournaments } = await supabase
        .from("tournaments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

    // Fetch active tournament (if any)
    const { data: activeTournament } = await supabase
        .from("tournaments")
        .select("*")
        .in("status", ["qualification", "elimination"])
        .single();

    const stats = [
        {
            title: "Torneos",
            value: tournamentsRes.count ?? 0,
            icon: Trophy,
            href: "/admin/tournaments",
            color: "text-yellow-500",
        },
        {
            title: "Arqueros",
            value: archersRes.count ?? 0,
            icon: Users,
            href: "/admin/archers",
            color: "text-blue-500",
        },
        {
            title: "Pacas Configuradas",
            value: targetsRes.count ?? 0,
            icon: Target,
            href: "/admin/control",
            color: "text-green-500",
        },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                <p className="text-muted-foreground">
                    Bienvenido al panel de administración de Archery Manager
                </p>
            </div>

            {/* Active Tournament Banner */}
            {activeTournament && (
                <Card className="border-primary bg-primary/5">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="h-3 w-3 animate-pulse rounded-full bg-green-500" />
                                <CardTitle className="text-lg">Torneo en Curso</CardTitle>
                            </div>
                            <Button asChild>
                                <Link href={`/admin/tournaments/${activeTournament.id}/control`}>
                                    Ir al Control Room
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xl font-semibold">{activeTournament.name}</p>
                        <p className="text-sm text-muted-foreground">
                            Estado: {activeTournament.status === "qualification" ? "Clasificación" : "Eliminatorias"}
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-3">
                {stats.map((stat) => (
                    <Card key={stat.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                            <stat.icon className={`h-5 w-5 ${stat.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold">{stat.value}</div>
                            <Link
                                href={stat.href}
                                className="text-xs text-muted-foreground hover:text-primary hover:underline"
                            >
                                Ver todos →
                            </Link>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Acciones Rápidas</CardTitle>
                        <CardDescription>Operaciones comunes</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        <Button asChild variant="outline" className="justify-start">
                            <Link href="/admin/tournaments/new">
                                <Trophy className="mr-2 h-4 w-4" />
                                Crear Nuevo Torneo
                            </Link>
                        </Button>
                        <Button asChild variant="outline" className="justify-start">
                            <Link href="/admin/archers/import">
                                <Users className="mr-2 h-4 w-4" />
                                Importar Arqueros
                            </Link>
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Torneos Recientes</CardTitle>
                        <CardDescription>Últimos torneos creados</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {recentTournaments && recentTournaments.length > 0 ? (
                            <div className="space-y-2">
                                {recentTournaments.map((tournament) => (
                                    <Link
                                        key={tournament.id}
                                        href={`/admin/tournaments/${tournament.id}`}
                                        className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent"
                                    >
                                        <div>
                                            <p className="font-medium">{tournament.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(tournament.date).toLocaleDateString("es-ES")}
                                            </p>
                                        </div>
                                        <span className="text-xs capitalize text-muted-foreground">
                                            {tournament.status}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No hay torneos creados aún.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
