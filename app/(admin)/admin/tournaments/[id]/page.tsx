import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    ArrowLeft,
    Users,
    Target,
    FileSpreadsheet,
    QrCode,
    Play,
    Settings,
    BarChart3,
    Swords,
} from "lucide-react";
import { TournamentStatusControl } from "@/components/admin/TournamentStatusControl";
import { ShareLiveLink } from "@/components/admin/ShareLiveLink";
import type { TournamentStatus } from "@/types/database";

export const dynamic = "force-dynamic";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function TournamentDetailPage({ params }: PageProps) {
    const { id } = await params;
    const supabase = await createClient();

    const { data: tournament, error } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !tournament) {
        notFound();
    }

    // Fetch counts
    const [archersRes, targetsRes, assignmentsRes] = await Promise.all([
        supabase
            .from("archers")
            .select("*", { count: "exact", head: true }),
        supabase
            .from("targets")
            .select("*", { count: "exact", head: true })
            .eq("tournament_id", id),
        supabase
            .from("assignments")
            .select("*", { count: "exact", head: true })
            .eq("tournament_id", id),
    ]);

    const actionCards = [
        {
            title: "Gestionar Arqueros",
            description: "Importar arqueros al torneo",
            icon: Users,
            href: `/admin/tournaments/${id}/archers`,
            count: archersRes.count ?? 0,
            countLabel: "arqueros",
        },
        {
            title: "Configurar Pacas",
            description: "Definir cantidad de pacas por distancia",
            icon: Target,
            href: `/admin/tournaments/${id}/targets`,
            count: targetsRes.count ?? 0,
            countLabel: "pacas",
        },
        {
            title: "Asignar Arqueros",
            description: "Asignar arqueros a pacas y posiciones",
            icon: Users,
            href: `/admin/tournaments/${id}/assignments`,
            disabled: (targetsRes.count ?? 0) === 0,
        },
        {
            title: "Códigos de Acceso",
            description: "Ver códigos para que arqueros ingresen",
            icon: QrCode,
            href: `/admin/tournaments/${id}/access-codes`,
            disabled: (assignmentsRes.count ?? 0) === 0,
        },
        {
            title: "Control Room",
            description: "Vista en vivo del campo",
            icon: FileSpreadsheet,
            href: `/admin/tournaments/${id}/control`,
            highlight: tournament.status === "qualification",
        },
        {
            title: "Clasificación",
            description: "Ranking EN VIVO de clasificatorias",
            icon: BarChart3,
            href: `/admin/tournaments/${id}/classification`,
            highlight: tournament.status === "qualification",
        },
        {
            title: "Rankings",
            description: "Resultados finales del torneo",
            icon: BarChart3,
            href: `/admin/tournaments/${id}/rankings`,
        },
        {
            title: "Auditoría",
            description: "Editar y corregir puntajes",
            icon: FileSpreadsheet,
            href: `/admin/tournaments/${id}/audit`,
        },
        {
            title: "Eliminatorias",
            description: "Gestionar brackets y sets",
            icon: Swords,
            href: `/admin/tournaments/${id}/brackets`,
            disabled: tournament.status !== "elimination" && tournament.status !== "completed",
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/admin/tournaments">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </Button>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">{tournament.name}</h2>
                        <p className="text-muted-foreground">
                            {tournament.type === "indoor" ? "Indoor" : "Outdoor"} • {tournament.distances?.join("m, ") || ""}m •{" "}
                            {new Date(tournament.date).toLocaleDateString("es-ES", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <TournamentStatusControl
                        tournamentId={id}
                        currentStatus={tournament.status as TournamentStatus}
                    />
                    <ShareLiveLink tournamentId={id} />
                    <Button variant="outline" asChild>
                        <Link href={`/admin/tournaments/${id}/settings`}>
                            <Settings className="mr-2 h-4 w-4" />
                            Configuración
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Arqueros</CardDescription>
                        <CardTitle className="text-3xl">{archersRes.count ?? 0}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Pacas</CardDescription>
                        <CardTitle className="text-3xl">{targetsRes.count ?? 0}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Flechas Totales</CardDescription>
                        <CardTitle className="text-3xl">{tournament.qualification_arrows}</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Por Ronda</CardDescription>
                        <CardTitle className="text-3xl">{tournament.arrows_per_end}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Action Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {actionCards.map((card) => (
                    <Link
                        key={card.title}
                        href={card.disabled ? "#" : card.href}
                        className={card.disabled ? "pointer-events-none" : ""}
                    >
                        <Card
                            className={`h-full cursor-pointer transition-all hover:shadow-lg ${card.highlight ? "border-primary ring-1 ring-primary" : ""
                                } ${card.disabled ? "opacity-50" : ""}`}
                        >
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <card.icon className="h-8 w-8 text-primary" />
                                    {card.count !== undefined && (
                                        <Badge variant="secondary">
                                            {card.count} {card.countLabel}
                                        </Badge>
                                    )}
                                </div>
                                <CardTitle className="text-lg">{card.title}</CardTitle>
                                <CardDescription>{card.description}</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
