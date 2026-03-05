"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, ChevronRight, Loader2, Radio, Target, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import { CATEGORY_LABELS } from "@/lib/constants/categories";

interface MatchData {
    id: string;
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
    archer1: { id: string; first_name: string; last_name: string; club: string | null } | null;
    archer2: { id: string; first_name: string; last_name: string; club: string | null } | null;
    bracket: {
        id: string;
        category: string;
        bracket_size: number;
        tournament: { id: string; name: string; elimination_arrows_per_set: number; points_to_win_match: number };
    };
}

interface TargetData {
    id: string;
    target_number: number;
    distance: number;
}

interface MatchSetData {
    id: string;
    set_number: number;
    archer1_arrows: number[];
    archer2_arrows: number[];
    archer1_set_result: number | null;
    archer2_set_result: number | null;
    is_confirmed: boolean;
    is_shootoff?: boolean | null;
    shootoff_archer1_distance?: number | null;
    shootoff_archer2_distance?: number | null;
}

const getRoundName = (bracketSize: number, roundNumber: number) => {
    const totalRounds = Math.log2(bracketSize);
    const roundsFromFinal = totalRounds - roundNumber + 1;
    if (roundNumber === 0) return "Bronce";
    if (roundsFromFinal === 1) return "Final";
    if (roundsFromFinal === 2) return "Semifinal";
    if (roundsFromFinal === 3) return "Cuartos";
    if (roundsFromFinal === 4) return "1/8";
    return `Ronda ${roundNumber}`;
};

const scoreValue = (score: number | null | undefined) => {
    if (!score) return 0;
    return score === 11 ? 10 : score;
};

const displayScore = (score: number | null | undefined) => {
    if (score === 11) return "X";
    if (score === 0) return "M";
    if (score === null || score === undefined) return "-";
    return String(score);
};

const getArrowClasses = (score: number | null | undefined) => {
    if (score === 11 || score === 10 || score === 9) return "bg-yellow-300 text-slate-900";
    if (score === 8 || score === 7) return "bg-red-500 text-white";
    if (score === 6 || score === 5) return "bg-sky-400 text-white";
    if (score === 4 || score === 3) return "bg-slate-700 text-white";
    if (score === 2 || score === 1) return "bg-slate-100 text-slate-800 ring-1 ring-slate-300";
    if (score === 0) return "bg-slate-200 text-slate-500";
    return "bg-slate-100 text-slate-400 ring-1 ring-slate-200";
};

const getInitials = (firstName?: string, lastName?: string) => {
    const first = firstName?.trim().charAt(0) || "";
    const last = lastName?.trim().charAt(0) || "";
    return `${first}${last}`.toUpperCase() || "?";
};

const sumArrows = (arrows: number[] | null | undefined) =>
    (arrows || []).reduce((total, arrow) => total + scoreValue(arrow), 0);

