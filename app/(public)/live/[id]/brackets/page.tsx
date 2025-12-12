"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Swords, Trophy, RefreshCw } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/constants/categories";
import { getRoundName } from "@/lib/utils/brackets";
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
}

interface Bracket {
    id: string;
    category: AgeCategory;
    gender: Gender;
    bracket_size: number;
    current_round: number;
    is_completed: boolean;
    matches: Match[];
}

export default function LiveBracketsPage() {
    const params = useParams();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [brackets, setBrackets] = useState<Bracket[]>([]);
    const [selectedBracket, setSelectedBracket] = useState<Bracket | null>(null);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    const fetchBrackets = useCallback(async () => {
        const response = await fetch(`/api/tournaments/${tournamentId}/brackets`);
        const data = await response.json();

        if (data.brackets) {
            setBrackets(data.brackets);
            if (data.brackets.length > 0 && !selectedBracket) {
                setSelectedBracket(data.brackets[0]);
            } else if (selectedBracket) {
                // Update selected bracket with fresh data
                const updated = data.brackets.find((b: Bracket) => b.id === selectedBracket.id);
                if (updated) setSelectedBracket(updated);
            }
        }

        setLastUpdate(new Date());
        setIsLoading(false);
    }, [tournamentId, selectedBracket]);

    useEffect(() => {
        fetchBrackets();

        // Auto-refresh every 60 seconds
        const interval = setInterval(fetchBrackets, 60000);
        return () => clearInterval(interval);
    }, []);

    // Refetch when selected bracket changes (but not on interval)
    useEffect(() => {
        if (selectedBracket) {
            const updated = brackets.find(b => b.id === selectedBracket.id);
            if (updated) setSelectedBracket(updated);
        }
    }, [brackets]);

    const getMatchesByRound = (matches: Match[]) => {
        const byRound = new Map<number, Match[]>();
        for (const match of matches) {
            if (!byRound.has(match.round_number)) {
                byRound.set(match.round_number, []);
            }
            byRound.get(match.round_number)!.push(match);
        }
        for (const [, roundMatches] of byRound) {
            roundMatches.sort((a, b) => a.match_position - b.match_position);
        }
        return byRound;
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "completed": return "bg-emerald-500";
            case "in_progress": return "bg-blue-500 animate-pulse";
            case "shootoff": return "bg-amber-500 animate-pulse";
            default: return "bg-slate-300";
        }
    };

    if (isLoading) {
        return (
            <div className="p-4 flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (brackets.length === 0) {
        return (
            <div className="p-4">
                <Card className="border-2 border-slate-200">
                    <CardContent className="py-12 text-center">
                        <Swords className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                        <h3 className="font-bold text-slate-900 text-lg">Sin eliminatorias</h3>
                        <p className="text-slate-500 mt-2 text-sm">
                            Las eliminatorias aún no han comenzado
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-4 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Eliminatorias en Vivo</h2>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <RefreshCw className="h-3 w-3" />
                    {lastUpdate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                </div>
            </div>

            {/* Bracket Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
                {brackets.map((bracket) => (
                    <button
                        key={bracket.id}
                        onClick={() => setSelectedBracket(bracket)}
                        className={cn(
                            "flex-shrink-0 px-3 py-2 rounded-lg border-2 transition-all",
                            selectedBracket?.id === bracket.id
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-700 border-slate-300'
                        )}
                    >
                        <div className="text-sm font-bold">
                            {CATEGORY_LABELS[bracket.category] || bracket.category}
                        </div>
                        <div className="text-xs opacity-80">
                            Top {bracket.bracket_size}
                        </div>
                    </button>
                ))}
            </div>

            {/* Selected Bracket */}
            {selectedBracket && (
                <div className="space-y-4">
                    {/* Bracket Status */}
                    <Card className="border-2 border-slate-200">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Swords className="h-5 w-5 text-blue-600" />
                                    <span className="font-bold text-slate-900">
                                        {CATEGORY_LABELS[selectedBracket.category]}
                                    </span>
                                </div>
                                <Badge className={selectedBracket.is_completed ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}>
                                    {selectedBracket.is_completed ? "Finalizado" : "En Curso"}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Matches by Round */}
                    {Array.from(getMatchesByRound(selectedBracket.matches).entries())
                        .sort(([a], [b]) => {
                            if (a === 0) return 1;
                            if (b === 0) return -1;
                            return a - b;
                        })
                        .map(([roundNum, matches]) => (
                            <Card key={roundNum} className="border-2 border-slate-200 overflow-hidden">
                                <CardHeader className="bg-slate-50 border-b border-slate-200 py-2 px-3">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-sm font-bold">
                                            {getRoundName(selectedBracket.bracket_size, roundNum)}
                                        </CardTitle>
                                        <Badge variant="outline" className="text-xs">
                                            {matches.length} partido{matches.length !== 1 ? 's' : ''}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y divide-slate-100">
                                        {matches.map((match) => {
                                            const isArcher1Winner = match.winner_id === match.archer1_id;
                                            const isArcher2Winner = match.winner_id === match.archer2_id;

                                            return (
                                                <div key={match.id} className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-5 h-5 flex items-center justify-center bg-slate-100 rounded text-[10px] font-bold text-slate-500 flex-shrink-0">
                                                            {match.match_position}
                                                        </div>

                                                        {/* Horizontal Match Layout */}
                                                        <div className="flex-1 flex items-center bg-white rounded-lg border border-slate-200 overflow-hidden">
                                                            {/* Archer 1 */}
                                                            <div className={cn(
                                                                "flex-1 flex items-center gap-1.5 px-2 py-1 min-w-0",
                                                                isArcher1Winner && 'bg-emerald-50'
                                                            )}>
                                                                {isArcher1Winner && <Trophy className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
                                                                {match.archer1 ? (
                                                                    <div className="min-w-0">
                                                                        <div className={cn("text-xs truncate", isArcher1Winner ? 'text-emerald-600' : 'text-slate-500')}>
                                                                            {match.archer1.first_name}
                                                                        </div>
                                                                        <div className={cn("text-sm font-bold truncate", isArcher1Winner ? 'text-emerald-700' : 'text-slate-700')}>
                                                                            {match.archer1.last_name}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-slate-400 italic text-sm">BYE</span>
                                                                )}
                                                            </div>

                                                            {/* Scores in Center */}
                                                            <div className="flex items-center gap-0 flex-shrink-0 bg-slate-900 text-white">
                                                                <span className={cn(
                                                                    "px-2.5 py-2 text-base font-black min-w-[32px] text-center",
                                                                    isArcher1Winner ? 'bg-emerald-600' : 'bg-slate-700'
                                                                )}>
                                                                    {match.archer1_set_points}
                                                                </span>
                                                                <span className="text-slate-500 text-xs">-</span>
                                                                <span className={cn(
                                                                    "px-2.5 py-2 text-base font-black min-w-[32px] text-center",
                                                                    isArcher2Winner ? 'bg-emerald-600' : 'bg-slate-700'
                                                                )}>
                                                                    {match.archer2_set_points}
                                                                </span>
                                                            </div>

                                                            {/* Archer 2 */}
                                                            <div className={cn(
                                                                "flex-1 flex items-center justify-end gap-1.5 px-2 py-1 min-w-0",
                                                                isArcher2Winner && 'bg-emerald-50'
                                                            )}>
                                                                {match.archer2 ? (
                                                                    <div className="min-w-0 text-right">
                                                                        <div className={cn("text-xs truncate", isArcher2Winner ? 'text-emerald-600' : 'text-slate-500')}>
                                                                            {match.archer2.first_name}
                                                                        </div>
                                                                        <div className={cn("text-sm font-bold truncate", isArcher2Winner ? 'text-emerald-700' : 'text-slate-700')}>
                                                                            {match.archer2.last_name}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-slate-400 italic text-sm">BYE</span>
                                                                )}
                                                                {isArcher2Winner && <Trophy className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
                                                            </div>
                                                        </div>

                                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(match.status)}`} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                </div>
            )}
        </div>
    );
}
