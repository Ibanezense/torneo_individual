"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Trophy, Medal, Award, ChevronDown, ChevronRight } from "lucide-react";
import { CATEGORY_LABELS, GENDER_LABELS } from "@/lib/constants/categories";
import type { AgeCategory, Gender } from "@/types/database";

interface EndScore {
    endNumber: number;
    arrows: (number | null)[];
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

export default function LiveClassificationPage() {
    const params = useParams();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [rankings, setRankings] = useState<RankedArcher[]>([]);
    const [expandedArchers, setExpandedArchers] = useState<Set<string>>(new Set());
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [arrowsPerEnd, setArrowsPerEnd] = useState(6);

    const fetchRankings = useCallback(async () => {
        const { data: tournament } = await supabase
            .from("tournaments")
            .select("id, arrows_per_end")
            .eq("id", tournamentId)
            .single();

        if (!tournament) return;
        setArrowsPerEnd(tournament.arrows_per_end);

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

        // Fetch ALL scores using pagination
        let allScores: any[] = [];
        const BATCH_SIZE = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            const { data: batch } = await supabase
                .from("qualification_scores")
                .select("assignment_id, end_number, arrow_number, score")
                .in("assignment_id", assignmentIds)
                .order("assignment_id")
                .order("end_number")
                .order("arrow_number")
                .range(offset, offset + BATCH_SIZE - 1);

            if (batch && batch.length > 0) {
                allScores = allScores.concat(batch);
                offset += batch.length;
                hasMore = batch.length === BATCH_SIZE;
            } else {
                hasMore = false;
            }
        }

        const scoresByAssignment = new Map<string, Map<number, (number | null)[]>>();
        for (const score of allScores || []) {
            if (!scoresByAssignment.has(score.assignment_id)) {
                scoresByAssignment.set(score.assignment_id, new Map());
            }
            const endMap = scoresByAssignment.get(score.assignment_id)!;
            if (!endMap.has(score.end_number)) {
                endMap.set(score.end_number, []);
            }
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
                const validArrows = arrows.filter((a: number | null | undefined): a is number => a !== null && a !== undefined);
                const endTotal = validArrows.reduce((sum: number, s: number) => sum + (s === 11 ? 10 : s), 0);
                endScores.push({ endNumber, arrows, total: endTotal });
                totalScore += endTotal;
                xCount += validArrows.filter((s: number) => s === 11).length;
                tenPlusXCount += validArrows.filter((s: number) => s === 10 || s === 11).length;
                arrowsShot += validArrows.length;
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

        setRankings(rankedArchers);
        setLastUpdate(new Date());
        setIsLoading(false);
    }, [tournamentId, supabase]);

    useEffect(() => {
        fetchRankings();

        // Auto-refresh every 60 seconds
        const interval = setInterval(fetchRankings, 60000);
        return () => clearInterval(interval);
    }, [fetchRankings]);

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

    const formatArrowScore = (score: number | null) => {
        if (score === null || score === undefined) return "";
        if (score === 11) return "X";
        if (score === 0) return "M";
        return score.toString();
    };

    const getArrowColor = (score: number | null) => {
        if (score === null || score === undefined) return "bg-slate-100 text-slate-300";
        if (score === 11 || score === 10) return "bg-yellow-100 text-yellow-800 border-yellow-300";
        if (score === 9) return "bg-yellow-50 text-yellow-700 border-yellow-200";
        if (score >= 7) return "bg-red-50 text-red-700 border-red-200";
        if (score >= 5) return "bg-blue-50 text-blue-700 border-blue-200";
        if (score >= 3) return "bg-slate-100 text-slate-700 border-slate-300";
        if (score >= 1) return "bg-slate-50 text-slate-600 border-slate-200";
        return "bg-white text-slate-400 border-slate-200";
    };

    const getRankingsByCategory = () => {
        const byCategory = new Map<AgeCategory, RankedArcher[]>();
        for (const archer of rankings) {
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

    const groupedRankings = getRankingsByCategory();

    if (isLoading) {
        return (
            <div className="p-4 flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="p-4 space-y-4 pb-20">
            {/* Last Update Badge */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Clasificación en Vivo</h2>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <RefreshCw className="h-3 w-3" />
                    {lastUpdate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                </div>
            </div>

            {groupedRankings.size > 0 ? (
                Array.from(groupedRankings.entries()).map(([category, archers]) => (
                    <Card key={category} className="border-2 border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50 border-b border-slate-200 py-2 px-3">
                            <div className="flex items-center gap-2">
                                <Badge className="bg-blue-600 text-white text-xs">
                                    {CATEGORY_LABELS[category] || category}
                                </Badge>
                                <span className="text-slate-500 text-xs">
                                    {archers.length} arquero{archers.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </div>
                        <CardContent className="p-0">
                            <div className="divide-y divide-slate-100">
                                {archers.map((archer) => {
                                    const isExpanded = expandedArchers.has(archer.archerId);
                                    return (
                                        <div key={archer.archerId}>
                                            <div
                                                className={`
                                                    flex items-center p-3 cursor-pointer active:bg-slate-50 transition-colors
                                                    ${archer.rank <= 3 ? 'bg-gradient-to-r from-amber-50/50 to-transparent' : ''}
                                                `}
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
                                                        {archer.club || "Sin club"} • {archer.distance}m
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    <div className="text-center bg-emerald-100 rounded-lg py-1 px-2">
                                                        <div className="text-[9px] text-emerald-600 font-bold">Total</div>
                                                        <div className="text-lg font-black text-emerald-700">{archer.totalScore}</div>
                                                    </div>
                                                    <div className="text-center bg-yellow-100 rounded py-0.5 px-1.5">
                                                        <div className="text-[8px] text-yellow-600 font-bold">10+X</div>
                                                        <div className="text-sm font-black text-yellow-700">{archer.tenPlusXCount}</div>
                                                    </div>
                                                    <div className="text-center bg-amber-100 rounded py-0.5 px-1.5">
                                                        <div className="text-[8px] text-amber-600 font-bold">X</div>
                                                        <div className="text-sm font-black text-amber-700">{archer.xCount}</div>
                                                    </div>
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                <div className="bg-slate-50 border-t border-slate-200 p-3">
                                                    <div className="flex gap-4 mb-3">
                                                        <div className="text-sm">
                                                            <span className="text-slate-500">10+X:</span>
                                                            <span className="font-bold text-yellow-700 ml-1">{archer.tenPlusXCount}</span>
                                                        </div>
                                                        <div className="text-sm">
                                                            <span className="text-slate-500">X:</span>
                                                            <span className="font-bold text-amber-700 ml-1">{archer.xCount}</span>
                                                        </div>
                                                        <div className="text-sm">
                                                            <span className="text-slate-500">Flechas:</span>
                                                            <span className="font-bold text-slate-700 ml-1">{archer.arrowsShot}</span>
                                                        </div>
                                                    </div>
                                                    <h4 className="font-bold text-slate-700 mb-2 text-xs uppercase tracking-wider">
                                                        Detalle por Ronda
                                                    </h4>
                                                    {archer.endScores.length > 0 ? (
                                                        <div className="space-y-1.5">
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
                                                                                className={`
                                                                                    w-6 h-6 flex items-center justify-center flex-shrink-0
                                                                                    rounded border text-xs font-bold
                                                                                    ${getArrowColor(arrow)}
                                                                                `}
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
                <Card className="border-2 border-slate-200">
                    <CardContent className="py-12 text-center">
                        <Trophy className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="font-bold text-slate-900 text-lg">Sin resultados</h3>
                        <p className="text-slate-500 mt-2 text-sm">
                            Aún no hay puntajes registrados
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
