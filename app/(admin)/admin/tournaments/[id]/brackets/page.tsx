"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Swords, Trophy, ChevronDown, ChevronRight, Loader2, Zap } from "lucide-react";
import { CATEGORY_LABELS, DIVISION_LABELS, GENDER_LABELS } from "@/lib/constants/categories";
import { FullPageLoader } from "@/components/shared/LoadingSpinner";
import { getRoundName } from "@/lib/utils/brackets";
import { resolvePendingByeAdvances } from "@/lib/utils/elimination-advancement";
import { toast } from "sonner";
import type { AgeCategory, Gender, TournamentDivision } from "@/types/database";

interface Archer {
    id: string;
    first_name: string;
    last_name: string;
    club: string | null;
    division: TournamentDivision;
}

interface Match {
    id: string;
    bracket_id: string;
    round_number: number;
    match_position: number;
    archer1_id: string | null;
    archer2_id: string | null;
    archer1_seed: number | null;
    archer2_seed: number | null;
    archer1_set_points: number;
    archer2_set_points: number;
    status: string;
    winner_id: string | null;
    archer1: Archer | null;
    archer2: Archer | null;
    target: { id: string; target_number: number; distance: number } | null;
}

interface Bracket {
    id: string;
    tournament_id: string;
    category: AgeCategory;
    gender: Gender;
    division: TournamentDivision;
    bracket_size: number;
    current_round: number;
    is_completed: boolean;
    matches: Match[];
}

interface Tournament {
    id: string;
    name: string;
}

interface GenerationResult {
    category: AgeCategory;
    distance: number;
    gender?: Gender;
    division?: TournamentDivision;
    archerCount: number;
    bracketSize: number;
    matchCount: number;
}

const hasSingleArcher = (match: Match) =>
    Boolean(match.archer1_id) !== Boolean(match.archer2_id);

const needsByeNormalization = (bracket: Bracket) =>
    bracket.matches.some((match) =>
        hasSingleArcher(match) && (match.status !== "completed" || !match.winner_id)
    );

