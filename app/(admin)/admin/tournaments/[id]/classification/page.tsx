"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Trophy, Medal, Award, RefreshCw, Filter, Radio, ChevronDown, ChevronRight } from "lucide-react";
import { CATEGORY_LABELS, GENDER_LABELS } from "@/lib/constants/categories";
import { FullPageLoader } from "@/components/shared/LoadingSpinner";
import type { AgeCategory, Gender } from "@/types/database";

interface EndScore {
    endNumber: number;
    arrows: number[];
    total: number;
}

interface RankedArcher {
    archerId: string;
    assignmentId: string;
    firstName: string;
    lastName: string;
    club: string | null;
    ageCategory: AgeCategory;
    gender: Gender;
    distance: number;
    totalScore: number;
    xCount: number;
    tenPlusXCount: number;
    arrowsShot: number;
    rank: number;
    endScores: EndScore[];
}

interface Tournament {
    id: string;
    name: string;
    qualification_arrows: number;
    arrows_per_end: number;
    status: string;
}

export default function ClassificationPage() {
    const params = useParams();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [rankings, setRankings] = useState<RankedArcher[]>([]);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [expandedArchers, setExpandedArchers] = useState<Set<string>>(new Set());

    // Filters
    const [genderFilter, setGenderFilter] = useState<string>("all");
    const [distanceFilter, setDistanceFilter] = useState<string>("all");
    const [distances, setDistances] = useState<number[]>([]);

    useEffect(() => {
        fetchRankings();

        // Set up real-time subscription
        const channel = supabase
            .channel('classification-live')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'qualification_scores',
                },
                () => {
                    fetchRankings();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [tournamentId]);

    const fetchRankings = async () => {
        const { data: tournamentData } = await supabase
            .from("tournaments")
            .select("id, name, qualification_arrows, arrows_per_end, status")
            .eq("id", tournamentId)
            .single();

        if (!tournamentData) {
            setIsLoading(false);
            return;
        }
        setTournament(tournamentData);

        const { data: assignments } = await supabase
            .from("assignments")
            .select(`
                id,
                archer:archers(id, first_name, last_name, club, age_category, gender, distance)
            `)
            .eq("tournament_id", tournamentId);

        if (!assignments || assignments.length === 0) {
            setRankings([]);
            setIsLoading(false);
            return;
        }

        const assignmentIds = assignments.map(a => a.id);

        // Fetch ALL scores using pagination (Supabase has a hard 1000 row limit)
        let allScores: any[] = [];
        const BATCH_SIZE = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            const { data: batch, error } = await supabase
                .from("qualification_scores")
                .select("assignment_id, end_number, arrow_number, score")
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

        console.log(`[Classification Debug] Fetched ${allScores.length} scores for ${assignmentIds.length} assignments (paginated)`);

        // Group scores by assignment and end
        const scoresByAssignment = new Map<string, Map<number, (number | null)[]>>();
        for (const score of allScores || []) {
            if (!scoresByAssignment.has(score.assignment_id)) {
                scoresByAssignment.set(score.assignment_id, new Map());
            }
            const endMap = scoresByAssignment.get(score.assignment_id)!;
            if (!endMap.has(score.end_number)) {
                endMap.set(score.end_number, []);
            }
            // Use arrow_number as index to ensure correct positioning
            endMap.get(score.end_number)![score.arrow_number - 1] = score.score;
        }

        const rankedArchers: RankedArcher[] = assignments.map(assignment => {
            const archer = assignment.archer as any;
            const endMap = scoresByAssignment.get(assignment.id) || new Map();

            const endScores: EndScore[] = [];
            let totalScore = 0;
            let xCount = 0;
            let tenPlusXCount = 0;
            let arrowsShot = 0;

            for (const [endNumber, arrows] of endMap.entries()) {
                const endTotal = arrows.reduce((sum: number, s: number | null) => sum + (s === 11 ? 10 : (s ?? 0)), 0);
                endScores.push({ endNumber, arrows, total: endTotal });
                totalScore += endTotal;
                xCount += arrows.filter((s: number | null) => s === 11).length;
                tenPlusXCount += arrows.filter((s: number | null) => s === 10 || s === 11).length;
                arrowsShot += arrows.length;
            }

            endScores.sort((a, b) => a.endNumber - b.endNumber);

            return {
                archerId: archer.id,
                assignmentId: assignment.id,
                firstName: archer.first_name,
                lastName: archer.last_name,
                club: archer.club,
                ageCategory: archer.age_category,
                gender: archer.gender,
                distance: archer.distance,
                totalScore,
                xCount,
                tenPlusXCount,
                arrowsShot,
                rank: 0,
                endScores,
            };
        });

        const uniqueDistances = [...new Set(rankedArchers.map(a => a.distance))].sort((a, b) => a - b);
        setDistances(uniqueDistances);
        setRankings(rankedArchers);
        setLastUpdate(new Date());
        setIsLoading(false);
    };

    const toggleExpanded = (archerId: string) => {
        setExpandedArchers(prev => {
            const next = new Set(prev);
            if (next.has(archerId)) {
                next.delete(archerId);
            } else {
                next.add(archerId);
            }
            return next;
        });
    };

    const getRankIcon = (rank: number) => {
        if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
        if (rank === 2) return <Medal className="h-5 w-5 text-slate-400" />;
        if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
        return <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-slate-500 bg-slate-100 rounded-full">{rank}</span>;
    };

    const formatArrowScore = (score: number) => {
        if (score === 11) return "X";
        if (score === 0) return "M";
        return score.toString();
    };

    const getArrowColor = (score: number) => {
        if (score === 11 || score === 10) return "bg-yellow-100 text-yellow-800 border-yellow-300";
        if (score === 9) return "bg-yellow-50 text-yellow-700 border-yellow-200";
        if (score >= 7) return "bg-red-50 text-red-700 border-red-200";
        if (score >= 5) return "bg-blue-50 text-blue-700 border-blue-200";
        if (score >= 3) return "bg-slate-100 text-slate-700 border-slate-300";
        if (score >= 1) return "bg-slate-50 text-slate-600 border-slate-200";
        return "bg-white text-slate-400 border-slate-200";
    };

    const getFilteredAndGroupedRankings = () => {
        let filtered = [...rankings];

        if (genderFilter !== "all") {
            filtered = filtered.filter(a => a.gender === genderFilter);
        }
        if (distanceFilter !== "all") {
            filtered = filtered.filter(a => a.distance === parseInt(distanceFilter));
        }

        const byCategory = new Map<AgeCategory, RankedArcher[]>();
        for (const archer of filtered) {
            if (!byCategory.has(archer.ageCategory)) {
                byCategory.set(archer.ageCategory, []);
            }
            byCategory.get(archer.ageCategory)!.push(archer);
        }

        for (const [, archers] of byCategory.entries()) {
            archers.sort((a, b) => {
                if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
                if (b.tenPlusXCount !== a.tenPlusXCount) return b.tenPlusXCount - a.tenPlusXCount;
                return b.xCount - a.xCount;
            });
            archers.forEach((archer, index) => {
                archer.rank = index + 1;
            });
        }

        return byCategory;
    };

    const groupedRankings = getFilteredAndGroupedRankings();

    if (isLoading) {
        return <FullPageLoader text="Cargando clasificación..." />;
    }

    return (
        <div className="min-h-screen bg-white space-y-4 pb-20">
            {/* Header */}
            <div className="bg-gradient-to-b from-emerald-50 to-white border-b border-emerald-200 -mx-4 lg:-mx-6 -mt-4 lg:-mt-6 px-4 lg:px-8 py-4 lg:py-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between gap-2 mb-4">
                        <div className="flex items-center gap-2 lg:gap-4 min-w-0">
                            <Button variant="outline" size="icon" asChild className="border-slate-300 hover:bg-slate-100 flex-shrink-0 h-9 w-9">
                                <Link href={`/admin/tournaments/${tournamentId}`}>
                                    <ArrowLeft className="h-4 w-4 text-slate-700" />
                                </Link>
                            </Button>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h1 className="text-lg lg:text-2xl font-black tracking-tight text-slate-900 uppercase truncate">
                                        Clasificación EN VIVO
                                    </h1>
                                    <div className="flex items-center gap-1 bg-red-100 text-red-700 px-2 py-0.5 rounded-full animate-pulse">
                                        <Radio className="h-3 w-3" />
                                        <span className="text-xs font-bold">LIVE</span>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500">
                                    Última actualización: {lastUpdate.toLocaleTimeString()}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchRankings}
                            className="border-slate-300"
                        >
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-2 lg:gap-4 overflow-x-auto pb-2">
                        <div className="flex-shrink-0 bg-white border-2 border-slate-200 rounded-xl p-3 text-center shadow-sm min-w-[100px]">
                            <p className="text-[10px] text-slate-500 uppercase font-bold">Arqueros</p>
                            <p className="text-xl font-black text-slate-900">{rankings.length}</p>
                        </div>
                        <div className="flex-shrink-0 bg-white border-2 border-slate-200 rounded-xl p-3 text-center shadow-sm min-w-[100px]">
                            <p className="text-[10px] text-slate-500 uppercase font-bold">Flechas</p>
                            <p className="text-xl font-black text-slate-900">{tournament?.qualification_arrows || 0}</p>
                        </div>
                        <div className="flex-shrink-0 bg-white border-2 border-emerald-200 rounded-xl p-3 text-center shadow-sm min-w-[100px]">
                            <p className="text-[10px] text-slate-500 uppercase font-bold">Mejor</p>
                            <p className="text-xl font-black text-emerald-700">
                                {rankings.length > 0 ? Math.max(...rankings.map(r => r.totalScore)) : 0}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto space-y-4">
                {/* Filters */}
                <Card className="border-2 border-slate-200 shadow-sm">
                    <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-3">
                            <Filter className="h-4 w-4 text-slate-500" />
                            <span className="text-sm font-bold text-slate-700">Filtros</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Select value={genderFilter} onValueChange={setGenderFilter}>
                                <SelectTrigger className="border-2 border-slate-300 h-10 text-sm">
                                    <SelectValue placeholder="Género" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos</SelectItem>
                                    <SelectItem value="male">{GENDER_LABELS.male}</SelectItem>
                                    <SelectItem value="female">{GENDER_LABELS.female}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={distanceFilter} onValueChange={setDistanceFilter}>
                                <SelectTrigger className="border-2 border-slate-300 h-10 text-sm">
                                    <SelectValue placeholder="Distancia" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas</SelectItem>
                                    {distances.map(d => (
                                        <SelectItem key={d} value={d.toString()}>{d}m</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Rankings by Category */}
                {groupedRankings.size > 0 ? (
                    Array.from(groupedRankings.entries()).map(([category, archers]) => (
                        <Card key={category} className="border-2 border-slate-200 shadow-sm overflow-hidden">
                            <CardHeader className="bg-slate-50 border-b border-slate-200 py-3 px-4">
                                <div className="flex items-center gap-3">
                                    <Badge className="bg-blue-600 text-white text-xs px-2 py-1">
                                        {CATEGORY_LABELS[category]}
                                    </Badge>
                                    <span className="text-slate-500 text-sm font-medium">
                                        {archers.length} arquero{archers.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-slate-100">
                                    {archers.map((archer) => {
                                        const isExpanded = expandedArchers.has(archer.archerId);
                                        return (
                                            <div key={archer.archerId}>
                                                <div
                                                    className={`flex items-center p-3 cursor-pointer active:bg-slate-100 transition-colors ${archer.rank <= 3 ? 'bg-gradient-to-r from-amber-50/50 to-transparent' : ''} ${isExpanded ? 'bg-blue-50/50' : ''}`}
                                                    onClick={() => toggleExpanded(archer.archerId)}
                                                >
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        {isExpanded
                                                            ? <ChevronDown className="h-4 w-4 text-blue-600" />
                                                            : <ChevronRight className="h-4 w-4 text-slate-400" />
                                                        }
                                                        {getRankIcon(archer.rank)}
                                                    </div>
                                                    <div className="flex-1 min-w-0 ml-2">
                                                        <div className="font-bold text-slate-900 text-sm truncate">
                                                            {archer.lastName}, {archer.firstName}
                                                        </div>
                                                        <div className="text-xs text-slate-500 truncate">
                                                            {archer.club || "Sin club"} • {archer.distance}m • {archer.arrowsShot}/{tournament?.qualification_arrows} flechas
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <div className="text-center hidden sm:block">
                                                            <div className="text-[10px] text-slate-400 font-bold">10+X</div>
                                                            <div className="text-sm font-bold text-yellow-700">{archer.tenPlusXCount}</div>
                                                        </div>
                                                        <div className="text-center hidden sm:block">
                                                            <div className="text-[10px] text-slate-400 font-bold">X</div>
                                                            <div className="text-sm font-bold text-amber-700">{archer.xCount}</div>
                                                        </div>
                                                        <div className="text-center bg-emerald-100 rounded-lg py-1.5 px-2">
                                                            <div className="text-[10px] text-emerald-600 font-bold uppercase">Total</div>
                                                            <div className="text-lg font-black text-emerald-700">{archer.totalScore}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Expanded Detail */}
                                                {isExpanded && (
                                                    <div className="bg-slate-50 border-t border-slate-200 p-3">
                                                        {/* Mobile 10+X and X */}
                                                        <div className="flex gap-4 mb-3 sm:hidden">
                                                            <div className="text-sm">
                                                                <span className="text-slate-500">10+X:</span>
                                                                <span className="font-bold text-yellow-700 ml-1">{archer.tenPlusXCount}</span>
                                                            </div>
                                                            <div className="text-sm">
                                                                <span className="text-slate-500">X:</span>
                                                                <span className="font-bold text-amber-700 ml-1">{archer.xCount}</span>
                                                            </div>
                                                        </div>

                                                        <h4 className="font-bold text-slate-700 mb-2 text-xs uppercase tracking-wider">
                                                            Detalle por Ronda
                                                        </h4>
                                                        {archer.endScores.length > 0 ? (
                                                            <div className="space-y-2">
                                                                {archer.endScores.map((end) => (
                                                                    <div
                                                                        key={end.endNumber}
                                                                        className="flex items-center gap-2 bg-white rounded-lg p-2 border border-slate-200"
                                                                    >
                                                                        <Badge variant="outline" className="font-bold text-xs flex-shrink-0">
                                                                            R{end.endNumber}
                                                                        </Badge>
                                                                        <div className="flex-1 flex items-center gap-1 overflow-x-auto">
                                                                            {end.arrows.map((arrow, idx) => (
                                                                                <span
                                                                                    key={idx}
                                                                                    className={`w-7 h-7 flex items-center justify-center flex-shrink-0 rounded border text-xs font-bold ${getArrowColor(arrow)}`}
                                                                                >
                                                                                    {formatArrowScore(arrow)}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                        <span className="font-black text-slate-700 text-sm flex-shrink-0">
                                                                            {end.total}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p className="text-slate-500 text-sm italic">
                                                                Sin flechas registradas
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <Card className="border-2 border-slate-200 shadow-sm">
                        <CardContent className="py-12 text-center">
                            <div className="bg-slate-100 p-4 rounded-full mb-4 inline-block">
                                <Trophy className="h-8 w-8 text-slate-400" />
                            </div>
                            <h3 className="font-bold text-slate-900 text-lg">Sin resultados</h3>
                            <p className="text-slate-500 max-w-sm mt-2 mx-auto text-sm">
                                No hay arqueros o puntuaciones registradas.
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