export default function EliminationTargetHubPage() {
    const params = useParams();
    const router = useRouter();
    const targetId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [targetData, setTargetData] = useState<TargetData | null>(null);
    const [currentMatch, setCurrentMatch] = useState<MatchData | null>(null);
    const [matchSets, setMatchSets] = useState<MatchSetData[]>([]);
    const hasConfirmedWinner = currentMatch?.status === "completed" && Boolean(currentMatch?.winner_id);

    const fetchData = useCallback(async () => {
        setIsLoading(true);

        const { data: target, error: targetError } = await supabase
            .from("targets")
            .select("id, target_number, distance")
            .eq("id", targetId)
            .single();

        if (targetError || !target) {
            toast.error("Paca no encontrada");
            setIsLoading(false);
            return;
        }

        setTargetData(target);

        const matchSelect = `
                id, round_number, match_position,
                archer1_id, archer2_id, archer1_seed, archer2_seed,
                archer1_set_points, archer2_set_points, status, winner_id,
                archer1:archers!elimination_matches_archer1_id_fkey(id, first_name, last_name, club),
                archer2:archers!elimination_matches_archer2_id_fkey(id, first_name, last_name, club),
                bracket:elimination_brackets(
                    id, category, bracket_size,
                    tournament:tournaments(id, name, elimination_arrows_per_set, points_to_win_match)
                )
            `;

        const { data: activeMatch } = await supabase
            .from("elimination_matches")
            .select(matchSelect)
            .eq("target_id", targetId)
            .neq("status", "completed")
            .order("round_number", { ascending: false })
            .order("match_position", { ascending: false })
            .limit(1)
            .maybeSingle();

        let match = activeMatch;

        if (!match) {
            const { data: completedMatch } = await supabase
                .from("elimination_matches")
                .select(matchSelect)
                .eq("target_id", targetId)
                .eq("status", "completed")
                .order("round_number", { ascending: false })
                .order("match_position", { ascending: false })
                .limit(1)
                .maybeSingle();

            match = completedMatch;
        }

        if (!match) {
            setCurrentMatch(null);
            setMatchSets([]);
            setIsLoading(false);
            return;
        }

        const { data: setsData } = await supabase
            .from("sets")
            .select("id,set_number,archer1_arrows,archer2_arrows,archer1_set_result,archer2_set_result,is_confirmed,is_shootoff,shootoff_archer1_distance,shootoff_archer2_distance")
            .eq("match_id", match.id)
            .order("set_number");

        const confirmedSets = ((setsData || []) as MatchSetData[]).filter((row) => row.is_confirmed);
        const realArcher1Points = confirmedSets.reduce((sum, row) => sum + (row.archer1_set_result || 0), 0);
        const realArcher2Points = confirmedSets.reduce((sum, row) => sum + (row.archer2_set_result || 0), 0);

        setMatchSets((setsData || []) as MatchSetData[]);
        setCurrentMatch({
            ...(match as unknown as MatchData),
            archer1_set_points: realArcher1Points,
            archer2_set_points: realArcher2Points,
        });

        if (realArcher1Points !== match.archer1_set_points || realArcher2Points !== match.archer2_set_points) {
            await supabase
                .from("elimination_matches")
                .update({ archer1_set_points: realArcher1Points, archer2_set_points: realArcher2Points })
                .eq("id", match.id);
        }
        setIsLoading(false);
    }, [supabase, targetId]);

    useEffect(() => {
        const timer = setTimeout(() => {
            void fetchData();
        }, 0);

        return () => clearTimeout(timer);
    }, [fetchData]);

    const handleStartScoring = () => {
        if (!currentMatch) return;
        router.push(`/scoring/elimination/target/${targetId}/score`);
    };

    const handleBack = () => router.push("/access");

    const confirmedSets = useMemo(
        () => matchSets.filter((row) => row.is_confirmed).sort((a, b) => a.set_number - b.set_number),
        [matchSets]
    );

    if (isLoading) {
        return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-blue-700" /></div>;
    }

    if (!targetData) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-xl text-slate-700">Paca no encontrada</p>
                    <Button onClick={handleBack} className="mt-4">Volver</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#eef2f7] pb-safe">
            <div className="sticky top-0 z-20 bg-[#0f4170] text-white shadow-lg">
                <div className="mx-auto max-w-md px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                        <button onClick={handleBack} className="inline-flex items-center gap-2 text-white/90 hover:text-white">
                            <ArrowLeft className="h-4 w-4" />
                            Volver a acceso
                        </button>
                        <div className="inline-flex items-center gap-1 text-emerald-200">
                            <Radio className="h-3.5 w-3.5" />
                            Guardado en linea
                        </div>
                    </div>

                </div>
            </div>

            <div className="mx-auto max-w-md px-3 py-3">
                {currentMatch ? (
                    <div className="space-y-3">
                        <Card className="overflow-hidden border-0 shadow-md">
                            <CardContent className="p-0">
                                <div className="bg-white px-4 py-3">
                                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-500">
                                        <span>{getRoundName(currentMatch.bracket?.bracket_size || 8, currentMatch.round_number)}</span>
                                        <span>{currentMatch.bracket?.category ? CATEGORY_LABELS[currentMatch.bracket.category as keyof typeof CATEGORY_LABELS] : "Eliminatoria"}</span>
                                    </div>
                                </div>
                                <div className="border-t border-slate-100 bg-slate-50 px-4 py-4">
                                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                                        <div className="text-center">
                                            <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100 text-lg font-black text-sky-800">{getInitials(currentMatch.archer1?.first_name, currentMatch.archer1?.last_name)}</div>
                                            <div className="text-lg font-bold text-slate-900">{currentMatch.archer1?.first_name || "Arquero"}</div>
                                            <div className="text-xs text-slate-500">Seed #{currentMatch.archer1_seed || "?"}</div>
                                        </div>
                                        <div className="min-w-[96px] rounded-2xl bg-white px-3 py-2 text-center shadow-sm ring-1 ring-slate-200">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div><div className="text-3xl font-black text-emerald-500">{currentMatch.archer1_set_points}</div><div className="text-[10px] font-bold uppercase text-slate-500">Set</div></div>
                                                <div><div className="text-3xl font-black text-[#0f4170]">{currentMatch.archer2_set_points}</div><div className="text-[10px] font-bold uppercase text-slate-500">Set</div></div>
                                            </div>
                                            <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Match #{currentMatch.match_position}</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-lg font-black text-indigo-800">{getInitials(currentMatch.archer2?.first_name, currentMatch.archer2?.last_name)}</div>
                                            <div className="text-lg font-bold text-slate-900">{currentMatch.archer2?.first_name || "Oponente"}</div>
                                            <div className="text-xs text-slate-500">Seed #{currentMatch.archer2_seed || "?"}</div>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center justify-center gap-2">
                                        {hasConfirmedWinner && currentMatch.winner_id === currentMatch.archer1_id && <div className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700"><Trophy className="h-3.5 w-3.5" />Gano {currentMatch.archer1?.first_name}</div>}
                                        {hasConfirmedWinner && currentMatch.winner_id === currentMatch.archer2_id && <div className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700"><Trophy className="h-3.5 w-3.5" />Gano {currentMatch.archer2?.first_name}</div>}
                                        {currentMatch.status === "shootoff" && <div className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700"><Target className="h-3.5 w-3.5" />Shoot-off</div>}
                                        {currentMatch.status === "in_progress" && <div className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-700"><CheckCircle2 className="h-3.5 w-3.5" />En juego</div>}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-0 shadow-md">
                            <CardContent className="p-0">
                                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-t-2xl bg-slate-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                                    <div className="text-center">{currentMatch.archer1?.first_name || "Arquero"}</div>
                                    <div className="text-center">Set</div>
                                    <div className="text-center">{currentMatch.archer2?.first_name || "Oponente"}</div>
                                </div>

                                {confirmedSets.length > 0 ? (
                                    <div className="divide-y divide-slate-100">
                                        {confirmedSets.map((setRow) => {
                                            const leftArrows = setRow.archer1_arrows || [];
                                            const rightArrows = setRow.archer2_arrows || [];
                                            const setLabel = setRow.is_shootoff ? "SO" : String(setRow.set_number);

                                            return (
                                                <div key={setRow.id} className="px-3 py-3">
                                                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="min-w-[28px] text-right text-2xl font-black text-slate-700">{sumArrows(leftArrows)}</span>
                                                                <div className="flex gap-1">
                                                                    {leftArrows.map((arrow, index) => (
                                                                        <span key={`${setRow.id}-left-${index}`} className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${getArrowClasses(arrow)}`}>
                                                                            {displayScore(arrow)}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="text-center">
                                                            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">SET {setLabel}</div>
                                                            <div className="text-lg font-black text-[#0f4170]">{setRow.archer1_set_result || 0}-{setRow.archer2_set_result || 0}</div>
                                                        </div>

                                                        <div className="min-w-0">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <div className="flex gap-1">
                                                                    {rightArrows.map((arrow, index) => (
                                                                        <span key={`${setRow.id}-right-${index}`} className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${getArrowClasses(arrow)}`}>
                                                                            {displayScore(arrow)}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                <span className="min-w-[28px] text-left text-2xl font-black text-slate-700">{sumArrows(rightArrows)}</span>
                                                            </div>
                                                            {setRow.is_shootoff && (setRow.shootoff_archer1_distance !== null || setRow.shootoff_archer2_distance !== null) && (
                                                                <div className="mt-1 text-right text-[10px] font-medium text-slate-500">
                                                                    {setRow.shootoff_archer1_distance ?? "-"}cm / {setRow.shootoff_archer2_distance ?? "-"}cm
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="px-4 py-8 text-center text-sm text-slate-500">
                                        Aun no hay sets confirmados en este duelo.
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {currentMatch.status !== "completed" && (
                            <Button
                                onClick={handleStartScoring}
                                className={`h-14 w-full rounded-2xl text-base font-black shadow-lg ${currentMatch.status === "shootoff" ? "bg-amber-500 hover:bg-amber-600" : "bg-[#0f4170] hover:bg-[#133f67]"}`}
                            >
                                {currentMatch.status === "shootoff" ? "Registrar shoot-off" : "Registrar set"}
                                <ChevronRight className="ml-2 h-5 w-5" />
                            </Button>
                        )}
                    </div>
                ) : (
                    <Card className="border-0 shadow-md">
                        <CardContent className="py-12 text-center">
                            <Users className="mx-auto mb-4 h-12 w-12 text-slate-400" />
                            <h3 className="text-xl font-bold text-slate-700">Sin partido asignado</h3>
                            <p className="mt-2 text-slate-500">Esta paca no tiene ningun partido activo de eliminatorias.</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
