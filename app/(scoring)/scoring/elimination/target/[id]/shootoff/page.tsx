"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Trophy, Target, Ruler } from "lucide-react";
import { toast } from "sonner";

interface MatchData {
    id: string;
    round_number: number;
    match_position: number;
    archer1_id: string;
    archer2_id: string;
    archer1_seed: number | null;
    archer2_seed: number | null;
    archer1_set_points: number;
    archer2_set_points: number;
    status: string;
    winner_id: string | null;
    target_id: string;
    archer1: { id: string; first_name: string; last_name: string };
    archer2: { id: string; first_name: string; last_name: string };
    bracket: {
        id: string;
        tournament_id: string;
    };
}

type Phase = "arrows" | "distance" | "complete";

export default function ShootoffPage() {
    const params = useParams();
    const router = useRouter();
    const targetId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [match, setMatch] = useState<MatchData | null>(null);
    const [phase, setPhase] = useState<Phase>("arrows");

    // Arrow scores (single arrow each)
    const [archer1Arrow, setArcher1Arrow] = useState<number | null>(null);
    const [archer2Arrow, setArcher2Arrow] = useState<number | null>(null);
    const [activeArcher, setActiveArcher] = useState<1 | 2>(1);

    // Distance measurement (cm from center)
    const [archer1Distance, setArcher1Distance] = useState<string>("");
    const [archer2Distance, setArcher2Distance] = useState<string>("");

    // Winner
    const [winnerId, setWinnerId] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
    }, [targetId]);

    const fetchData = async () => {
        setIsLoading(true);

        const { data: matchData, error } = await supabase
            .from("elimination_matches")
            .select(`
                id, round_number, match_position, archer1_id, archer2_id,
                archer1_seed, archer2_seed, archer1_set_points, archer2_set_points,
                status, winner_id, target_id,
                archer1:archers!elimination_matches_archer1_id_fkey(id, first_name, last_name),
                archer2:archers!elimination_matches_archer2_id_fkey(id, first_name, last_name),
                bracket:elimination_brackets(id, tournament_id)
            `)
            .eq("target_id", targetId)
            .eq("status", "shootoff")
            .single();

        if (error || !matchData) {
            toast.error("No hay shoot-off activo en esta paca");
            setIsLoading(false);
            return;
        }

        setMatch(matchData as unknown as MatchData);

        // Check if shootoff already has arrow data
        const { data: shootoffSet } = await supabase
            .from("sets")
            .select("*")
            .eq("match_id", matchData.id)
            .eq("set_number", 99)
            .single();

        if (shootoffSet) {
            // Resume shootoff
            if (shootoffSet.archer1_arrows?.length > 0) {
                setArcher1Arrow(shootoffSet.archer1_arrows[0]);
            }
            if (shootoffSet.archer2_arrows?.length > 0) {
                setArcher2Arrow(shootoffSet.archer2_arrows[0]);
            }
        }

        setIsLoading(false);
    };

    const handleArrowPress = (value: number) => {
        if (activeArcher === 1) {
            setArcher1Arrow(value);
            setActiveArcher(2);
        } else {
            setArcher2Arrow(value);
        }
    };

    const handleCompareArrows = async () => {
        if (archer1Arrow === null || archer2Arrow === null || !match) return;
        setIsSaving(true);

        try {
            // Save shootoff arrows
            await supabase
                .from("sets")
                .upsert({
                    match_id: match.id,
                    set_number: 99, // Special shootoff set
                    archer1_arrows: [archer1Arrow],
                    archer2_arrows: [archer2Arrow],
                    is_confirmed: false,
                }, { onConflict: "match_id,set_number" });

            // Compare scores
            const score1 = archer1Arrow === 11 ? 10 : archer1Arrow;
            const score2 = archer2Arrow === 11 ? 10 : archer2Arrow;

            if (score1 > score2) {
                setWinnerId(match.archer1_id);
                setPhase("complete");
            } else if (score2 > score1) {
                setWinnerId(match.archer2_id);
                setPhase("complete");
            } else {
                // Tie - need distance measurement
                setPhase("distance");
                toast.info("Empate - Se requiere medición de distancia al centro");
            }
        } catch (error: any) {
            toast.error("Error", { description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCompareDistance = () => {
        if (!archer1Distance || !archer2Distance || !match) return;

        const dist1 = parseFloat(archer1Distance);
        const dist2 = parseFloat(archer2Distance);

        if (isNaN(dist1) || isNaN(dist2)) {
            toast.error("Ingresa distancias válidas");
            return;
        }

        // Smaller distance wins (closer to center)
        if (dist1 < dist2) {
            setWinnerId(match.archer1_id);
        } else if (dist2 < dist1) {
            setWinnerId(match.archer2_id);
        } else {
            toast.error("Las distancias no pueden ser iguales");
            return;
        }
        setPhase("complete");
    };

    const handleConfirmWinner = async () => {
        if (!winnerId || !match) return;
        setIsSaving(true);

        try {
            // Mark shootoff set as confirmed
            await supabase
                .from("sets")
                .update({ is_confirmed: true, confirmed_at: new Date().toISOString() })
                .eq("match_id", match.id)
                .eq("set_number", 99);

            // Update match with winner
            await supabase
                .from("elimination_matches")
                .update({
                    winner_id: winnerId,
                    status: "completed",
                })
                .eq("id", match.id);

            // Advance winner to next round
            await advanceWinner(match, winnerId);

            toast.success("¡Shoot-off completado!", {
                description: `Ganador: ${winnerId === match.archer1_id ? match.archer1.last_name : match.archer2.last_name}`,
            });

            router.push(`/scoring/elimination/target/${targetId}`);
        } catch (error: any) {
            toast.error("Error", { description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const advanceWinner = async (completedMatch: MatchData, winningArcherId: string) => {
        const nextMatchPosition = Math.ceil(completedMatch.match_position / 2);
        const nextRound = completedMatch.round_number + 1;
        const loserId = completedMatch.archer1_id === winningArcherId ? completedMatch.archer2_id : completedMatch.archer1_id;

        // Advance winner to next round
        const { data: nextMatch } = await supabase
            .from("elimination_matches")
            .select("id, archer1_id, archer2_id, target_id")
            .eq("bracket_id", completedMatch.bracket.id)
            .eq("round_number", nextRound)
            .eq("match_position", nextMatchPosition)
            .single();

        if (nextMatch) {
            const isOddPosition = completedMatch.match_position % 2 === 1;
            const updateData: Record<string, string> = isOddPosition
                ? { archer1_id: winningArcherId }
                : { archer2_id: winningArcherId };

            const otherArcherId = isOddPosition ? nextMatch.archer2_id : nextMatch.archer1_id;
            if (otherArcherId && !nextMatch.target_id) {
                updateData.target_id = completedMatch.target_id;
            }

            await supabase
                .from("elimination_matches")
                .update(updateData)
                .eq("id", nextMatch.id);
        }

        // Check if this is a semifinal - if so, place loser in bronze match
        // Get bracket_size to determine which round is the semifinal
        const { data: bracket } = await supabase
            .from("elimination_brackets")
            .select("bracket_size")
            .eq("id", completedMatch.bracket.id)
            .single();

        if (bracket) {
            const totalRounds = Math.log2(bracket.bracket_size);
            const semifinalRound = totalRounds - 1;

            if (completedMatch.round_number === semifinalRound) {
                const { data: bronzeMatch } = await supabase
                    .from("elimination_matches")
                    .select("id, archer1_id, archer2_id")
                    .eq("bracket_id", completedMatch.bracket.id)
                    .eq("round_number", 0)
                    .single();

                if (bronzeMatch) {
                    const isFirstSemifinal = completedMatch.match_position === 1;
                    const bronzeUpdate = isFirstSemifinal
                        ? { archer1_id: loserId }
                        : { archer2_id: loserId };

                    await supabase
                        .from("elimination_matches")
                        .update(bronzeUpdate)
                        .eq("id", bronzeMatch.id);
                }
            }
        }
    };

    const handleBack = () => router.push(`/scoring/elimination/target/${targetId}`);

    const getScoreColor = (score: number | null): string => {
        if (score === null) return "bg-slate-200 text-slate-400";
        if (score === 11 || score === 10 || score === 9) return "bg-yellow-400 text-black";
        if (score === 8 || score === 7) return "bg-red-500 text-white";
        if (score === 6 || score === 5) return "bg-blue-500 text-white";
        if (score === 4 || score === 3) return "bg-gray-800 text-white";
        if (score === 2 || score === 1) return "bg-white border-2 border-slate-300 text-black";
        return "bg-green-600 text-white";
    };

    const displayScore = (score: number | null): string => {
        if (score === null) return "-";
        if (score === 11) return "X";
        if (score === 0) return "M";
        return String(score);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            </div>
        );
    }

    if (!match) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-xl text-slate-700">No hay shoot-off activo</p>
                    <Button onClick={handleBack} className="mt-4">Volver</Button>
                </div>
            </div>
        );
    }

    const getWinnerName = () => {
        if (!winnerId || !match) return "";
        return winnerId === match.archer1_id
            ? `${match.archer1.first_name} ${match.archer1.last_name}`
            : `${match.archer2.first_name} ${match.archer2.last_name}`;
    };

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* Header */}
            <div className="bg-amber-500 text-white px-3 py-3">
                <div className="flex items-center justify-between">
                    <Button variant="ghost" size="icon" onClick={handleBack} className="text-white hover:bg-white/20 h-8 w-8">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        <span className="font-bold text-lg">SHOOT-OFF</span>
                    </div>
                    <div className="w-8" />
                </div>
            </div>

            {/* Marcador 5-5 */}
            <div className="bg-white px-4 py-3 flex justify-center gap-8 border-b border-slate-200 shadow-sm">
                <div className="text-center">
                    <div className="text-3xl font-black text-blue-600">{match.archer1_set_points}</div>
                    <div className="text-xs text-slate-500 font-medium">{match.archer1.last_name}</div>
                </div>
                <div className="text-slate-300 text-2xl font-bold self-center">-</div>
                <div className="text-center">
                    <div className="text-3xl font-black text-red-600">{match.archer2_set_points}</div>
                    <div className="text-xs text-slate-500 font-medium">{match.archer2.last_name}</div>
                </div>
            </div>

            {/* Content based on phase */}
            <div className="flex-1 p-4">
                {phase === "arrows" && (
                    <div className="space-y-4">
                        <div className="text-center mb-4">
                            <p className="text-slate-600 text-sm">Cada arquero dispara 1 flecha</p>
                        </div>

                        {/* Archer 1 Arrow */}
                        <Card className={`border-2 ${activeArcher === 1 ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-lg font-bold text-white">
                                            {match.archer1_seed}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-800">{match.archer1.last_name}</div>
                                            <div className="text-xs text-slate-500">{match.archer1.first_name}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setActiveArcher(1)}
                                        className={`w-16 h-16 rounded-xl font-bold text-3xl transition-all ${getScoreColor(archer1Arrow)} ${activeArcher === 1 ? "ring-2 ring-blue-600 ring-offset-2" : ""}`}
                                    >
                                        {displayScore(archer1Arrow)}
                                    </button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Archer 2 Arrow */}
                        <Card className={`border-2 ${activeArcher === 2 ? "border-red-500 bg-red-50" : "border-slate-200"}`}>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-lg font-bold text-white">
                                            {match.archer2_seed}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-800">{match.archer2.last_name}</div>
                                            <div className="text-xs text-slate-500">{match.archer2.first_name}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setActiveArcher(2)}
                                        className={`w-16 h-16 rounded-xl font-bold text-3xl transition-all ${getScoreColor(archer2Arrow)} ${activeArcher === 2 ? "ring-2 ring-red-600 ring-offset-2" : ""}`}
                                    >
                                        {displayScore(archer2Arrow)}
                                    </button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {phase === "distance" && (
                    <Card className="border-2 border-amber-400 bg-amber-50">
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-amber-700">
                                <Ruler className="h-5 w-5" />
                                Medición de Distancia
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-slate-600">
                                Ambos arqueros anotaron <strong>{displayScore(archer1Arrow)}</strong>.
                                Ingresa la distancia al centro de cada flecha (en cm).
                            </p>

                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white">
                                        {match.archer1_seed}
                                    </div>
                                    <span className="font-medium flex-1">{match.archer1.last_name}</span>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        placeholder="cm"
                                        value={archer1Distance}
                                        onChange={(e) => setArcher1Distance(e.target.value)}
                                        className="w-24 text-center text-lg font-bold"
                                    />
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center font-bold text-white">
                                        {match.archer2_seed}
                                    </div>
                                    <span className="font-medium flex-1">{match.archer2.last_name}</span>
                                    <Input
                                        type="number"
                                        step="0.1"
                                        placeholder="cm"
                                        value={archer2Distance}
                                        onChange={(e) => setArcher2Distance(e.target.value)}
                                        className="w-24 text-center text-lg font-bold"
                                    />
                                </div>
                            </div>

                            <Button
                                onClick={handleCompareDistance}
                                disabled={!archer1Distance || !archer2Distance}
                                className="w-full bg-amber-600 hover:bg-amber-700"
                            >
                                Comparar Distancias
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {phase === "complete" && (
                    <Card className="border-2 border-emerald-400 bg-emerald-50">
                        <CardContent className="p-6 text-center">
                            <Trophy className="h-16 w-16 mx-auto text-amber-500 mb-4" />
                            <h2 className="text-2xl font-black text-emerald-700 mb-2">¡GANADOR!</h2>
                            <p className="text-xl font-bold text-slate-800 mb-6">{getWinnerName()}</p>

                            <div className="flex gap-2 justify-center mb-4">
                                <div className={`px-4 py-2 rounded-lg font-bold ${winnerId === match.archer1_id ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"}`}>
                                    {displayScore(archer1Arrow)}
                                </div>
                                <div className="text-slate-400 self-center">vs</div>
                                <div className={`px-4 py-2 rounded-lg font-bold ${winnerId === match.archer2_id ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"}`}>
                                    {displayScore(archer2Arrow)}
                                </div>
                            </div>

                            {archer1Distance && archer2Distance && (
                                <p className="text-sm text-slate-500 mb-4">
                                    Distancia: {archer1Distance}cm vs {archer2Distance}cm
                                </p>
                            )}

                            <Button
                                onClick={handleConfirmWinner}
                                disabled={isSaving}
                                className="w-full bg-emerald-600 hover:bg-emerald-700"
                            >
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar y Avanzar"}
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Keypad for arrows phase */}
            {phase === "arrows" && (
                <>
                    <div className="bg-white p-3 border-t border-slate-200">
                        <div className="grid grid-cols-6 gap-2 mb-2">
                            <button onClick={() => handleArrowPress(11)} className="h-12 rounded-lg font-bold text-lg bg-yellow-400 text-black">X</button>
                            <button onClick={() => handleArrowPress(10)} className="h-12 rounded-lg font-bold text-lg bg-yellow-400 text-black">10</button>
                            <button onClick={() => handleArrowPress(9)} className="h-12 rounded-lg font-bold text-lg bg-yellow-400 text-black">9</button>
                            <button onClick={() => handleArrowPress(8)} className="h-12 rounded-lg font-bold text-lg bg-red-500 text-white">8</button>
                            <button onClick={() => handleArrowPress(7)} className="h-12 rounded-lg font-bold text-lg bg-red-500 text-white">7</button>
                            <button onClick={() => handleArrowPress(6)} className="h-12 rounded-lg font-bold text-lg bg-blue-500 text-white">6</button>
                        </div>
                        <div className="grid grid-cols-6 gap-2">
                            <button onClick={() => handleArrowPress(5)} className="h-12 rounded-lg font-bold text-lg bg-blue-500 text-white">5</button>
                            <button onClick={() => handleArrowPress(4)} className="h-12 rounded-lg font-bold text-lg bg-gray-800 text-white">4</button>
                            <button onClick={() => handleArrowPress(3)} className="h-12 rounded-lg font-bold text-lg bg-gray-800 text-white">3</button>
                            <button onClick={() => handleArrowPress(2)} className="h-12 rounded-lg font-bold text-lg bg-slate-100 border-2 border-slate-300 text-slate-700">2</button>
                            <button onClick={() => handleArrowPress(1)} className="h-12 rounded-lg font-bold text-lg bg-slate-100 border-2 border-slate-300 text-slate-700">1</button>
                            <button onClick={() => handleArrowPress(0)} className="h-12 rounded-lg font-bold text-lg bg-green-600 text-white">M</button>
                        </div>
                    </div>

                    <div className="bg-white p-3 border-t border-slate-200 pb-safe">
                        <Button
                            onClick={handleCompareArrows}
                            disabled={archer1Arrow === null || archer2Arrow === null || isSaving}
                            className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Comparar Flechas"}
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}
