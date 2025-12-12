import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, MapPin, Target } from "lucide-react";
import type { Tournament } from "@/types/database";

export const dynamic = "force-dynamic";

const statusColors: Record<string, string> = {
    draft: "bg-gray-500",
    registration: "bg-blue-500",
    qualification: "bg-yellow-500",
    elimination: "bg-orange-500",
    completed: "bg-green-500",
};

const statusLabels: Record<string, string> = {
    draft: "Borrador",
    registration: "Inscripción",
    qualification: "Clasificación",
    elimination: "Eliminatorias",
    completed: "Finalizado",
};

export default async function TournamentsPage() {
    const supabase = await createClient();

    const { data: tournaments, error } = await supabase
        .from("tournaments")
        .select("*")
        .order("date", { ascending: false });

    if (error) {
        console.error("Error fetching tournaments:", error);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Torneos</h2>
                    <p className="text-muted-foreground">
                        Gestiona tus torneos de tiro con arco
                    </p>
                </div>
                <Button asChild>
                    <Link href="/admin/tournaments/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Nuevo Torneo
                    </Link>
                </Button>
            </div>

            {tournaments && tournaments.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {tournaments.map((tournament: Tournament) => (
                        <Link
                            key={tournament.id}
                            href={`/admin/tournaments/${tournament.id}`}
                        >
                            <Card className="h-full cursor-pointer transition-shadow hover:shadow-lg">
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between">
                                        <CardTitle className="text-lg">{tournament.name}</CardTitle>
                                        <Badge className={statusColors[tournament.status]}>
                                            {statusLabels[tournament.status]}
                                        </Badge>
                                    </div>
                                    <CardDescription className="flex items-center gap-1">
                                        <Target className="h-3 w-3" />
                                        {tournament.type === "indoor" ? "Indoor" : "Outdoor"} • {tournament.distances?.join("m, ") || ""}m
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2 text-sm text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4" />
                                            {new Date(tournament.date).toLocaleDateString("es-ES", {
                                                weekday: "long",
                                                year: "numeric",
                                                month: "long",
                                                day: "numeric",
                                            })}
                                        </div>
                                        {tournament.location && (
                                            <div className="flex items-center gap-2">
                                                <MapPin className="h-4 w-4" />
                                                {tournament.location}
                                            </div>
                                        )}
                                        <div className="mt-3 flex items-center gap-4 text-xs">
                                            <span>{tournament.qualification_arrows} flechas</span>
                                            <span>{tournament.arrows_per_end} por ronda</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            ) : (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Target className="h-12 w-12 text-muted-foreground/50" />
                        <h3 className="mt-4 text-lg font-semibold">No hay torneos</h3>
                        <p className="mb-4 text-sm text-muted-foreground">
                            Crea tu primer torneo para comenzar
                        </p>
                        <Button asChild>
                            <Link href="/admin/tournaments/new">
                                <Plus className="mr-2 h-4 w-4" />
                                Crear Torneo
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
