"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft, Swords, Trophy, Users } from "lucide-react";
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
    archer1: {
        id: string;
        first_name: string;
        last_name: string;
        club: string | null;
    } | null;
    archer2: {
        id: string;
        first_name: string;
        last_name: string;
        club: string | null;
    } | null;
    bracket: {
        id: string;
        category: string;
        bracket_size: number;
        tournament: {
            id: string;
            name: string;
            elimination_arrows_per_set: number;
            points_to_win_match: number;
        };
    };
}

interface TargetData {
    id: string;
    target_number: number;
    distance: number;
}

export default function EliminationTargetHubPage() {
    const params = useParams();
    const router = useRouter();
    const targetId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [targetData, setTargetData] = useState<TargetData | null>(null);
    const [currentMatch, setCurrentMatch] = useState<MatchData | null>(null);

    useEffect(() => {
        fetchData();
    }, [targetId]);

    const fetchData = async () => {
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

        const { data: match } = await supabase
            .from("elimination_matches")
            .select(`
                id, round_number, match_position,
                archer1_id, archer2_id, archer1_seed, archer2_seed,
                archer1_set_points, archer2_set_points, status, winner_id,
                archer1:archers!elimination_matches_archer1_id_fkey(id, first_name, last_name, club),
                archer2:archers!elimination_matches_archer2_id_fkey(id, first_name, last_name, club),
                bracket:elimination_brackets(
                    id, category, bracket_size,
                    tournament:tournaments(id, name, elimination_arrows_per_set, points_to_win_match)
                )
            `)
            .eq("target_id", targetId)
            .neq("status", "completed")
            .order("round_number", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (match) {
            // Fetch sets to calculate real points
            const { data: setsData } = await supabase
                .from("sets")
                .select("*")
                .eq("match_id", match.id)
                .eq("is_confirmed", true)
                .order("set_number");

            // Calculate real points from confirmed sets
            const realArcher1Points = setsData?.reduce((sum, s) => sum + (s.archer1_set_result || 0), 0) || 0;
            const realArcher2Points = setsData?.reduce((sum, s) => sum + (s.archer2_set_result || 0), 0) || 0;

            // Set match with real calculated points
            setCurrentMatch({
                ...(match as unknown as MatchData),
                archer1_set_points: realArcher1Points,
                archer2_set_points: realArcher2Points,
            });

            // Sync database if out of sync
            if (realArcher1Points !== match.archer1_set_points || realArcher2Points !== match.archer2_set_points) {
                await supabase
                    .from("elimination_matches")
                    .update({
                        archer1_set_points: realArcher1Points,
                        archer2_set_points: realArcher2Points,
                    })
                    .eq("id", match.id);
            }
        }

        setIsLoading(false);
    };

    const handleStartScoring = () => {
        if (currentMatch) {
            if (currentMatch.status === "shootoff") {
                router.push(`/scoring/elimination/target/${targetId}/shootoff`);
            } else {
                router.push(`/scoring/elimination/target/${targetId}/score`);
            }
        }
    };

    const handleBack = () => {
        router.push("/access");
    };

    const getRoundName = (bracketSize: number, roundNumber: number): string => {
        const totalRounds = Math.log2(bracketSize);
        const roundsFromFinal = totalRounds - roundNumber + 1;
        if (roundsFromFinal === 1) return "Final";
        if (roundsFromFinal === 2) return "Semifinal";
        if (roundsFromFinal === 3) return "Cuartos";
        if (roundsFromFinal === 4) return "1/8";
        return `Ronda ${roundNumber}`;
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "in_progress":
                return <Badge className="bg-blue-600 text-white">En Curso</Badge>;
            case "shootoff":
                return <Badge className="bg-amber-500 text-white">Desempate</Badge>;
            case "completed":
                return <Badge className="bg-emerald-600 text-white">Finalizado</Badge>;
            default:
                return <Badge className="bg-slate-400 text-white">Pendiente</Badge>;
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            </div>
        );
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
        <div className="min-h-screen bg-slate-100 pb-safe">
            {/* Header - Same style as qualification */}
            <div className="bg-[#333333] text-white p-3 shadow-md sticky top-0 z-20">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs uppercase tracking-wider text-slate-300 font-bold">Elimination Round</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleBack}
                        className="text-white hover:bg-white/20 h-8 w-8"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </div>
                <div className="flex justify-between items-end border-t border-slate-600 pt-2">
                    <h1 className="text-xl font-bold">Paca {targetData.target_number}</h1>
                    <span className="text-sm font-semibold bg-slate-700 px-2 py-1 rounded">
                        Distancia: {targetData.distance}m
                    </span>
                </div>
            </div>

            <div className="p-3 space-y-3">
                {currentMatch ? (
                    <>
                        {/* Match Info */}
                        <Card className="border-2 border-slate-200 shadow-sm">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Swords className="h-5 w-5 text-amber-500" />
                                        <span className="font-bold text-slate-800">
                                            {getRoundName(
                                                currentMatch.bracket?.bracket_size || 8,
                                                currentMatch.round_number
                                            )}
                                        </span>
                                    </div>
                                    {getStatusBadge(currentMatch.status)}
                                </div>
                                <div className="text-sm text-slate-500">
                                    {currentMatch.bracket?.category &&
                                        CATEGORY_LABELS[currentMatch.bracket.category as keyof typeof CATEGORY_LABELS]
                                    } • Match #{currentMatch.match_position}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Archers */}
                        <div className="space-y-3">
                            {/* Archer 1 */}
                            <Card className={`border-2 ${currentMatch.winner_id === currentMatch.archer1_id
                                ? "bg-emerald-50 border-emerald-400"
                                : "border-blue-400 bg-white"
                                }`}>
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center font-bold text-xl text-white">
                                                {currentMatch.archer1_seed || "?"}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 text-lg">
                                                    {currentMatch.archer1?.last_name} {currentMatch.archer1?.first_name}
                                                </p>
                                                <p className="text-sm text-slate-500">
                                                    {currentMatch.archer1?.club || "Sin club"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-4xl font-black text-slate-800">
                                                {currentMatch.archer1_set_points}
                                            </div>
                                            <div className="text-xs text-slate-400">puntos</div>
                                        </div>
                                    </div>
                                    {currentMatch.winner_id === currentMatch.archer1_id && (
                                        <div className="mt-3 flex items-center gap-1 text-emerald-600">
                                            <Trophy className="h-4 w-4" />
                                            <span className="text-sm font-bold">GANADOR</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* VS Divider */}
                            <div className="flex items-center justify-center">
                                <div className="bg-amber-500 text-white font-black text-lg px-5 py-2 rounded-full shadow">
                                    VS
                                </div>
                            </div>

                            {/* Archer 2 */}
                            <Card className={`border-2 ${currentMatch.winner_id === currentMatch.archer2_id
                                ? "bg-emerald-50 border-emerald-400"
                                : "border-red-400 bg-white"
                                }`}>
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center font-bold text-xl text-white">
                                                {currentMatch.archer2_seed || "?"}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 text-lg">
                                                    {currentMatch.archer2?.last_name} {currentMatch.archer2?.first_name}
                                                </p>
                                                <p className="text-sm text-slate-500">
                                                    {currentMatch.archer2?.club || "Sin club"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-4xl font-black text-slate-800">
                                                {currentMatch.archer2_set_points}
                                            </div>
                                            <div className="text-xs text-slate-400">puntos</div>
                                        </div>
                                    </div>
                                    {currentMatch.winner_id === currentMatch.archer2_id && (
                                        <div className="mt-3 flex items-center gap-1 text-emerald-600">
                                            <Trophy className="h-4 w-4" />
                                            <span className="text-sm font-bold">GANADOR</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Action Button */}
                        {currentMatch.status !== "completed" && (
                            <Button
                                onClick={handleStartScoring}
                                className={`w-full h-14 text-lg font-bold ${currentMatch.status === "shootoff" ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-600 hover:bg-blue-700"}`}
                            >
                                <Swords className="h-5 w-5 mr-2" />
                                {currentMatch.status === "shootoff"
                                    ? "SHOOT-OFF"
                                    : currentMatch.status === "pending"
                                        ? "INICIAR PARTIDO"
                                        : "CONTINUAR PARTIDO"}
                            </Button>
                        )}

                        {currentMatch.status === "completed" && (
                            <Card className="border-2 border-emerald-400 bg-emerald-50">
                                <CardContent className="py-4 text-center">
                                    <p className="text-emerald-700 font-bold text-lg">
                                        ✓ Partido Finalizado
                                    </p>
                                    <p className="text-slate-500 text-sm mt-1">
                                        Esperando asignación del siguiente partido...
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </>
                ) : (
                    <Card className="border-2 border-slate-200 shadow-sm">
                        <CardContent className="py-12 text-center">
                            <Users className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-slate-700 mb-2">
                                Sin partido asignado
                            </h3>
                            <p className="text-slate-500">
                                Esta paca no tiene ningún partido de eliminatorias asignado actualmente.
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
