"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Search, Edit3, Save, X, History, AlertTriangle, Check } from "lucide-react";
import { CATEGORY_LABELS, GENDER_LABELS } from "@/lib/constants/categories";
import { FullPageLoader } from "@/components/shared/LoadingSpinner";
import { toast } from "sonner";
import type { AgeCategory, Gender } from "@/types/database";

interface ScoreRecord {
    id: string;
    assignment_id: string;
    end_number: number;
    arrow_number: number;
    score: number | null;
    is_edited: boolean;
    original_score: number | null;
    edited_at: string | null;
}

interface ArcherWithScores {
    archerId: string;
    assignmentId: string;
    firstName: string;
    lastName: string;
    club: string | null;
    ageCategory: AgeCategory;
    gender: Gender;
    distance: number;
    scores: ScoreRecord[];
    totalScore: number;
    arrowsShot: number;
}

interface Tournament {
    id: string;
    name: string;
    qualification_arrows: number;
    arrows_per_end: number;
}

interface EditingScore {
    scoreId: string;
    assignmentId: string;
    endNumber: number;
    arrowNumber: number;
    currentValue: number | null;
    newValue: string;
}

export default function AuditPage() {
    const params = useParams();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [archers, setArchers] = useState<ArcherWithScores[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");

    // Editing state
    const [editingScore, setEditingScore] = useState<EditingScore | null>(null);
    const [showEditDialog, setShowEditDialog] = useState(false);

    // Categories available
    const [categories, setCategories] = useState<AgeCategory[]>([]);

    useEffect(() => {
        fetchData();
    }, [tournamentId]);

    const fetchData = async () => {
        setIsLoading(true);

        // Get tournament
        const { data: tournamentData } = await supabase
            .from("tournaments")
            .select("id, name, qualification_arrows, arrows_per_end")
            .eq("id", tournamentId)
            .single();

        if (!tournamentData) {
            setIsLoading(false);
            return;
        }
        setTournament(tournamentData);

        // Get all assignments with archers
        const { data: assignments } = await supabase
            .from("assignments")
            .select(`
                id,
                archer:archers(id, first_name, last_name, club, age_category, gender, distance)
            `)
            .eq("tournament_id", tournamentId);

        if (!assignments || assignments.length === 0) {
            setArchers([]);
            setIsLoading(false);
            return;
        }

        // Get all scores using pagination (Supabase has a hard 1000 row limit)
        const assignmentIds = assignments.map(a => a.id);
        let allScores: any[] = [];
        const BATCH_SIZE = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            const { data: batch, error } = await supabase
                .from("qualification_scores")
                .select("*")
                .in("assignment_id", assignmentIds)
                .order("assignment_id")
                .order("end_number")
                .order("arrow_number")
                .range(offset, offset + BATCH_SIZE - 1);

            if (error) {
                console.error("Error fetching scores:", error);
                break;
            }

            if (batch && batch.length > 0) {
                allScores = allScores.concat(batch);
                offset += batch.length;
                hasMore = batch.length === BATCH_SIZE;
            } else {
                hasMore = false;
            }
        }

        // Group scores by assignment
        const scoresByAssignment = new Map<string, ScoreRecord[]>();
        for (const score of allScores || []) {
            if (!scoresByAssignment.has(score.assignment_id)) {
                scoresByAssignment.set(score.assignment_id, []);
            }
            scoresByAssignment.get(score.assignment_id)!.push(score);
        }

        // Build archer data
        const archersData: ArcherWithScores[] = assignments.map(assignment => {
            const archer = assignment.archer as any;
            const scores = scoresByAssignment.get(assignment.id) || [];

            const totalScore = scores.reduce((sum, s) => {
                if (s.score === null) return sum;
                return sum + (s.score === 11 ? 10 : s.score);
            }, 0);

            return {
                archerId: archer.id,
                assignmentId: assignment.id,
                firstName: archer.first_name,
                lastName: archer.last_name,
                club: archer.club,
                ageCategory: archer.age_category,
                gender: archer.gender,
                distance: archer.distance,
                scores,
                totalScore,
                arrowsShot: scores.filter(s => s.score !== null).length,
            };
        });

        // Sort by name
        archersData.sort((a, b) => a.lastName.localeCompare(b.lastName));

        // Extract unique categories
        const uniqueCategories = [...new Set(archersData.map(a => a.ageCategory))];
        setCategories(uniqueCategories);
        setArchers(archersData);
        setIsLoading(false);
    };

    const filteredArchers = archers.filter(a => {
        const matchesSearch = searchTerm === "" ||
            `${a.firstName} ${a.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (a.club || "").toLowerCase().includes(searchTerm.toLowerCase());

        const matchesCategory = categoryFilter === "all" || a.ageCategory === categoryFilter;

        return matchesSearch && matchesCategory;
    });

    const openEditDialog = (score: ScoreRecord, archer: ArcherWithScores) => {
        setEditingScore({
            scoreId: score.id,
            assignmentId: score.assignment_id,
            endNumber: score.end_number,
            arrowNumber: score.arrow_number,
            currentValue: score.score,
            newValue: score.score === null ? "" : (score.score === 11 ? "X" : score.score.toString()),
        });
        setShowEditDialog(true);
    };

    const handleSaveEdit = async () => {
        if (!editingScore) return;

        // Parse new value
        let newScore: number | null = null;
        const val = editingScore.newValue.toUpperCase().trim();

        if (val === "X") {
            newScore = 11;
        } else if (val === "M" || val === "") {
            newScore = 0;
        } else {
            const num = parseInt(val);
            if (isNaN(num) || num < 0 || num > 10) {
                toast.error("Valor inválido", { description: "Usa 0-10, X, o M" });
                return;
            }
            newScore = num;
        }

        setIsSaving(true);

        try {
            const { error } = await supabase
                .from("qualification_scores")
                .update({
                    score: newScore,
                    is_edited: true,
                    original_score: editingScore.currentValue,
                    edited_at: new Date().toISOString(),
                })
                .eq("id", editingScore.scoreId);

            if (error) throw error;

            toast.success("Puntaje actualizado");
            setShowEditDialog(false);
            setEditingScore(null);

            // Refresh data
            await fetchData();
        } catch (error) {
            console.error(error);
            toast.error("Error al guardar");
        } finally {
            setIsSaving(false);
        }
    };

    const formatScore = (score: number | null) => {
        if (score === null) return "-";
        if (score === 11) return "X";
        if (score === 0) return "M";
        return score.toString();
    };

    const getScoreColor = (score: number | null) => {
        if (score === null) return "bg-slate-100 text-slate-400";
        if (score === 11 || score === 10) return "bg-yellow-100 text-yellow-800 border-yellow-300";
        if (score === 9) return "bg-yellow-50 text-yellow-700 border-yellow-200";
        if (score >= 7) return "bg-red-50 text-red-700 border-red-200";
        if (score >= 5) return "bg-blue-50 text-blue-700 border-blue-200";
        if (score >= 1) return "bg-slate-100 text-slate-700 border-slate-300";
        return "bg-white text-slate-400 border-slate-200";
    };

    // Group scores by end
    const groupScoresByEnd = (scores: ScoreRecord[], arrowsPerEnd: number) => {
        const ends = new Map<number, ScoreRecord[]>();
        for (const score of scores) {
            if (!ends.has(score.end_number)) {
                ends.set(score.end_number, []);
            }
            ends.get(score.end_number)!.push(score);
        }
        // Sort each end by arrow number
        for (const [, arrows] of ends) {
            arrows.sort((a, b) => a.arrow_number - b.arrow_number);
        }
        return ends;
    };

    if (isLoading) {
        return <FullPageLoader text="Cargando datos para auditoría..." />;
    }

    return (
        <div className="min-h-screen bg-white space-y-4 pb-20">
            {/* Header */}
            <div className="bg-gradient-to-b from-slate-100 to-white border-b border-slate-200 -mx-4 lg:-mx-6 -mt-4 lg:-mt-6 px-4 lg:px-8 py-4 lg:py-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center gap-2 lg:gap-4 mb-4">
                        <Button variant="outline" size="icon" asChild className="border-slate-300 hover:bg-slate-100 h-9 w-9 lg:h-10 lg:w-10 flex-shrink-0">
                            <Link href={`/admin/tournaments/${tournamentId}`}>
                                <ArrowLeft className="h-4 w-4 lg:h-5 lg:w-5 text-slate-700" />
                            </Link>
                        </Button>
                        <div className="min-w-0">
                            <h1 className="text-lg lg:text-2xl font-black tracking-tight text-slate-900 uppercase truncate">
                                Auditoría de Puntajes
                            </h1>
                            <p className="text-xs lg:text-sm text-slate-600 font-medium truncate">
                                {tournament?.name} • Editar y corregir flechas
                            </p>
                        </div>
                    </div>

                    {/* Warning Banner */}
                    <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-bold text-amber-800">Modo de Auditoría</p>
                            <p className="text-xs text-amber-700">
                                Los cambios se guardan inmediatamente y se registra el valor original para seguimiento.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto space-y-4">
                {/* Filters */}
                <Card className="border-2 border-slate-200 shadow-sm">
                    <CardContent className="p-3 lg:p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder="Buscar arquero..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 border-2 border-slate-300"
                                />
                            </div>
                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger className="border-2 border-slate-300">
                                    <SelectValue placeholder="Todas las categorías" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas las categorías</SelectItem>
                                    {categories.map(cat => (
                                        <SelectItem key={cat} value={cat}>
                                            {CATEGORY_LABELS[cat]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Archers List */}
                {filteredArchers.length > 0 ? (
                    <div className="space-y-4">
                        {filteredArchers.map((archer) => {
                            const endsByNumber = groupScoresByEnd(archer.scores, tournament?.arrows_per_end || 6);
                            const hasEdits = archer.scores.some(s => s.is_edited);

                            return (
                                <Card key={archer.archerId} className="border-2 border-slate-200 shadow-sm overflow-hidden">
                                    <CardHeader className="bg-slate-50 border-b border-slate-200 py-3 px-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <CardTitle className="text-base font-bold truncate">
                                                        {archer.lastName}, {archer.firstName}
                                                    </CardTitle>
                                                    {hasEdits && (
                                                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-xs flex-shrink-0">
                                                            <History className="h-3 w-3 mr-1" />
                                                            Editado
                                                        </Badge>
                                                    )}
                                                </div>
                                                <CardDescription className="text-xs truncate">
                                                    {archer.club || "Sin club"} • {CATEGORY_LABELS[archer.ageCategory]} • {GENDER_LABELS[archer.gender]} • {archer.distance}m
                                                </CardDescription>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <div className="text-xs text-slate-500">Total</div>
                                                <div className="text-xl font-black text-emerald-700">{archer.totalScore}</div>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-3 lg:p-4">
                                        {endsByNumber.size > 0 ? (
                                            <div className="space-y-2">
                                                {Array.from(endsByNumber.entries())
                                                    .sort(([a], [b]) => a - b)
                                                    .map(([endNumber, arrows]) => {
                                                        const endTotal = arrows.reduce((sum, a) => {
                                                            if (a.score === null) return sum;
                                                            return sum + (a.score === 11 ? 10 : a.score);
                                                        }, 0);

                                                        return (
                                                            <div
                                                                key={endNumber}
                                                                className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg"
                                                            >
                                                                <Badge variant="outline" className="font-bold text-xs flex-shrink-0 w-10 justify-center">
                                                                    R{endNumber}
                                                                </Badge>
                                                                <div className="flex-1 flex items-center gap-1 overflow-x-auto py-1">
                                                                    {arrows.map((arrow) => (
                                                                        <button
                                                                            key={arrow.id}
                                                                            onClick={() => openEditDialog(arrow, archer)}
                                                                            className={`
                                                                                relative w-8 h-8 flex items-center justify-center flex-shrink-0
                                                                                rounded border text-sm font-bold cursor-pointer
                                                                                hover:ring-2 hover:ring-blue-400 transition-all
                                                                                ${getScoreColor(arrow.score)}
                                                                                ${arrow.is_edited ? 'ring-2 ring-amber-400' : ''}
                                                                            `}
                                                                            title={arrow.is_edited ? `Original: ${formatScore(arrow.original_score)}` : "Clic para editar"}
                                                                        >
                                                                            {formatScore(arrow.score)}
                                                                            {arrow.is_edited && (
                                                                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full" />
                                                                            )}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                                <span className="font-bold text-slate-700 text-sm w-8 text-right flex-shrink-0">
                                                                    {endTotal}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        ) : (
                                            <p className="text-slate-500 text-sm italic text-center py-4">
                                                Sin flechas registradas
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    <Card className="border-2 border-slate-200 shadow-sm">
                        <CardContent className="py-12 text-center">
                            <div className="bg-slate-100 p-4 rounded-full mb-4 inline-block">
                                <Edit3 className="h-8 w-8 text-slate-400" />
                            </div>
                            <h3 className="font-bold text-slate-900 text-lg">Sin resultados</h3>
                            <p className="text-slate-500 max-w-sm mt-2 mx-auto text-sm">
                                No hay arqueros que coincidan con la búsqueda.
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Edit Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">Editar Puntaje</DialogTitle>
                        <DialogDescription>
                            Ronda {editingScore?.endNumber} • Flecha {editingScore?.arrowNumber}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="flex items-center gap-4">
                            <div className="flex-1">
                                <label className="text-sm font-bold text-slate-700 block mb-2">
                                    Valor actual
                                </label>
                                <div className={`
                                    w-16 h-16 flex items-center justify-center 
                                    rounded-lg border-2 text-2xl font-black
                                    ${getScoreColor(editingScore?.currentValue ?? null)}
                                `}>
                                    {formatScore(editingScore?.currentValue ?? null)}
                                </div>
                            </div>
                            <div className="text-2xl text-slate-300">→</div>
                            <div className="flex-1">
                                <label className="text-sm font-bold text-slate-700 block mb-2">
                                    Nuevo valor
                                </label>
                                <Input
                                    value={editingScore?.newValue || ""}
                                    onChange={(e) => setEditingScore(prev => prev ? { ...prev, newValue: e.target.value } : null)}
                                    className="text-center text-2xl font-bold h-16 border-2 border-blue-300 focus:border-blue-500"
                                    placeholder="0-10, X, M"
                                    maxLength={2}
                                />
                            </div>
                        </div>

                        {/* Quick buttons */}
                        <div className="grid grid-cols-6 gap-2">
                            {["X", "10", "9", "8", "7", "6"].map(val => (
                                <Button
                                    key={val}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditingScore(prev => prev ? { ...prev, newValue: val } : null)}
                                    className={`font-bold ${editingScore?.newValue === val ? 'bg-blue-100 border-blue-400' : ''}`}
                                >
                                    {val}
                                </Button>
                            ))}
                            {["5", "4", "3", "2", "1", "M"].map(val => (
                                <Button
                                    key={val}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditingScore(prev => prev ? { ...prev, newValue: val } : null)}
                                    className={`font-bold ${editingScore?.newValue === val ? 'bg-blue-100 border-blue-400' : ''}`}
                                >
                                    {val}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={isSaving}>
                            <X className="h-4 w-4 mr-1" />
                            Cancelar
                        </Button>
                        <Button onClick={handleSaveEdit} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
                            {isSaving ? (
                                <span className="animate-pulse">Guardando...</span>
                            ) : (
                                <>
                                    <Save className="h-4 w-4 mr-1" />
                                    Guardar Cambio
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
