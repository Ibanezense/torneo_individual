"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Users, Shield, Target, Filter, CheckCircle2, Save } from "lucide-react";
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
import { ArcherCreateForm } from "@/components/admin/ArcherCreateForm";
import { ArcherImporter } from "@/components/admin/ArcherImporter";
import { ArcherEditDialog } from "@/components/admin/ArcherEditDialog";
import { ArcherDeleteButton } from "@/components/admin/ArcherDeleteButton";
import { CATEGORY_LABELS, DIVISION_LABELS, GENDER_LABELS } from "@/lib/constants/categories";
import type { AgeCategory, Archer, TournamentDivision } from "@/types/database";

interface Tournament {
    id: string;
    name: string;
    distances: number[];
    categories?: AgeCategory[] | null;
    divisions?: TournamentDivision[] | null;
}

interface ParticipantRow {
    archer_id: string;
}

function areSetsEqual(left: Set<string>, right: Set<string>) {
    if (left.size !== right.size) return false;
    for (const value of left) {
        if (!right.has(value)) return false;
    }
    return true;
}

export default function TournamentArchersPage() {
    const params = useParams();
    const id = params.id as string;
    const supabase = createClient();

    const [loading, setLoading] = useState(true);
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [archers, setArchers] = useState<Archer[]>([]);
    const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
    const [participantIds, setParticipantIds] = useState<Set<string>>(new Set());
    const [initialParticipantIds, setInitialParticipantIds] = useState<Set<string>>(new Set());
    const [isSavingParticipants, setIsSavingParticipants] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    const loadData = useCallback(async () => {
        try {
            setLoading(true);

            const { data: tournamentData, error: tournamentError } = await supabase
                .from("tournaments")
                .select("*")
                .eq("id", id)
                .single();

            if (tournamentError) throw tournamentError;
            setTournament(tournamentData);

            const { data: archersData, error: archersError } = await supabase
                .from("archers")
                .select("*")
                .order("last_name", { ascending: true });

            if (archersError) throw archersError;
            setArchers((archersData || []) as Archer[]);

            const { data: assignmentsData, error: assignmentsError } = await supabase
                .from("assignments")
                .select("archer_id")
                .eq("tournament_id", id);

            if (assignmentsError) throw assignmentsError;
            setAssignedIds(
                new Set((assignmentsData || []).map((assignment: { archer_id: string }) => assignment.archer_id))
            );

            const { data: participantsData, error: participantsError } = await supabase
                .from("tournament_participants")
                .select("archer_id")
                .eq("tournament_id", id);

            if (participantsError) throw participantsError;
            const nextParticipantIds = new Set(
                ((participantsData || []) as ParticipantRow[]).map((participant) => participant.archer_id)
            );
            setParticipantIds(nextParticipantIds);
            setInitialParticipantIds(nextParticipantIds);
        } catch (error) {
            console.error(error);
            toast.error("Error cargando datos");
        } finally {
            setLoading(false);
        }
    }, [id, supabase]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
        );
    }

    if (!tournament) {
        return <div className="p-8 text-center text-slate-500">Torneo no encontrado</div>;
    }

    const filteredArchers = archers.filter((archer) => {
        const fullName = `${archer.first_name} ${archer.last_name}`.toLowerCase();
        return (
            fullName.includes(searchTerm.toLowerCase()) ||
            (archer.club || "").toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    const toggleParticipant = (archerId: string) => {
        setParticipantIds((prev) => {
            const next = new Set(prev);
            if (next.has(archerId)) next.delete(archerId);
            else next.add(archerId);
            return next;
        });
    };

    const selectFiltered = () => {
        setParticipantIds((prev) => {
            const next = new Set(prev);
            for (const archer of filteredArchers) {
                next.add(archer.id);
            }
            return next;
        });
    };

    const clearFiltered = () => {
        setParticipantIds((prev) => {
            const next = new Set(prev);
            for (const archer of filteredArchers) {
                next.delete(archer.id);
            }
            return next;
        });
    };

    const handleSaveParticipants = async () => {
        setIsSavingParticipants(true);
        try {
            const selectedIds = Array.from(participantIds);
            const { error: deleteError } = await supabase
                .from("tournament_participants")
                .delete()
                .eq("tournament_id", id);

            if (deleteError) throw deleteError;

            if (selectedIds.length > 0) {
                const { error: insertError } = await supabase
                    .from("tournament_participants")
                    .insert(selectedIds.map((archerId) => ({ tournament_id: id, archer_id: archerId })));

                if (insertError) throw insertError;
            }

            setInitialParticipantIds(new Set(selectedIds));
            toast.success("Participantes actualizados");
        } catch (error) {
            console.error(error);
            toast.error("No se pudieron guardar los participantes");
        } finally {
            setIsSavingParticipants(false);
        }
    };

    const hasParticipantChanges = !areSetsEqual(participantIds, initialParticipantIds);

    const assignedParticipants = Array.from(participantIds).filter((archerId) => assignedIds.has(archerId)).length;
    const stats = {
        total: archers.length,
        participants: participantIds.size,
        assigned: assignedParticipants,
        unassigned: participantIds.size - assignedParticipants,
    };

    return (
        <div className="min-h-screen bg-white space-y-6 pb-20">
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
                                    Gestion de Arqueros
                                </h1>
                                <Badge className="bg-blue-600 text-white border-0 text-sm">
                                    {tournament.name}
                                </Badge>
                            </div>
                            <p className="text-slate-600 mt-1 font-medium">
                                Importa y administra el padron de atletas
                            </p>
                        </div>
                    </div>

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
                                <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Participantes</p>
                                <p className="text-2xl font-black text-slate-900">{stats.participants}</p>
                            </div>
                        </div>
                        <div className="bg-white border-2 border-amber-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                            <div className="bg-amber-100 p-3 rounded-lg">
                                <Shield className="h-6 w-6 text-amber-700" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Participantes sin paca</p>
                                <p className="text-2xl font-black text-slate-900">{stats.unassigned}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 space-y-6">
                <ArcherCreateForm
                    allowedDistances={tournament.distances || []}
                    allowedCategories={tournament.categories || undefined}
                    allowedDivisions={tournament.divisions || undefined}
                    onCreated={loadData}
                />

                <div className="bg-white rounded-xl shadow-sm border-2 border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg">Importacion Masiva</h3>
                            <p className="text-slate-500 text-sm">Carga arqueros desde CSV</p>
                        </div>
                        <Badge variant="outline" className="bg-white border-slate-300 text-slate-600">
                            Soporta .csv
                        </Badge>
                    </div>
                    <div className="p-6">
                        <ArcherImporter
                            tournamentId={id}
                            availableDistances={tournament.distances || []}
                            allowedCategories={tournament.categories || undefined}
                            allowedDivisions={tournament.divisions || undefined}
                            onSuccess={loadData}
                        />
                    </div>
                </div>

                <Card className="border-2 border-slate-200 shadow-sm overflow-hidden">
                    <CardHeader className="bg-slate-50 border-b border-slate-200 space-y-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="space-y-1">
                                <CardTitle className="text-xl font-bold text-slate-800">Padron de Arqueros</CardTitle>
                                <CardDescription className="text-slate-500">
                                    Marca participantes del torneo. Solo ellos apareceran en asignacion de pacas.
                                </CardDescription>
                            </div>
                            <div className="relative w-full md:w-72">
                                <input
                                    type="text"
                                    placeholder="Buscar nombre o club..."
                                    className="w-full pl-9 pr-4 py-2.5 bg-white border-2 border-slate-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                <Filter className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={selectFiltered}>
                                Seleccionar filtrados
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={clearFiltered}>
                                Limpiar filtrados
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleSaveParticipants}
                                disabled={isSavingParticipants || !hasParticipantChanges}
                            >
                                {isSavingParticipants ? (
                                    <span className="inline-flex items-center gap-2">
                                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-b-transparent" />
                                        Guardando...
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-2">
                                        <Save className="h-4 w-4" />
                                        Guardar participantes
                                    </span>
                                )}
                            </Button>
                            {hasParticipantChanges && (
                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                    Cambios sin guardar
                                </Badge>
                            )}
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
                                            <TableHead className="font-bold text-slate-700">Categoria</TableHead>
                                            <TableHead className="font-bold text-slate-700">Genero</TableHead>
                                            <TableHead className="font-bold text-slate-700">Division</TableHead>
                                            <TableHead className="font-bold text-slate-700 text-center">Distancia</TableHead>
                                            <TableHead className="font-bold text-slate-700 text-center">Participa</TableHead>
                                            <TableHead className="font-bold text-slate-700 text-center">Asignacion</TableHead>
                                            <TableHead className="font-bold text-slate-700 text-center">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredArchers.map((archer) => {
                                            const isParticipant = participantIds.has(archer.id);
                                            const isAssigned = assignedIds.has(archer.id);
                                            return (
                                                <TableRow
                                                    key={archer.id}
                                                    className="hover:bg-slate-50 transition-colors border-b border-slate-100"
                                                >
                                                    <TableCell className="font-bold text-slate-900 py-4">
                                                        {archer.last_name}, {archer.first_name}
                                                    </TableCell>
                                                    <TableCell className="text-slate-700 font-medium">{archer.club || "-"}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="font-semibold text-xs uppercase bg-slate-100 border-slate-300 text-slate-700">
                                                            {CATEGORY_LABELS[archer.age_category]}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="font-semibold text-xs uppercase bg-slate-100 border-slate-300 text-slate-700">
                                                            {GENDER_LABELS[archer.gender]}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="font-semibold text-xs uppercase bg-slate-100 border-slate-300 text-slate-700">
                                                            {DIVISION_LABELS[archer.division] || archer.division}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <span className="font-black text-slate-900 bg-blue-100 text-blue-800 px-3 py-1 rounded-lg text-sm border border-blue-200">
                                                            {archer.distance}m
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <input
                                                            type="checkbox"
                                                            className="h-4 w-4 cursor-pointer accent-blue-600"
                                                            checked={isParticipant}
                                                            onChange={() => toggleParticipant(archer.id)}
                                                            disabled={isSavingParticipants}
                                                            aria-label={`Marcar participante ${archer.first_name} ${archer.last_name}`}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        {isAssigned && isParticipant ? (
                                                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-2 border-emerald-300 font-bold">
                                                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Asignado
                                                            </Badge>
                                                        ) : isAssigned ? (
                                                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 border-2 border-amber-300 font-bold">
                                                                Fuera de lista
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-slate-500 bg-slate-100 border-slate-300 font-medium">
                                                                Sin Asignar
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <ArcherEditDialog
                                                                archer={archer}
                                                                allowedDistances={tournament.distances || []}
                                                                allowedCategories={tournament.categories || undefined}
                                                                allowedDivisions={tournament.divisions || undefined}
                                                                onSaved={loadData}
                                                            />
                                                            <ArcherDeleteButton
                                                                archerId={archer.id}
                                                                archerName={`${archer.first_name} ${archer.last_name}`}
                                                                onDeleted={loadData}
                                                            />
                                                        </div>
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
                                    No hay arqueros que coincidan con tu busqueda o aun no has importado ninguno.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
