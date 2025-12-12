"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Swords, Trophy, RefreshCw, ChevronRight, Users, Loader2, Zap } from "lucide-react";
import { CATEGORY_LABELS, GENDER_LABELS } from "@/lib/constants/categories";
import { FullPageLoader } from "@/components/shared/LoadingSpinner";
import { getRoundName } from "@/lib/utils/brackets";
import { toast } from "sonner";
import type { AgeCategory, Gender } from "@/types/database";

interface Archer {
    id: string;
    first_name: string;
    last_name: string;
    club: string | null;
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
    target: { id: string; target_number: number } | null;
}

interface Bracket {
    id: string;
    tournament_id: string;
    category: AgeCategory;
    gender: Gender;
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
    gender: Gender;
    distance: number;
    archerCount: number;
    bracketSize: number;
    matchCount: number;
}

export default function BracketsPage() {
    const params = useParams();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [brackets, setBrackets] = useState<Bracket[]>([]);
    const [selectedBracket, setSelectedBracket] = useState<Bracket | null>(null);

    // Generation results dialog
    const [showResultsDialog, setShowResultsDialog] = useState(false);
    const [generationResults, setGenerationResults] = useState<GenerationResult[]>([]);

    useEffect(() => {
        fetchData();
    }, [tournamentId]);

    const fetchData = async () => {
        setIsLoading(true);

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
            if (data.brackets.length > 0 && !selectedBracket) {
                setSelectedBracket(data.brackets[0]);
            }
        }

        setIsLoading(false);
    };

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
        } catch (error: any) {
            toast.error("Error", { description: error.message });
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

    const getMatchStatusColor = (status: string) => {
        switch (status) {
            case "completed": return "bg-emerald-100 text-emerald-700 border-emerald-300";
            case "in_progress": return "bg-blue-100 text-blue-700 border-blue-300";
            case "shootoff": return "bg-amber-100 text-amber-700 border-amber-300";
            default: return "bg-slate-100 text-slate-600 border-slate-300";
        }
    };

    const getMatchStatusLabel = (status: string) => {
        switch (status) {
            case "completed": return "Finalizado";
            case "in_progress": return "En Curso";
            case "shootoff": return "Desempate";
            default: return "Pendiente";
        }
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
                                        Mixto
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
                                                {CATEGORY_LABELS[selectedBracket.category]} (Mixto)
                                            </div>
                                            <div className="text-sm text-slate-500">
                                                Bracket de {selectedBracket.bracket_size} • Ronda actual: {selectedBracket.current_round}
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
                            .map(([roundNum, matches]) => (
                                <Card key={roundNum} className="border-2 border-slate-200 shadow-sm overflow-hidden">
                                    <CardHeader className="bg-slate-50 border-b border-slate-200 py-3 px-4">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-base font-bold">
                                                {getRoundName(selectedBracket.bracket_size, roundNum)}
                                            </CardTitle>
                                            <Badge variant="outline" className="text-xs">
                                                {matches.length} partido{matches.length !== 1 ? 's' : ''}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <div className="divide-y divide-slate-100">
                                            {matches.map((match) => (
                                                <MatchCard
                                                    key={match.id}
                                                    match={match}
                                                    bracketSize={selectedBracket.bracket_size}
                                                    roundNumber={roundNum}
                                                    tournamentId={tournamentId}
                                                />
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
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
                                        {CATEGORY_LABELS[result.category]} - {result.distance}m
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        {result.distance}m • {result.archerCount} arqueros
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
    bracketSize: number;
    roundNumber: number;
    tournamentId: string;
}

function MatchCard({ match, bracketSize, roundNumber, tournamentId }: MatchCardProps) {
    const getStatusColor = (status: string) => {
        switch (status) {
            case "completed": return "bg-emerald-500";
            case "in_progress": return "bg-blue-500 animate-pulse";
            case "shootoff": return "bg-amber-500 animate-pulse";
            default: return "bg-slate-300";
        }
    };

    const isArcher1Winner = match.winner_id === match.archer1_id;
    const isArcher2Winner = match.winner_id === match.archer2_id;
    const isBye = !match.archer1_id || !match.archer2_id;

    return (
        <Link
            href={!isBye ? `/admin/tournaments/${tournamentId}/matches/${match.id}` : '#'}
            className={cn(
                "block p-3 lg:p-4 hover:bg-slate-50 active:bg-slate-100 transition-colors",
                isBye && "cursor-default hover:bg-white active:bg-white"
            )}
        >
            <div className="flex items-center gap-3">
                {/* Match Number */}
                <div className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg text-sm font-bold text-slate-600 flex-shrink-0">
                    {match.match_position}
                </div>

                {/* Target Badge */}
                {match.target && (
                    <div className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-1 rounded">
                        T{match.target.target_number}
                    </div>
                )}

                {/* Players */}
                <div className="flex-1 min-w-0 space-y-1">
                    {/* Archer 1 */}
                    <div className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border",
                        isArcher1Winner ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'
                    )}>
                        <span className="text-xs font-bold text-slate-400 w-5">
                            {match.archer1_seed ? `#${match.archer1_seed}` : '-'}
                        </span>
                        <span className={cn("flex-1 truncate text-sm font-medium", isArcher1Winner ? 'text-emerald-700' : 'text-slate-700')}>
                            {match.archer1
                                ? `${match.archer1.last_name}, ${match.archer1.first_name}`
                                : <span className="text-slate-400 italic">BYE</span>
                            }
                        </span>
                        <span className={cn("font-bold text-sm", isArcher1Winner ? 'text-emerald-700' : 'text-slate-500')}>
                            {match.archer1_set_points}
                        </span>
                        {isArcher1Winner && <Trophy className="h-4 w-4 text-yellow-500" />}
                    </div>

                    {/* Archer 2 */}
                    <div className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border",
                        isArcher2Winner ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'
                    )}>
                        <span className="text-xs font-bold text-slate-400 w-5">
                            {match.archer2_seed ? `#${match.archer2_seed}` : '-'}
                        </span>
                        <span className={cn("flex-1 truncate text-sm font-medium", isArcher2Winner ? 'text-emerald-700' : 'text-slate-700')}>
                            {match.archer2
                                ? `${match.archer2.last_name}, ${match.archer2.first_name}`
                                : <span className="text-slate-400 italic">BYE</span>
                            }
                        </span>
                        <span className={cn("font-bold text-sm", isArcher2Winner ? 'text-emerald-700' : 'text-slate-500')}>
                            {match.archer2_set_points}
                        </span>
                        {isArcher2Winner && <Trophy className="h-4 w-4 text-yellow-500" />}
                    </div>
                </div>

                {/* Status & Arrow */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(match.status)}`} />
                    {!isBye && <ChevronRight className="h-5 w-5 text-slate-300" />}
                </div>
            </div>
        </Link>
    );
}