export default function BracketsPage() {
    const params = useParams();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [brackets, setBrackets] = useState<Bracket[]>([]);
    const [selectedBracket, setSelectedBracket] = useState<Bracket | null>(null);
    const [collapsedRounds, setCollapsedRounds] = useState<Record<string, Record<number, boolean>>>({});

    // Generation results dialog
    const [showResultsDialog, setShowResultsDialog] = useState(false);
    const [generationResults, setGenerationResults] = useState<GenerationResult[]>([]);

    const fetchData = useCallback(async (showLoader = true) => {
        if (showLoader) {
            setIsLoading(true);
        }

        // Get tournament
        const { data: tournamentData } = await supabase
            .from("tournaments")
            .select("id, name")
            .eq("id", tournamentId)
            .single();

        if (tournamentData) {
            setTournament(tournamentData);
        }

        // Get brackets
        const response = await fetch(`/api/tournaments/${tournamentId}/brackets`);
        const data = await response.json();

        if (data.brackets) {
            setBrackets(data.brackets);
            setSelectedBracket((prevSelected) =>
                prevSelected
                    ? (data.brackets.find((bracket: Bracket) => bracket.id === prevSelected.id) || data.brackets[0] || null)
                    : (data.brackets.length > 0 ? data.brackets[0] : null)
            );
        }

        if (showLoader) {
            setIsLoading(false);
        }
    }, [supabase, tournamentId]);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    useEffect(() => {
        const channel = supabase
            .channel(`admin-brackets-${tournamentId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "elimination_matches" },
                () => {
                    void fetchData(false);
                }
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "sets" },
                () => {
                    void fetchData(false);
                }
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "elimination_brackets" },
                () => {
                    void fetchData(false);
                }
            )
            .subscribe();

        const interval = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                void fetchData(false);
            }
        }, 120000);

        return () => {
            clearInterval(interval);
            supabase.removeChannel(channel);
        };
    }, [fetchData, supabase, tournamentId]);

    useEffect(() => {
        if (brackets.length === 0) return;

        let cancelled = false;
        const normalizeByes = async () => {
            let changed = false;

            for (const bracket of brackets) {
                if (cancelled || !needsByeNormalization(bracket)) continue;
                await resolvePendingByeAdvances(supabase, bracket.id, bracket.bracket_size);
                changed = true;
            }

            if (!cancelled && changed) {
                await fetchData(false);
            }
        };

        normalizeByes().catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "Error interno";
            console.error("Error normalizando byes:", message);
        });

        return () => {
            cancelled = true;
        };
    }, [brackets, fetchData, supabase]);

    const handleGenerateAll = async () => {
        setIsGenerating(true);

        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/brackets/generate-all`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Error generando brackets");
            }

            setGenerationResults(data.brackets || []);
            setShowResultsDialog(true);

            toast.success("¡Brackets generados!", {
                description: `${data.bracketsGenerated} brackets, ${data.totalArchers} arqueros, ${data.totalMatches} partidos`,
            });

            // Refresh
            await fetchData();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Error interno";
            toast.error("Error", { description: message });
        } finally {
            setIsGenerating(false);
        }
    };


    const getMatchesByRound = (matches: Match[]) => {
        const byRound = new Map<number, Match[]>();
        for (const match of matches) {
            if (!byRound.has(match.round_number)) {
                byRound.set(match.round_number, []);
            }
            byRound.get(match.round_number)!.push(match);
        }
        // Sort matches within each round by position
        for (const [, roundMatches] of byRound) {
            roundMatches.sort((a, b) => a.match_position - b.match_position);
        }
        return byRound;
    };

    const isRoundCompleted = (matches: Match[]) =>
        matches.length > 0 && matches.every((match) => match.status === "completed");

    const getBracketDistance = (bracket: Bracket): number | null => {
        for (const match of bracket.matches) {
            if (match.target?.distance) return match.target.distance;
        }
        return null;
    };

    const getBracketSummary = (bracket: Bracket) => {
        const distance = getBracketDistance(bracket);
        const siblingBrackets = brackets.filter((candidate) =>
            candidate.id !== bracket.id &&
            candidate.category === bracket.category &&
            getBracketDistance(candidate) === distance
        );
        const showGender = siblingBrackets.some((candidate) => candidate.gender !== bracket.gender);
        const showDivision = siblingBrackets.some((candidate) => candidate.division !== bracket.division);

        return [
            distance ? `${distance}m` : null,
            showGender ? GENDER_LABELS[bracket.gender] : null,
            showDivision ? DIVISION_LABELS[bracket.division] : null,
        ]
            .filter(Boolean)
            .join(" â€¢ ");
    };

    if (isLoading) {
        return <FullPageLoader text="Cargando brackets..." />;
    }

    return (
        <div className="min-h-screen bg-white space-y-4 pb-20">
            {/* Header */}
            <div className="bg-gradient-to-b from-slate-100 to-white border-b border-slate-200 -mx-4 lg:-mx-6 -mt-4 lg:-mt-6 px-4 lg:px-8 py-4 lg:py-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between gap-2 mb-4">
                        <div className="flex items-center gap-2 lg:gap-4 min-w-0">
                            <Button variant="outline" size="icon" asChild className="border-slate-300 hover:bg-slate-100 h-9 w-9 flex-shrink-0">
                                <Link href={`/admin/tournaments/${tournamentId}`}>
                                    <ArrowLeft className="h-4 w-4 text-slate-700" />
                                </Link>
                            </Button>
                            <div className="min-w-0">
                                <h1 className="text-lg lg:text-2xl font-black tracking-tight text-slate-900 uppercase truncate">
                                    Eliminatorias
                                </h1>
                                <p className="text-xs lg:text-sm text-slate-600 font-medium truncate">
                                    {tournament?.name}
                                </p>
                            </div>
                        </div>
                        <Button
                            onClick={handleGenerateAll}
                            disabled={isGenerating}
                            className="bg-blue-600 hover:bg-blue-700 flex-shrink-0"
                            size="sm"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span className="hidden sm:inline ml-2">Generando...</span>
                                </>
                            ) : (
                                <>
                                    <Zap className="h-4 w-4" />
                                    <span className="hidden sm:inline ml-2">Generar Brackets</span>
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Bracket Tabs - Horizontal Scroll */}
                    {brackets.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0">
                            {brackets.map((bracket) => (
                                <button
                                    key={bracket.id}
                                    onClick={() => setSelectedBracket(bracket)}
                                    className={`
                                        flex-shrink-0 px-3 py-2 rounded-lg border-2 transition-all
                                        ${selectedBracket?.id === bracket.id
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400'
                                        }
                                    `}
                                >
                                    <div className="text-sm font-bold">
                                        {CATEGORY_LABELS[bracket.category]}
                                    </div>
                                    <div className="text-xs opacity-80">
                                        {getBracketSummary(bracket)}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto space-y-4">
                {/* Selected Bracket Content */}
                {selectedBracket ? (
                    <div className="space-y-4">
                        {/* Bracket Info */}
                        <Card className="border-2 border-slate-200 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-blue-100 p-2 rounded-lg">
                                            <Swords className="h-5 w-5 text-blue-600" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-900">
                                                {CATEGORY_LABELS[selectedBracket.category]}
                                            </div>
                                            <div className="text-sm text-slate-500">
                                                {getBracketSummary(selectedBracket)} - Bracket de {selectedBracket.bracket_size} - Ronda actual: {selectedBracket.current_round}
                                            </div>
                                        </div>
                                    </div>
                                    <Badge className={selectedBracket.is_completed ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}>
                                        {selectedBracket.is_completed ? "Completado" : "En Curso"}
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Matches by Round - Mobile Friendly List */}
                        {Array.from(getMatchesByRound(selectedBracket.matches).entries())
                            .sort(([a], [b]) => {
                                // Bronze match (round 0) should appear last
                                if (a === 0) return 1;
                                if (b === 0) return -1;
                                return a - b;
                            })
                            .map(([roundNum, matches]) => {
                                const roundComplete = isRoundCompleted(matches);
                                const autoCollapsed = roundComplete;
                                const isCollapsed = collapsedRounds[selectedBracket.id]?.[roundNum] ?? autoCollapsed;

                                return (
                                    <Card key={roundNum} className="border-2 border-slate-200 shadow-sm overflow-hidden">
                                        <CardHeader className="bg-slate-50 border-b border-slate-200 py-0 px-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCollapsedRounds((prev) => {
                                                        const currentByBracket = { ...(prev[selectedBracket.id] || {}) };
                                                        const nextCollapsed = !isCollapsed;

                                                        if (nextCollapsed === autoCollapsed) {
                                                            delete currentByBracket[roundNum];
                                                        } else {
                                                            currentByBracket[roundNum] = nextCollapsed;
                                                        }

                                                        if (Object.keys(currentByBracket).length === 0) {
                                                            const nextState = { ...prev };
                                                            delete nextState[selectedBracket.id];
                                                            return nextState;
                                                        }

                                                        return {
                                                            ...prev,
                                                            [selectedBracket.id]: currentByBracket,
                                                        };
                                                    });
                                                }}
                                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                                            >
                                                <div className="min-w-0">
                                                    <CardTitle className="text-base font-bold">
                                                        {getRoundName(selectedBracket.bracket_size, roundNum)}
                                                    </CardTitle>
                                                    <div className="mt-1 text-xs text-slate-500">
                                                        {roundComplete ? "Etapa concluida" : "Etapa activa"}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {roundComplete && (
                                                        <Badge className="bg-emerald-100 text-emerald-700">
                                                            Completada
                                                        </Badge>
                                                    )}
                                                    <Badge variant="outline" className="text-xs">
                                                        {matches.length} partido{matches.length !== 1 ? 's' : ''}
                                                    </Badge>
                                                    <ChevronDown
                                                        className={cn(
                                                            "h-4 w-4 text-slate-400 transition-transform",
                                                            isCollapsed && "-rotate-90"
                                                        )}
                                                    />
                                                </div>
                                            </button>
                                        </CardHeader>
                                        {!isCollapsed && (
                                            <CardContent className="p-3">
                                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                                    {matches.map((match) => (
                                                        <MatchCard
                                                            key={match.id}
                                                            match={match}
                                                            tournamentId={tournamentId}
                                                        />
                                                    ))}
                                                </div>
                                            </CardContent>
                                        )}
                                    </Card>
                                );
                            })}
                    </div>
                ) : brackets.length === 0 ? (
                    <Card className="border-2 border-slate-200 shadow-sm">
                        <CardContent className="py-12 text-center">
                            <div className="bg-slate-100 p-4 rounded-full mb-4 inline-block">
                                <Swords className="h-8 w-8 text-slate-400" />
                            </div>
                            <h3 className="font-bold text-slate-900 text-lg">Sin brackets</h3>
                            <p className="text-slate-500 max-w-sm mt-2 mx-auto text-sm">
                                Genera los brackets automáticamente basados en los resultados de clasificación.
                                Se crearán brackets separados por categoría, género y distancia.
                            </p>
                            <Button
                                onClick={handleGenerateAll}
                                disabled={isGenerating}
                                className="mt-4 bg-blue-600 hover:bg-blue-700"
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Generando...
                                    </>
                                ) : (
                                    <>
                                        <Zap className="h-4 w-4 mr-2" />
                                        Generar Brackets
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                ) : null}
            </div>

            {/* Results Dialog */}
            <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900">¡Brackets Generados!</DialogTitle>
                        <DialogDescription>
                            Se han creado los siguientes brackets de eliminatorias:
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2 py-4 max-h-64 overflow-y-auto">
                        {generationResults.map((result, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                <div>
                                    <div className="font-bold text-slate-900">
                                        {CATEGORY_LABELS[result.category]}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {[
                                            `${result.distance}m`,
                                            result.gender ? GENDER_LABELS[result.gender] : null,
                                            result.division ? DIVISION_LABELS[result.division] : null,
                                            `${result.archerCount} arqueros`,
                                        ].filter(Boolean).join(" - ")}
                                    </div>
                                </div>
                                <Badge variant="outline">
                                    Top {result.bracketSize}
                                </Badge>
                            </div>
                        ))}
                    </div>

                    <DialogFooter>
                        <Button onClick={() => setShowResultsDialog(false)} className="bg-blue-600 hover:bg-blue-700">
                            Continuar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// Match Card Component - Mobile First
