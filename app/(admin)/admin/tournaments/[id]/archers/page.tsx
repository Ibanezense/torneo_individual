"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Users, Shield, Target, Filter, CheckCircle2 } from "lucide-react";
import { ArcherImporter } from "@/components/admin/ArcherImporter";
import { CATEGORY_LABELS, GENDER_LABELS } from "@/lib/constants/categories";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Archer } from "@/types/database";

interface Tournament {
    id: string;
    name: string;
    distances: number[];
}

export default function TournamentArchersPage() {
    const params = useParams();
    const id = params.id as string;
    const supabase = createClient();

    const [loading, setLoading] = useState(true);
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [archers, setArchers] = useState<Archer[]>([]);
    const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        loadData();
    }, [id]);

    const loadData = async () => {
        try {
            setLoading(true);

            const { data: tourData, error: tourError } = await supabase
                .from("tournaments")
                .select("*")
                .eq("id", id)
                .single();

            if (tourError) throw tourError;
            setTournament(tourData);

            const { data: archersData, error: archersError } = await supabase
                .from("archers")
                .select("*")
                .order("last_name", { ascending: true });

            if (archersError) throw archersError;
            setArchers(archersData || []);

            const { data: assignData, error: assignError } = await supabase
                .from("assignments")
                .select("archer_id")
                .eq("tournament_id", id);

            if (assignError) throw assignError;
            setAssignedIds(new Set(assignData?.map(a => a.archer_id) || []));

        } catch (err) {
            console.error(err);
            toast.error("Error cargando datos");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="flex h-96 items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
    }

    if (!tournament) return <div className="p-8 text-center text-slate-500">Torneo no encontrado</div>;

    const filteredArchers = archers.filter(a =>
        (a.first_name + " " + a.last_name).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.club || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    const stats = {
        total: archers.length,
        assigned: assignedIds.size,
        unassigned: archers.length - assignedIds.size
    };

    return (
        <div className="min-h-screen bg-white space-y-6 pb-20">
            {/* Header Section - LIGHT MODE for outdoor visibility */}
            <div className="bg-gradient-to-b from-slate-100 to-white border-b border-slate-200 -mx-6 -mt-6 px-8 py-8">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center gap-4 mb-6">
                        <Button variant="outline" size="icon" asChild className="border-slate-300 hover:bg-slate-100">
                            <Link href={`/admin/tournaments/${id}`}>
                                <ArrowLeft className="h-5 w-5 text-slate-700" />
                            </Link>
                        </Button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 uppercase">
                                    Gestión de Arqueros
                                </h1>
                                <Badge className="bg-blue-600 text-white border-0 text-sm">
                                    {tournament.name}
                                </Badge>
                            </div>
                            <p className="text-slate-600 mt-1 font-medium">
                                Importa y administra el padrón de atletas
                            </p>
                        </div>
                    </div>

                    {/* Quick Stats - Light cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                        <div className="bg-white border-2 border-blue-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                            <div className="bg-blue-100 p-3 rounded-lg">
                                <Users className="h-6 w-6 text-blue-700" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Total Arqueros</p>
                                <p className="text-2xl font-black text-slate-900">{stats.total}</p>
                            </div>
                        </div>
                        <div className="bg-white border-2 border-emerald-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                            <div className="bg-emerald-100 p-3 rounded-lg">
                                <Target className="h-6 w-6 text-emerald-700" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Asignados</p>
                                <p className="text-2xl font-black text-slate-900">{stats.assigned}</p>
                            </div>
                        </div>
                        <div className="bg-white border-2 border-amber-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                            <div className="bg-amber-100 p-3 rounded-lg">
                                <Shield className="h-6 w-6 text-amber-700" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Pendientes</p>
                                <p className="text-2xl font-black text-slate-900">{stats.unassigned}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 space-y-6">
                {/* Importer Section */}
                <div className="bg-white rounded-xl shadow-sm border-2 border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg">Importación Masiva</h3>
                            <p className="text-slate-500 text-sm">Carga arqueros desde Excel o CSV</p>
                        </div>
                        <Badge variant="outline" className="bg-white border-slate-300 text-slate-600">
                            Soporta .xlsx, .csv
                        </Badge>
                    </div>
                    <div className="p-6">
                        <ArcherImporter tournamentId={id} availableDistances={tournament.distances || []} onSuccess={loadData} />
                    </div>
                </div>

                {/* Archers List */}
                <Card className="border-2 border-slate-200 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50 border-b border-slate-200 flex flex-row items-center justify-between pb-4">
                        <div className="space-y-1">
                            <CardTitle className="text-xl font-bold text-slate-800">Padrón de Arqueros</CardTitle>
                            <CardDescription className="text-slate-500">
                                Listado completo de atletas registrados
                            </CardDescription>
                        </div>
                        <div className="relative w-64">
                            <input
                                type="text"
                                placeholder="Buscar nombre o club..."
                                className="w-full pl-9 pr-4 py-2.5 bg-white border-2 border-slate-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            <Filter className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {filteredArchers.length > 0 ? (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-slate-100">
                                        <TableRow>
                                            <TableHead className="font-bold text-slate-700 py-3">Nombre</TableHead>
                                            <TableHead className="font-bold text-slate-700">Club</TableHead>
                                            <TableHead className="font-bold text-slate-700">Categoría</TableHead>
                                            <TableHead className="font-bold text-slate-700">Género</TableHead>
                                            <TableHead className="font-bold text-slate-700 text-center">Distancia</TableHead>
                                            <TableHead className="font-bold text-slate-700 text-center">Estado</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredArchers.map((archer) => {
                                            const isAssigned = assignedIds.has(archer.id);
                                            return (
                                                <TableRow key={archer.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100">
                                                    <TableCell className="font-bold text-slate-900 py-4">
                                                        {archer.last_name}, {archer.first_name}
                                                    </TableCell>
                                                    <TableCell className="text-slate-700 font-medium">{archer.club || "-"}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="font-semibold text-xs uppercase bg-slate-100 border-slate-300 text-slate-700">
                                                            {CATEGORY_LABELS[archer.age_category as keyof typeof CATEGORY_LABELS]}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="font-semibold text-xs uppercase bg-slate-100 border-slate-300 text-slate-700">
                                                            {GENDER_LABELS[archer.gender as keyof typeof GENDER_LABELS]}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <span className="font-black text-slate-900 bg-blue-100 text-blue-800 px-3 py-1 rounded-lg text-sm border border-blue-200">
                                                            {archer.distance}m
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {isAssigned ? (
                                                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-2 border-emerald-300 font-bold">
                                                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Asignado
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-slate-500 bg-slate-100 border-slate-300 font-medium">
                                                                Sin Asignar
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="bg-slate-100 p-4 rounded-full mb-4">
                                    <Users className="h-8 w-8 text-slate-400" />
                                </div>
                                <h3 className="font-bold text-slate-900 text-lg">No se encontraron arqueros</h3>
                                <p className="text-slate-500 max-w-sm mt-2">
                                    No hay arqueros que coincidan con tu búsqueda o aún no has importado ninguno.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
