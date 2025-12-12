"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { SetScorer } from "@/components/admin/SetScorer";
import { FullPageLoader } from "@/components/shared/LoadingSpinner";
import type { EliminationMatchWithArchers } from "@/types/database";

export default function MatchScoringPage() {
    const params = useParams();
    const tournamentId = params.id as string;
    const matchId = params.matchId as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [match, setMatch] = useState<EliminationMatchWithArchers | null>(null);

    useEffect(() => {
        fetchMatch();
    }, [matchId]);

    const fetchMatch = async () => {
        const { data, error } = await supabase
            .from("elimination_matches")
            .select(`
                *,
                archer1:archers!elimination_matches_archer1_id_fkey(*),
                archer2:archers!elimination_matches_archer2_id_fkey(*),
                winner:archers!elimination_matches_winner_id_fkey(*)
            `)
            .eq("id", matchId)
            .single();

        if (error) {
            console.error("Error loading match:", error);
        } else {
            setMatch(data as EliminationMatchWithArchers);
        }
        setIsLoading(false);
    };

    if (isLoading) {
        return <FullPageLoader text="Cargando partido..." />;
    }

    if (!match) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-4">
                <h1 className="text-xl font-bold mb-4">Partido no encontrado</h1>
                <Button asChild>
                    <Link href={`/admin/tournaments/${tournamentId}/brackets`}>
                        Volver a Brackets
                    </Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            {/* Minimal Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10 shadow-sm">
                <div className="max-w-md mx-auto flex items-center gap-3">
                    <Button variant="ghost" size="icon" asChild className="-ml-2">
                        <Link href={`/admin/tournaments/${tournamentId}/brackets`}>
                            <ArrowLeft className="h-5 w-5 text-slate-600" />
                        </Link>
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-base font-bold text-slate-900 leading-none">
                            Scoring Match #{match.match_position}
                        </h1>
                        <p className="text-xs text-slate-500 mt-1">
                            Ronda {match.round_number}
                        </p>
                    </div>
                </div>
            </div>

            <div className="max-w-md mx-auto p-4">
                <SetScorer
                    match={match}
                    onMatchUpdate={(updatedMatch) => setMatch(updatedMatch)}
                />
            </div>
        </div>
    );
}