interface MatchCardProps {
    match: Match;
    tournamentId: string;
}

function MatchCard({ match, tournamentId }: MatchCardProps) {
    const getStatusColor = (status: string) => {
        switch (status) {
            case "completed": return "bg-emerald-500";
            case "in_progress": return "bg-blue-500 animate-pulse";
            case "shootoff": return "bg-amber-500 animate-pulse";
            default: return "bg-slate-300";
        }
    };

    const isArcher1Winner = Boolean(match.archer1_id) && match.winner_id === match.archer1_id;
    const isArcher2Winner = Boolean(match.archer2_id) && match.winner_id === match.archer2_id;
    const isBye = !match.archer1_id || !match.archer2_id;

    return (
        <Link
            href={!isBye ? `/admin/tournaments/${tournamentId}/matches/${match.id}` : '#'}
            className={cn(
                "block rounded-2xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100",
                isBye && "cursor-default hover:border-slate-200 hover:bg-white active:bg-white"
            )}
        >
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">
                            {match.match_position}
                        </div>
                        {match.target && (
                            <div className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700">
                                T{match.target.target_number}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${getStatusColor(match.status)}`} />
                        {!isBye && <ChevronRight className="h-4 w-4 text-slate-300" />}
                    </div>
                </div>

                <div className="space-y-2">
                    <div className={cn(
                        "grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-xl border px-3 py-2",
                        isArcher1Winner ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"
                    )}>
                        <span className="text-[11px] font-bold text-slate-400">
                            {match.archer1_seed ? `#${match.archer1_seed}` : "-"}
                        </span>
                        <span className={cn("truncate text-sm font-semibold", isArcher1Winner ? "text-emerald-700" : "text-slate-700")}>
                            {match.archer1 ? `${match.archer1.last_name}, ${match.archer1.first_name}` : "BYE"}
                        </span>
                        <span className={cn("text-lg font-black", isArcher1Winner ? "text-emerald-700" : "text-slate-600")}>
                            {match.archer1_set_points}
                        </span>
                        {isArcher1Winner ? <Trophy className="h-4 w-4 text-yellow-500" /> : <div className="h-4 w-4" />}
                    </div>

                    <div className={cn(
                        "grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-xl border px-3 py-2",
                        isArcher2Winner ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"
                    )}>
                        <span className="text-[11px] font-bold text-slate-400">
                            {match.archer2_seed ? `#${match.archer2_seed}` : "-"}
                        </span>
                        <span className={cn("truncate text-sm font-semibold", isArcher2Winner ? "text-emerald-700" : "text-slate-700")}>
                            {match.archer2 ? `${match.archer2.last_name}, ${match.archer2.first_name}` : "BYE"}
                        </span>
                        <span className={cn("text-lg font-black", isArcher2Winner ? "text-emerald-700" : "text-slate-600")}>
                            {match.archer2_set_points}
                        </span>
                        {isArcher2Winner ? <Trophy className="h-4 w-4 text-yellow-500" /> : <div className="h-4 w-4" />}
                    </div>
                </div>

                {match.status === "shootoff" && (
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-amber-700">
                        Shoot-off
                    </div>
                )}
                {isBye && (
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-slate-400">
                        Pase por Bye
                    </div>
                )}
                {match.target?.distance && (
                    <div className="text-center text-[11px] font-medium text-slate-400">
                        {match.target.distance}m
                    </div>
                )}
            </div>
        </Link>
    );
}
