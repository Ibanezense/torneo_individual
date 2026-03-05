"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Trophy, Medal, Award, RefreshCw, Filter, ChevronDown, ChevronRight, Crown, Swords } from "lucide-react";
import { CATEGORY_LABELS, GENDER_LABELS } from "@/lib/constants/categories";
import { FullPageLoader } from "@/components/shared/LoadingSpinner";
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

interface TournamentResult {
    archerId: string;
    firstName: string;
    lastName: string;
    club: string | null;
    ageCategory: AgeCategory;
    gender: Gender;
    distance: number;
    position: number; // 1 = Gold, 2 = Silver, 3 = Bronze, 4 = 4th, etc.
    eliminatedRound: string; // "Final", "Bronce", "Semifinal", etc.
}

interface Tournament {
    id: string;
    name: string;
    qualification_arrows: number;
    arrows_per_end: number;
}

interface QualificationScoreRow {
    assignment_id: string;
    end_number: number;
    arrow_number: number;
    score: number | null;
}

interface AssignmentRow {
    id: string;
    archer: {
        id: string;
        first_name: string;
        last_name: string;
        club: string | null;
        age_category: AgeCategory;
        gender: Gender;
        distance: number;
    } | {
        id: string;
        first_name: string;
        last_name: string;
        club: string | null;
        age_category: AgeCategory;
        gender: Gender;
        distance: number;
    }[] | null;
}

interface MatchArcher {
    id: string;
    first_name: string;
    last_name: string;
    club: string | null;
    age_category: AgeCategory;
    gender: Gender;
    distance: number;
}

interface BracketMatchRow {
    id: string;
    round_number: number;
    match_position: number;
    status: string;
    winner_id: string | null;
    archer1_id: string | null;
    archer2_id: string | null;
    archer1: MatchArcher | null;
    archer2: MatchArcher | null;
}

interface BracketRow {
    id: string;
    category: AgeCategory;
    gender: Gender;
    bracket_size: number;
    is_completed: boolean;
    matches: BracketMatchRow[] | null;
}

