"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Crown, Medal, Award, Trophy, Swords, RefreshCw } from "lucide-react";
import { CATEGORY_LABELS, GENDER_LABELS } from "@/lib/constants/categories";
import type { AgeCategory, Gender } from "@/types/database";

interface TournamentResult {
    archerId: string;
    firstName: string;
    lastName: string;
    club: string | null;
    ageCategory: AgeCategory;
    gender: Gender;
    distance: number;
    position: number;
    eliminatedRound: string;
}

interface QualificationResult {
    archerId: string;
    firstName: string;
    lastName: string;
    club: string | null;
    ageCategory: AgeCategory;
    gender: Gender;
    distance: number;
    totalScore: number;
    xCount: number;
    tenPlusXCount: number;
    rank: number;
}

export default function LiveRankingsPage() {
    const params = useParams();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [tournamentResults, setTournamentResults] = useState<TournamentResult[]>([]);
    const [qualificationResults, setQualificationResults] = useState<QualificationResult[]>([]);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [activeTab, setActiveTab] = useState("tournament");

    const fetchData = useCallback(async () => {
        await Promise.all([fetchTournamentResults(), fetchQualificationResults()]);
        setLastUpdate(new Date());
        setIsLoading(false);
    }, [tournamentId]);

    const fetchTournamentResults = async () => {
        const { data: brackets } = await supabase
            .from("elimination_brackets")
            .select(`
                id, category, gender, bracket_size, is_completed,
                matches:elimination_matches(
                    id, round_number, match_position, status, winner_id,
                    archer1_id, archer2_id,
                    archer1:archers!elimination_matches_archer1_id_fkey(id, first_name, last_name, club, age_category, gender, distance),
                    archer2:archers!elimination_matches_archer2_id_fkey(id, first_name, last_name, club, age_category, gender, distance)
                )
            `)
            .eq("tournament_id", tournamentId);

        if (!brackets) {
            setTournamentResults([]);
            return;
        }

        const results: TournamentResult[] = [];

        for (const bracket of brackets) {
            const matches = (bracket.matches as any[]) || [];
            const totalRounds = Math.log2(bracket.bracket_size);
            const finalRound = totalRounds;

            const finalMatch = matches.find(m => m.round_number === finalRound && m.match_position === 1);
            const bronzeMatch = matches.find(m => m.round_number === 0);

            if (finalMatch && finalMatch.status === "completed" && finalMatch.winner_id) {
                const winner = finalMatch.archer1_id === finalMatch.winner_id ? finalMatch.archer1 : finalMatch.archer2;
                const loser = finalMatch.archer1_id === finalMatch.winner_id ? finalMatch.archer2 : finalMatch.archer1;

                if (winner) {
                    results.push({
                        archerId: winner.id,
                        firstName: winner.first_name,
                        lastName: winner.last_name,
                        club: winner.club,
                        ageCategory: bracket.category,
                        gender: bracket.gender,
                        distance: winner.distance,
                        position: 1,
                        eliminatedRound: "Oro 🥇",
                    });
                }
                if (loser) {
                    results.push({
                        archerId: loser.id,
                        firstName: loser.first_name,
                        lastName: loser.last_name,
                        club: loser.club,
                        ageCategory: bracket.category,
                        gender: bracket.gender,
                        distance: loser.distance,
                        position: 2,
                        eliminatedRound: "Plata 🥈",
                    });
                }
            }

            if (bronzeMatch && bronzeMatch.status === "completed" && bronzeMatch.winner_id) {
                const winner = bronzeMatch.archer1_id === bronzeMatch.winner_id ? bronzeMatch.archer1 : bronzeMatch.archer2;
                const loser = bronzeMatch.archer1_id === bronzeMatch.winner_id ? bronzeMatch.archer2 : bronzeMatch.archer1;

                if (winner) {
                    results.push({
                        archerId: winner.id,
                        firstName: winner.first_name,
                        lastName: winner.last_name,
                        club: winner.club,
                        ageCategory: bracket.category,
                        gender: bracket.gender,
                        distance: winner.distance,
                        position: 3,
                        eliminatedRound: "Bronce 🥉",
                    });
                }
                if (loser) {
                    results.push({
                        archerId: loser.id,
                        firstName: loser.first_name,
                        lastName: loser.last_name,
                        club: loser.club,
                        ageCategory: bracket.category,
                        gender: bracket.gender,
                        distance: loser.distance,
                        position: 4,
                        eliminatedRound: "4to Lugar",
                    });
                }
            }
        }

        results.sort((a, b) => {
            if (a.ageCategory !== b.ageCategory) return a.ageCategory.localeCompare(b.ageCategory);
            return a.position - b.position;
        });

        setTournamentResults(results);
    };

    const fetchQualificationResults = async () => {
        const { data: assignments } = await supabase
            .from("assignments")
            .select(`
                id,
                archer:archers(id, first_name, last_name, club, age_category, gender, distance)
            `)
            .eq("tournament_id", tournamentId);

        if (!assignments || assignments.length === 0) {
            setQualificationResults([]);
            return;
        }

        const assignmentIds = assignments.map(a => a.id);

        let allScores: any[] = [];
        const BATCH_SIZE = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            const { data: batch } = await supabase
                .from("qualification_scores")
                .select("assignment_id, score")
                .in("assignment_id", assignmentIds)
                .range(offset, offset + BATCH_SIZE - 1);

            if (batch && batch.length > 0) {
                allScores = allScores.concat(batch);
                offset += batch.length;
                hasMore = batch.length === BATCH_SIZE;
            } else {
                hasMore = false;
            }
        }

        const scoresByAssignment = new Map<string, { total: number; xCount: number; tenPlusX: number }>();
        for (const score of allScores) {
            if (score.score === null) continue;

            if (!scoresByAssignment.has(score.assignment_id)) {
                scoresByAssignment.set(score.assignment_id, { total: 0, xCount: 0, tenPlusX: 0 });
            }
            const stats = scoresByAssignment.get(score.assignment_id)!;
            stats.total += score.score === 11 ? 10 : score.score;
            if (score.score === 11) {
                stats.xCount++;
                stats.tenPlusX++;
            } else if (score.score === 10) {
                stats.tenPlusX++;
            }
        }

        const results: QualificationResult[] = assignments.map(assignment => {
            const archer = assignment.archer as any;
            const stats = scoresByAssignment.get(assignment.id) || { total: 0, xCount: 0, tenPlusX: 0 };

            return {
                archerId: archer.id,
                firstName: archer.first_name,
                lastName: archer.last_name,
                club: archer.club,
                ageCategory: archer.age_category,
                gender: archer.gender,
                distance: archer.distance,
                totalScore: stats.total,
                xCount: stats.xCount,
                tenPlusXCount: stats.tenPlusX,
                rank: 0,
            };
        });

        setQualificationResults(results);
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const getPositionIcon = (position: number) => {
        if (position === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
        if (position === 2) return <Medal className="h-5 w-5 text-slate-400" />;
        if (position === 3) return <Award className="h-5 w-5 text-amber-600" />;
        return <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-slate-500">{position}</span>;
    };

    const getRankIcon = (rank: number) => {
        if (rank === 1) return <Trophy className="h-4 w-4 text-yellow-500" />;
        if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
        if (rank === 3) return <Award className="h-4 w-4 text-amber-600" />;
        return <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-slate-500 bg-slate-100 rounded-full">{rank}</span>;
    };

    const getTournamentResultsByCategory = () => {
        const byCategory = new Map<AgeCategory, TournamentResult[]>();
        for (const result of tournamentResults) {
            if (!byCategory.has(result.ageCategory)) {
                byCategory.set(result.ageCategory, []);
            }
            byCategory.get(result.ageCategory)!.push(result);
        }
        for (const [, results] of byCategory.entries()) {
            results.sort((a, b) => a.position - b.position);
        }
        return byCategory;
    };

    const getQualificationResultsByCategory = () => {
        const byCategory = new Map<AgeCategory, QualificationResult[]>();
        for (const result of qualificationResults) {
            if (!byCategory.has(result.ageCategory)) {
                byCategory.set(result.ageCategory, []);
            }
            byCategory.get(result.ageCategory)!.push(result);
        }
        for (const [, results] of byCategory.entries()) {
            results.sort((a, b) => {
                if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
                if (b.tenPlusXCount !== a.tenPlusXCount) return b.tenPlusXCount - a.tenPlusXCount;
                return b.xCount - a.xCount;
            });
            results.forEach((r, i) => r.rank = i + 1);
        }
        return byCategory;
    };

    const groupedTournament = getTournamentResultsByCategory();
    const groupedQualification = getQualificationResultsByCategory();

    if (isLoading) {
        return (
            <div className="p-4 flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="p-4 space-y-4 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Rankings</h2>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <RefreshCw className="h-3 w-3" />
                    {lastUpdate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full grid grid-cols-2 h-10">
                    <TabsTrigger value="tournament" className="text-xs font-bold gap-1">
                        <Crown className="h-3.5 w-3.5" />
                        Medallero
                    </TabsTrigger>
                    <TabsTrigger value="qualification" className="text-xs font-bold gap-1">
                        <Swords className="h-3.5 w-3.5" />
                        Clasificación
                    </TabsTrigger>
                </TabsList>

                {/* Tournament Results */}
                <TabsContent value="tournament" className="mt-4 space-y-4">
                    {groupedTournament.size > 0 ? (
                        Array.from(groupedTournament.entries()).map(([category, results]) => (
                            <Card key={category} className="border-2 border-slate-200 overflow-hidden">
                                <CardHeader className="bg-gradient-to-r from-amber-50 to-yellow-50 border-b border-amber-200 py-2 px-3">
                                    <div className="flex items-center gap-2">
                                        <Crown className="h-4 w-4 text-yellow-600" />
                                        <Badge className="bg-amber-600 text-white text-xs">
                                            {CATEGORY_LABELS[category] || category}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y divide-slate-100">
                                        {results.map((result, index) => (
                                            <div
                                                key={`${result.archerId}-${index}`}
                                                className={`
                                                    flex items-center p-3
                                                    ${result.position === 1 ? 'bg-gradient-to-r from-yellow-50 to-amber-50' : ''}
                                                    ${result.position === 2 ? 'bg-gradient-to-r from-slate-50 to-slate-100' : ''}
                                                    ${result.position === 3 ? 'bg-gradient-to-r from-amber-50/50 to-orange-50/50' : ''}
                                                `}
                                            >
                                                <div className="flex-shrink-0 mr-3">
                                                    {getPositionIcon(result.position)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-slate-900 text-sm truncate">
                                                        {result.lastName}, {result.firstName}
                                                    </div>
                                                    <div className="text-xs text-slate-500 truncate">
                                                        {result.club || "Sin club"} • {result.distance}m
                                                    </div>
                                                </div>
                                                <Badge
                                                    variant="outline"
                                                    className={`
                                                        text-xs flex-shrink-0
                                                        ${result.position === 1 ? 'border-yellow-400 text-yellow-700 bg-yellow-50' : ''}
                                                        ${result.position === 2 ? 'border-slate-400 text-slate-600 bg-slate-50' : ''}
                                                        ${result.position === 3 ? 'border-amber-400 text-amber-700 bg-amber-50' : ''}
                                                        ${result.position > 3 ? 'border-slate-300 text-slate-500' : ''}
                                                    `}
                                                >
                                                    {result.eliminatedRound}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    ) : (
                        <Card className="border-2 border-slate-200">
                            <CardContent className="py-12 text-center">
                                <Crown className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                                <h3 className="font-bold text-slate-900 text-lg">Sin medallero</h3>
                                <p className="text-slate-500 mt-2 text-sm">
                                    Las eliminatorias aún no han finalizado
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* Qualification Results */}
                <TabsContent value="qualification" className="mt-4 space-y-4">
                    {groupedQualification.size > 0 ? (
                        Array.from(groupedQualification.entries()).map(([category, results]) => (
                            <Card key={category} className="border-2 border-slate-200 overflow-hidden">
                                <CardHeader className="bg-slate-50 border-b border-slate-200 py-2 px-3">
                                    <div className="flex items-center gap-2">
                                        <Badge className="bg-blue-600 text-white text-xs">
                                            {CATEGORY_LABELS[category] || category}
                                        </Badge>
                                        <span className="text-xs text-slate-500">
                                            {results.length} arquero{results.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y divide-slate-100">
                                        {results.map((result) => (
                                            <div
                                                key={result.archerId}
                                                className={`
                                                    flex items-center p-3
                                                    ${result.rank <= 3 ? 'bg-gradient-to-r from-amber-50/50 to-transparent' : ''}
                                                `}
                                            >
                                                <div className="flex-shrink-0 mr-3">
                                                    {getRankIcon(result.rank)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-slate-900 text-sm truncate">
                                                        {result.lastName}, {result.firstName}
                                                    </div>
                                                    <div className="text-xs text-slate-500 truncate">
                                                        {result.club || "Sin club"} • {result.distance}m
                                                    </div>
                                                </div>
                                                <div className="text-center bg-emerald-100 rounded-lg py-1 px-2 flex-shrink-0">
                                                    <div className="text-[10px] text-emerald-600 font-bold">Total</div>
                                                    <div className="text-base font-black text-emerald-700">{result.totalScore}</div>
                                                </div>
                                            </div>
                                        ))}
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
                </TabsContent>
            </Tabs>
        </div>
    );
}
