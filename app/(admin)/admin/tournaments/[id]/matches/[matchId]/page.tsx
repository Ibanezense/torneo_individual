"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Radio } from "lucide-react";
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

    const fetchMatch = useCallback(async () => {
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
    }, [matchId, supabase]);

    useEffect(() => {
        const timer = setTimeout(() => {
            void fetchMatch();
        }, 0);

        return () => clearTimeout(timer);
    }, [fetchMatch]);

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
        <div className="min-h-screen bg-[#eef2f7] pb-8">
            <div className="sticky top-0 z-20 bg-[#0f4170] text-white shadow-lg">
                <div className="mx-auto max-w-3xl px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                        <Link
                            href={`/admin/tournaments/${tournamentId}/brackets`}
                            className="inline-flex items-center gap-2 text-white/90 hover:text-white"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Volver a brackets
                        </Link>
                        <div className="inline-flex items-center gap-1 text-emerald-200">
                            <Radio className="h-3.5 w-3.5" />
                            Admin scoring
                        </div>
                    </div>
                    <div className="mt-2">
                        <h1 className="text-lg font-black leading-none">
                            Partido #{match.match_position}
                        </h1>
                        <p className="mt-1 text-xs text-white/70">
                            Ronda {match.round_number}
                        </p>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-3xl p-4">
                <SetScorer
                    match={match}
                    onMatchUpdate={(updatedMatch) => setMatch(updatedMatch)}
                />
            </div>
        </div>
    );
}