export default function RankingsPage() {
    const params = useParams();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [rankings, setRankings] = useState<RankedArcher[]>([]);
    const [tournamentResults, setTournamentResults] = useState<TournamentResult[]>([]);
    const [expandedArchers, setExpandedArchers] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState("tournament");

    // Filters
    const [genderFilter, setGenderFilter] = useState<string>("all");
    const [distanceFilter, setDistanceFilter] = useState<string>("all");

    // Available filter options
    const [distances, setDistances] = useState<number[]>([]);

    const fetchQualificationRankings = useCallback(async () => {
        const { data: tournamentData } = await supabase
            .from("tournaments")
            .select("id, name, qualification_arrows, arrows_per_end")
            .eq("id", tournamentId)
            .single();

        if (!tournamentData) return;
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
            return;
        }

        const assignmentRows = assignments as AssignmentRow[];
        const assignmentIds = assignmentRows.map((assignment) => assignment.id);

        let allScores: QualificationScoreRow[] = [];
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
                allScores = allScores.concat(batch as QualificationScoreRow[]);
                offset += batch.length;
                hasMore = batch.length === BATCH_SIZE;
            } else {
                hasMore = false;
            }
        }

        const scoresByAssignment = new Map<string, Map<number, (number | null)[]>>();
        for (const score of allScores) {
            if (!scoresByAssignment.has(score.assignment_id)) {
                scoresByAssignment.set(score.assignment_id, new Map());
            }
            const endMap = scoresByAssignment.get(score.assignment_id)!;
            if (!endMap.has(score.end_number)) {
                endMap.set(score.end_number, []);
            }
            endMap.get(score.end_number)![score.arrow_number - 1] = score.score;
        }

        const rankedArchers: RankedArcher[] = assignmentRows.flatMap((assignment) => {
            const archer = Array.isArray(assignment.archer)
                ? assignment.archer[0]
                : assignment.archer;
            if (!archer) return [];

            const endMap: Map<number, (number | null)[]> =
                scoresByAssignment.get(assignment.id) || new Map<number, (number | null)[]>();

            const endScores: EndScore[] = [];
            let totalScore = 0;
            let xCount = 0;
            let tenPlusXCount = 0;
            let arrowsShot = 0;

            for (const [endNumber, arrows] of endMap.entries()) {
                const endTotal = arrows.reduce(
                    (sum: number, score: number | null) => sum + (score === 11 ? 10 : (score ?? 0)),
                    0
                );
                endScores.push({ endNumber, arrows, total: endTotal });
                totalScore += endTotal;
                xCount += arrows.filter((score: number | null) => score === 11).length;
                tenPlusXCount += arrows.filter((score: number | null) => score === 10 || score === 11).length;
                arrowsShot += arrows.length;
            }

            endScores.sort((left, right) => left.endNumber - right.endNumber);

            return [{
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
            }];
        });

        const uniqueDistances = [...new Set(rankedArchers.map((archer) => archer.distance))].sort((a, b) => a - b);
        setDistances(uniqueDistances);
        setRankings(rankedArchers);
    }, [supabase, tournamentId]);

    const fetchTournamentResults = useCallback(async () => {
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

        for (const bracket of brackets as BracketRow[]) {
            const matches = bracket.matches || [];
            const totalRounds = Math.log2(bracket.bracket_size);
            const finalRound = totalRounds;
            const semifinalRound = totalRounds - 1;
            const finalMatch = matches.find((match) => match.round_number === finalRound && match.match_position === 1);
            const bronzeMatch = matches.find((match) => match.round_number === 0);

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
                        gender: winner.gender,
                        distance: winner.distance,
                        position: 1,
                        eliminatedRound: "Final (Oro)",
                    });
                }
                if (loser) {
                    results.push({
                        archerId: loser.id,
                        firstName: loser.first_name,
                        lastName: loser.last_name,
                        club: loser.club,
                        ageCategory: bracket.category,
                        gender: loser.gender,
                        distance: loser.distance,
                        position: 2,
                        eliminatedRound: "Final (Plata)",
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
                        gender: winner.gender,
                        distance: winner.distance,
                        position: 3,
                        eliminatedRound: "Bronce",
                    });
                }
                if (loser) {
                    results.push({
                        archerId: loser.id,
                        firstName: loser.first_name,
                        lastName: loser.last_name,
                        club: loser.club,
                        ageCategory: bracket.category,
                        gender: loser.gender,
                        distance: loser.distance,
                        position: 4,
                        eliminatedRound: "4to Lugar",
                    });
                }
            }

            if ((!bronzeMatch || bronzeMatch.status !== "completed" || !bronzeMatch.winner_id) && semifinalRound >= 1) {
                const semifinalLosers = matches
                    .filter((match) => match.round_number === semifinalRound && match.status === "completed" && Boolean(match.winner_id))
                    .map((match) => (match.archer1_id === match.winner_id ? match.archer2 : match.archer1))
                    .filter((archer): archer is MatchArcher => Boolean(archer));

                const uniqueSemifinalLosers = Array.from(
                    new Map(semifinalLosers.map((archer) => [archer.id, archer])).values()
                );

                if (uniqueSemifinalLosers.length === 1) {
                    const bronzeByBye = uniqueSemifinalLosers[0];
                    if (!results.some((result) => result.archerId === bronzeByBye.id && result.ageCategory === bracket.category)) {
                        results.push({
                            archerId: bronzeByBye.id,
                            firstName: bronzeByBye.first_name,
                            lastName: bronzeByBye.last_name,
                            club: bronzeByBye.club,
                            ageCategory: bracket.category,
                            gender: bronzeByBye.gender,
                            distance: bronzeByBye.distance,
                            position: 3,
                            eliminatedRound: "Bronce (bye semifinal)",
                        });
                    }
                }
            }

            const completedMatches = matches.filter((match) =>
                match.status === "completed" &&
                match.winner_id &&
                match.round_number !== finalRound &&
                match.round_number !== 0
            );

            for (const match of completedMatches) {
                if (match.round_number === semifinalRound) continue;

                const loser = match.archer1_id === match.winner_id ? match.archer2 : match.archer1;
                if (!loser) continue;

                if (results.some((result) => result.archerId === loser.id && result.ageCategory === bracket.category)) {
                    continue;
                }

                const roundsFromFinal = finalRound - match.round_number;
                let roundName = "";
                let basePosition = 5;

                if (roundsFromFinal === 2) {
                    roundName = "Cuartos";
                    basePosition = 5;
                } else if (roundsFromFinal === 3) {
                    roundName = "1/8";
                    basePosition = 9;
                } else if (roundsFromFinal === 4) {
                    roundName = "1/16";
                    basePosition = 17;
                } else {
                    roundName = `Ronda ${match.round_number}`;
                    basePosition = Math.pow(2, roundsFromFinal) + 1;
                }

                results.push({
                    archerId: loser.id,
                    firstName: loser.first_name,
                    lastName: loser.last_name,
                    club: loser.club,
                    ageCategory: bracket.category,
                    gender: loser.gender,
                    distance: loser.distance,
                    position: basePosition,
                    eliminatedRound: roundName,
                });
            }
        }

        results.sort((left, right) => {
            if (left.ageCategory !== right.ageCategory) return left.ageCategory.localeCompare(right.ageCategory);
            return left.position - right.position;
        });

        setTournamentResults(results);
    }, [supabase, tournamentId]);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        await Promise.all([fetchQualificationRankings(), fetchTournamentResults()]);
        setIsLoading(false);
    }, [fetchQualificationRankings, fetchTournamentResults]);

    useEffect(() => {
        const timer = setTimeout(() => {
            void fetchData();
        }, 0);

        return () => clearTimeout(timer);
    }, [fetchData]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await fetchData();
        setIsRefreshing(false);
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

    const getPositionIcon = (position: number) => {
        if (position === 1) return <Crown className="h-6 w-6 text-yellow-500" />;
        if (position === 2) return <Medal className="h-6 w-6 text-slate-400" />;
        if (position === 3) return <Award className="h-6 w-6 text-amber-600" />;
        return <span className="w-7 h-7 flex items-center justify-center text-sm font-bold text-slate-500 bg-slate-100 rounded-full">{position}</span>;
    };

    const getRankIcon = (rank: number) => {
        if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
        if (rank === 2) return <Medal className="h-5 w-5 text-slate-400" />;
        if (rank === 3) return <Award className="h-5 w-5 text-amber-600" />;
        return <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-slate-500 bg-slate-100 rounded-full">{rank}</span>;
    };

    const formatArrowScore = (score: number | null) => {
        if (score === null) return "";
        if (score === 11) return "X";
        if (score === 0) return "M";
        return score.toString();
    };

    const getArrowColor = (score: number | null) => {
        if (score === null) return "bg-white text-slate-300 border-slate-200";
        if (score === 11 || score === 10) return "bg-yellow-100 text-yellow-800 border-yellow-300";
        if (score === 9) return "bg-yellow-50 text-yellow-700 border-yellow-200";
        if (score >= 7) return "bg-red-50 text-red-700 border-red-200";
        if (score >= 5) return "bg-blue-50 text-blue-700 border-blue-200";
        if (score >= 3) return "bg-slate-100 text-slate-700 border-slate-300";
        if (score >= 1) return "bg-slate-50 text-slate-600 border-slate-200";
        return "bg-white text-slate-400 border-slate-200";
    };

    const getQualificationRankingsByCategory = () => {
        let filtered = [...rankings];

        if (genderFilter !== "all") {
            filtered = filtered.filter(a => a.gender === genderFilter);
        }
        if (distanceFilter !== "all") {
            filtered = filtered.filter(a => a.distance === parseInt(distanceFilter));
        }

        const byCategory = new Map<string, RankedArcher[]>();
        for (const archer of filtered) {
            const key = `${archer.ageCategory}|${archer.distance}`;
            if (!byCategory.has(key)) {
                byCategory.set(key, []);
            }
            byCategory.get(key)!.push(archer);
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

    const getTournamentResultsByCategory = () => {
        let filtered = [...tournamentResults];

        if (genderFilter !== "all") {
            filtered = filtered.filter(a => a.gender === genderFilter);
        }
        if (distanceFilter !== "all") {
            filtered = filtered.filter(a => a.distance === parseInt(distanceFilter));
        }

        const byCategory = new Map<string, TournamentResult[]>();
        for (const result of filtered) {
            const key = `${result.ageCategory}|${result.distance}`;
            if (!byCategory.has(key)) {
                byCategory.set(key, []);
            }
            byCategory.get(key)!.push(result);
        }

        // Sort each category by position
        for (const [, results] of byCategory.entries()) {
            results.sort((a, b) => a.position - b.position);
        }

        return byCategory;
    };

    const groupedQualification = getQualificationRankingsByCategory();
    const groupedTournament = getTournamentResultsByCategory();

    if (isLoading) {
        return <FullPageLoader text="Cargando clasificación..." />;
    }

    return (
        <div className="min-h-screen bg-white space-y-4 pb-20">
            {/* Header */}
            <div className="bg-gradient-to-b from-slate-100 to-white border-b border-slate-200 -mx-4 lg:-mx-6 -mt-4 lg:-mt-6 px-4 lg:px-8 py-4 lg:py-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between gap-2 mb-4">
                        <div className="flex items-center gap-2 lg:gap-4 min-w-0">
                            <Button variant="outline" size="icon" asChild className="border-slate-300 hover:bg-slate-100 flex-shrink-0 h-9 w-9 lg:h-10 lg:w-10">
                                <Link href={`/admin/tournaments/${tournamentId}`}>
                                    <ArrowLeft className="h-4 w-4 lg:h-5 lg:w-5 text-slate-700" />
                                </Link>
                            </Button>
                            <div className="min-w-0">
                                <h1 className="text-lg lg:text-2xl font-black tracking-tight text-slate-900 uppercase truncate">
                                    Rankings
                                </h1>
                                <p className="text-xs lg:text-sm text-slate-600 font-medium truncate hidden sm:block">
                                    {tournament?.name}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            className="border-slate-300 flex-shrink-0"
                        >
                            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline ml-2">Actualizar</span>
                        </Button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto space-y-4">
                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="w-full grid grid-cols-2 h-12">
                        <TabsTrigger value="tournament" className="text-sm font-bold gap-2">
                            <Crown className="h-4 w-4" />
                            Ranking Torneo
                        </TabsTrigger>
                        <TabsTrigger value="qualification" className="text-sm font-bold gap-2">
                            <Swords className="h-4 w-4" />
                            Clasificatorias
                        </TabsTrigger>
                    </TabsList>

                    {/* Filters */}
                    <Card className="border-2 border-slate-200 shadow-sm mt-4">
                        <CardContent className="p-3 lg:p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Filter className="h-4 w-4 text-slate-500" />
                                <span className="text-sm font-bold text-slate-700">Filtros</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 lg:gap-4">
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
                                        <SelectItem value="all">Todas las distancias</SelectItem>
                                        {distances.map(d => (
                                            <SelectItem key={d} value={d.toString()}>{d}m</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tournament Results Tab */}
                    <TabsContent value="tournament" className="mt-4 space-y-4">
                        {groupedTournament.size > 0 ? (
                            Array.from(groupedTournament.entries()).map(([groupKey, results]) => {
                                const [category, distance] = groupKey.split("|");
                                return (
                                <Card key={groupKey} className="border-2 border-slate-200 shadow-sm overflow-hidden">
                                    <CardHeader className="bg-gradient-to-r from-amber-50 to-yellow-50 border-b border-amber-200 py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <Crown className="h-5 w-5 text-yellow-600" />
                                            <Badge className="bg-amber-600 text-white text-xs px-2 py-1">
                                                {CATEGORY_LABELS[category as AgeCategory]}
                                            </Badge>
                                            <Badge variant="outline" className="text-xs">
                                                {distance}m
                                            </Badge>
                                            <span className="text-slate-500 text-sm font-medium">
                                                {results.length} arquero{results.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <div className="divide-y divide-slate-100">
                                            {results.map((result, index) => (
                                                <div
                                                    key={`${result.archerId}-${index}`}
                                                    className={`
                                                        flex items-center p-4 transition-colors
                                                        ${result.position === 1 ? 'bg-gradient-to-r from-yellow-50 to-amber-50' : ''}
                                                        ${result.position === 2 ? 'bg-gradient-to-r from-slate-50 to-slate-100' : ''}
                                                        ${result.position === 3 ? 'bg-gradient-to-r from-amber-50/50 to-orange-50/50' : ''}
                                                    `}
                                                >
                                                    <div className="flex-shrink-0 mr-4">
                                                        {getPositionIcon(result.position)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-bold text-slate-900 text-base">
                                                            {result.lastName}, {result.firstName}
                                                        </div>
                                                        <div className="text-xs text-slate-500">
                                                            {result.club || "Sin club"} • {result.distance}m
                                                        </div>
                                                    </div>
                                                    <div className="flex-shrink-0">
                                                        <Badge
                                                            variant="outline"
                                                            className={`
                                                                ${result.position === 1 ? 'border-yellow-400 text-yellow-700 bg-yellow-50' : ''}
                                                                ${result.position === 2 ? 'border-slate-400 text-slate-600 bg-slate-50' : ''}
                                                                ${result.position === 3 ? 'border-amber-400 text-amber-700 bg-amber-50' : ''}
                                                                ${result.position > 3 ? 'border-slate-300 text-slate-500' : ''}
                                                            `}
                                                        >
                                                            {result.eliminatedRound}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )})
                        ) : (
                            <Card className="border-2 border-slate-200 shadow-sm">
                                <CardContent className="py-12 text-center">
                                    <div className="bg-slate-100 p-4 rounded-full mb-4 inline-block">
                                        <Crown className="h-8 w-8 text-slate-400" />
                                    </div>
                                    <h3 className="font-bold text-slate-900 text-lg">Sin resultados de eliminatorias</h3>
                                    <p className="text-slate-500 max-w-sm mt-2 mx-auto text-sm">
                                        Las eliminatorias aún no han finalizado o no hay brackets generados.
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    {/* Qualification Results Tab */}
                    <TabsContent value="qualification" className="mt-4 space-y-4">
                        {groupedQualification.size > 0 ? (
                            Array.from(groupedQualification.entries()).map(([groupKey, archers]) => {
                                const [category, distance] = groupKey.split("|");
                                return (
                                <Card key={groupKey} className="border-2 border-slate-200 shadow-sm overflow-hidden">
                                    <CardHeader className="bg-slate-50 border-b border-slate-200 py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <Badge className="bg-blue-600 text-white text-xs px-2 py-1">
                                                {CATEGORY_LABELS[category as AgeCategory]}
                                            </Badge>
                                            <Badge variant="outline" className="text-xs">
                                                {distance}m
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
                                                            className={`
                                                                flex items-center p-3 lg:p-4 cursor-pointer active:bg-slate-100 transition-colors
                                                                ${archer.rank <= 3 ? 'bg-gradient-to-r from-amber-50/50 to-transparent' : ''}
                                                                ${isExpanded ? 'bg-blue-50/50' : ''}
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
                                                            <div className="flex-1 min-w-0 ml-2 lg:ml-3">
                                                                <div className="font-bold text-slate-900 text-sm lg:text-base truncate">
                                                                    {archer.lastName}, {archer.firstName}
                                                                </div>
                                                                <div className="text-xs text-slate-500 truncate">
                                                                    {archer.club || "Sin club"} • {GENDER_LABELS[archer.gender]} • {archer.distance}m
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
                                                                <div className="text-center hidden sm:block">
                                                                    <div className="text-[10px] text-slate-400 font-bold">10+X</div>
                                                                    <div className="text-sm font-bold text-yellow-700">{archer.tenPlusXCount}</div>
                                                                </div>
                                                                <div className="text-center hidden sm:block">
                                                                    <div className="text-[10px] text-slate-400 font-bold">X</div>
                                                                    <div className="text-sm font-bold text-amber-700">{archer.xCount}</div>
                                                                </div>
                                                                <div className="text-center bg-emerald-100 rounded-lg py-1.5 px-2 lg:py-2 lg:px-3">
                                                                    <div className="text-[10px] text-emerald-600 font-bold uppercase">Total</div>
                                                                    <div className="text-lg lg:text-xl font-black text-emerald-700">{archer.totalScore}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {isExpanded && (
                                                            <div className="bg-slate-50 border-t border-slate-200 p-3 lg:p-4">
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
                                                                                            className={`
                                                                                                w-7 h-7 flex items-center justify-center flex-shrink-0
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
                            )})
                        ) : (
                            <Card className="border-2 border-slate-200 shadow-sm">
                                <CardContent className="py-12 text-center">
                                    <div className="bg-slate-100 p-4 rounded-full mb-4 inline-block">
                                        <Trophy className="h-8 w-8 text-slate-400" />
                                    </div>
                                    <h3 className="font-bold text-slate-900 text-lg">Sin resultados</h3>
                                    <p className="text-slate-500 max-w-sm mt-2 mx-auto text-sm">
                                        No hay arqueros que coincidan con los filtros o aún no hay puntuaciones.
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
