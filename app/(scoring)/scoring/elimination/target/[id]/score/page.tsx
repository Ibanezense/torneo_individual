"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { SET_SYSTEM } from "@/lib/constants/world-archery";

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
        tournament: { elimination_arrows_per_set: number; points_to_win_match: number };
    };
}

interface SetData {
    id: string;
    set_number: number;
    archer1_arrows: number[];
    archer2_arrows: number[];
    archer1_set_result: number | null;
    archer2_set_result: number | null;
    is_confirmed: boolean;
}

const SCORE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export default function EliminationSetScorerPage() {
    const params = useParams();
    const router = useRouter();
    const targetId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [match, setMatch] = useState<MatchData | null>(null);
    const [sets, setSets] = useState<SetData[]>([]);
    const [currentSetNumber, setCurrentSetNumber] = useState(1);

    const [archer1Arrows, setArcher1Arrows] = useState<(number | null)[]>([null, null, null]);
    const [archer2Arrows, setArcher2Arrows] = useState<(number | null)[]>([null, null, null]);
    const [activeArcher, setActiveArcher] = useState<1 | 2>(1);
    const [activeCursor, setActiveCursor] = useState(0);

    useEffect(() => {
        fetchData();
    }, [targetId]);

    const fetchData = async () => {
        setIsLoading(true);

        const { data: matchData, error: matchError } = await supabase
            .from("elimination_matches")
            .select(`
                id, round_number, match_position, archer1_id, archer2_id,
                archer1_seed, archer2_seed, archer1_set_points, archer2_set_points,
                status, winner_id, target_id,
                archer1:archers!elimination_matches_archer1_id_fkey(id, first_name, last_name),
                archer2:archers!elimination_matches_archer2_id_fkey(id, first_name, last_name),
                bracket:elimination_brackets(id, tournament_id, tournament:tournaments(elimination_arrows_per_set, points_to_win_match))
            `)
            .eq("target_id", targetId)
            .neq("status", "completed")
            .single();

        if (matchError || !matchData) {
            toast.error("No hay partido activo en esta paca");
            setIsLoading(false);
            return;
        }

        setMatch(matchData as unknown as MatchData);

        if (matchData.status === "pending") {
            await supabase
                .from("elimination_matches")
                .update({ status: "in_progress" })
                .eq("id", matchData.id);
        }

        const { data: setsData } = await supabase
            .from("sets")
            .select("*")
            .eq("match_id", matchData.id)
            .order("set_number");

        if (setsData) {
            setSets(setsData);
            const confirmedSets = setsData.filter(s => s.is_confirmed);
            const lastConfirmedSet = confirmedSets.length;
            setCurrentSetNumber(lastConfirmedSet + 1);

            // Calculate real points from confirmed sets
            const realArcher1Points = confirmedSets.reduce((sum, s) => sum + (s.archer1_set_result || 0), 0);
            const realArcher2Points = confirmedSets.reduce((sum, s) => sum + (s.archer2_set_result || 0), 0);

            // Update match state with real points (in case DB was out of sync)
            const updatedMatch = {
                ...(matchData as unknown as MatchData),
                archer1_set_points: realArcher1Points,
                archer2_set_points: realArcher2Points,
            };
            setMatch(updatedMatch);

            // Sync database if out of sync
            if (realArcher1Points !== matchData.archer1_set_points || realArcher2Points !== matchData.archer2_set_points) {
                console.log("Syncing match points:", { realArcher1Points, realArcher2Points });
                await supabase
                    .from("elimination_matches")
                    .update({
                        archer1_set_points: realArcher1Points,
                        archer2_set_points: realArcher2Points,
                    })
                    .eq("id", matchData.id);
            }

            const currentSet = setsData.find(s => !s.is_confirmed);
            if (currentSet) {
                setArcher1Arrows(currentSet.archer1_arrows.length > 0 ? currentSet.archer1_arrows : [null, null, null]);
                setArcher2Arrows(currentSet.archer2_arrows.length > 0 ? currentSet.archer2_arrows : [null, null, null]);
            }
        }

        setIsLoading(false);
    };

    const handleKeypadPress = (value: number) => {
        if (activeArcher === 1) {
            const newArrows = [...archer1Arrows];
            newArrows[activeCursor] = value;
            setArcher1Arrows(newArrows);
            if (activeCursor < 2) setActiveCursor(activeCursor + 1);
            else { setActiveArcher(2); setActiveCursor(0); }
        } else {
            const newArrows = [...archer2Arrows];
            newArrows[activeCursor] = value;
            setArcher2Arrows(newArrows);
            if (activeCursor < 2) setActiveCursor(activeCursor + 1);
        }
    };

    const handleCellClick = (archer: 1 | 2, index: number) => {
        setActiveArcher(archer);
        setActiveCursor(index);
    };

    const handleDelete = () => {
        if (activeArcher === 1) {
            const newArrows = [...archer1Arrows];
            newArrows[activeCursor] = null;
            setArcher1Arrows(newArrows);
            if (activeCursor > 0) setActiveCursor(activeCursor - 1);
        } else {
            const newArrows = [...archer2Arrows];
            newArrows[activeCursor] = null;
            setArcher2Arrows(newArrows);
            if (activeCursor > 0) setActiveCursor(activeCursor - 1);
            else { setActiveArcher(1); setActiveCursor(2); }
        }
    };

    const calculateTotal = (arrows: (number | null)[]): number => {
        return arrows.reduce<number>((sum, a) => sum + (a === 11 ? 10 : (a ?? 0)), 0);
    };

    const allArrowsFilled = useCallback(() => {
        return archer1Arrows.every(a => a !== null) && archer2Arrows.every(a => a !== null);
    }, [archer1Arrows, archer2Arrows]);

    const handleConfirmSet = async () => {
        if (!match || !allArrowsFilled()) return;
        setIsSaving(true);

        const archer1Total = calculateTotal(archer1Arrows);
        const archer2Total = calculateTotal(archer2Arrows);

        // Calculate set points
        let archer1Points = 0, archer2Points = 0;
        if (archer1Total > archer2Total) {
            archer1Points = SET_SYSTEM.POINTS_FOR_SET_WIN;
            archer2Points = SET_SYSTEM.POINTS_FOR_SET_LOSS;
        } else if (archer2Total > archer1Total) {
            archer1Points = SET_SYSTEM.POINTS_FOR_SET_LOSS;
            archer2Points = SET_SYSTEM.POINTS_FOR_SET_WIN;
        } else {
            archer1Points = SET_SYSTEM.POINTS_FOR_SET_TIE;
            archer2Points = SET_SYSTEM.POINTS_FOR_SET_TIE;
        }

        try {
            // Insert set (like qualification_scores)
            const { error: setError } = await supabase
                .from("sets")
                .upsert({
                    match_id: match.id,
                    set_number: currentSetNumber,
                    archer1_arrows: archer1Arrows,
                    archer2_arrows: archer2Arrows,
                    archer1_set_result: archer1Points,
                    archer2_set_result: archer2Points,
                    is_confirmed: true,
                    confirmed_at: new Date().toISOString(),
                }, { onConflict: "match_id,set_number" });

            if (setError) throw setError;

            // Update match points
            const newArcher1SetPoints = match.archer1_set_points + archer1Points;
            const newArcher2SetPoints = match.archer2_set_points + archer2Points;

            let newStatus = "in_progress";
            let winnerId: string | null = null;
            const pointsToWin = match.bracket?.tournament?.points_to_win_match || SET_SYSTEM.POINTS_TO_WIN;

            if (newArcher1SetPoints >= pointsToWin) {
                newStatus = "completed";
                winnerId = match.archer1_id;
            } else if (newArcher2SetPoints >= pointsToWin) {
                newStatus = "completed";
                winnerId = match.archer2_id;
            } else if (currentSetNumber >= SET_SYSTEM.MAX_SETS) {
                if (newArcher1SetPoints === newArcher2SetPoints) {
                    newStatus = "shootoff";
                } else {
                    winnerId = newArcher1SetPoints > newArcher2SetPoints ? match.archer1_id : match.archer2_id;
                    newStatus = "completed";
                }
            }

            const { error: matchUpdateError } = await supabase
                .from("elimination_matches")
                .update({
                    archer1_set_points: newArcher1SetPoints,
                    archer2_set_points: newArcher2SetPoints,
                    status: newStatus,
                    winner_id: winnerId,
                })
                .eq("id", match.id);

            if (matchUpdateError) {
                console.error("Error updating match:", matchUpdateError);
                throw new Error("Error actualizando puntos del match: " + matchUpdateError.message);
            }

            console.log("Match updated successfully:", {
                matchId: match.id,
                newArcher1SetPoints,
                newArcher2SetPoints,
                newStatus
            });

            // Advance winner if determined
            if (winnerId) {
                await advanceWinner(match, winnerId);
                toast.success("¡Partido Finalizado!", {
                    description: `Ganador: ${winnerId === match.archer1_id ? match.archer1.last_name : match.archer2.last_name}`,
                });
                router.push(`/scoring/elimination/target/${targetId}`);
            } else if (newStatus === "shootoff") {
                // Redirect to shoot-off page
                toast.info("¡Empate 5-5! Se requiere shoot-off");
                router.push(`/scoring/elimination/target/${targetId}/shootoff`);
            } else {
                toast.success(`Set ${currentSetNumber} confirmado`);
                // Redirect to Target Hub to see overall score
                router.push(`/scoring/elimination/target/${targetId}`);
            }
        } catch (error: any) {
            toast.error("Error", { description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const advanceWinner = async (completedMatch: MatchData, winnerId: string) => {
        const nextMatchPosition = Math.ceil(completedMatch.match_position / 2);
        const nextRound = completedMatch.round_number + 1;
        const loserId = completedMatch.archer1_id === winnerId ? completedMatch.archer2_id : completedMatch.archer1_id;

        console.log("advanceWinner called:", {
            currentRound: completedMatch.round_number,
            currentPosition: completedMatch.match_position,
            nextRound,
            nextMatchPosition,
            bracketId: completedMatch.bracket?.id,
            winnerId,
        });

        // Advance winner to next round
        const { data: nextMatch, error: nextMatchError } = await supabase
            .from("elimination_matches")
            .select("id, archer1_id, archer2_id, target_id")
            .eq("bracket_id", completedMatch.bracket.id)
            .eq("round_number", nextRound)
            .eq("match_position", nextMatchPosition)
            .single();

        console.log("Next match query result:", { nextMatch, error: nextMatchError });

        if (nextMatch) {
            const isOddPosition = completedMatch.match_position % 2 === 1;
            const updateData: Record<string, string> = isOddPosition
                ? { archer1_id: winnerId }
                : { archer2_id: winnerId };

            const otherArcherId = isOddPosition ? nextMatch.archer2_id : nextMatch.archer1_id;
            if (otherArcherId && !nextMatch.target_id) {
                updateData.target_id = completedMatch.target_id;
            }

            console.log("Updating next match:", { nextMatchId: nextMatch.id, updateData });

            const { error: updateError } = await supabase
                .from("elimination_matches")
                .update(updateData)
                .eq("id", nextMatch.id);

            if (updateError) {
                console.error("Error updating next match:", updateError);
            } else {
                console.log("Next match updated successfully");
            }
        } else {
            console.log("No next match found - this might be the final!");
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
            const semifinalRound = totalRounds - 1; // Semifinal is one round before final

            console.log("Semifinal check:", {
                currentRound: completedMatch.round_number,
                semifinalRound,
                bracketSize: bracket.bracket_size
            });

            if (completedMatch.round_number === semifinalRound) {
                // This IS a semifinal! Place loser in bronze match
                const { data: bronzeMatch } = await supabase
                    .from("elimination_matches")
                    .select("id, archer1_id, archer2_id")
                    .eq("bracket_id", completedMatch.bracket.id)
                    .eq("round_number", 0) // Bronze match indicator
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
                    console.log("Loser placed in bronze match:", { loserId, isFirstSemifinal });
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
                    <p className="text-xl text-slate-700">No hay partido activo</p>
                    <Button onClick={handleBack} className="mt-4">Volver</Button>
                </div>
            </div>
        );
    }

    const archer1Total = calculateTotal(archer1Arrows);
    const archer2Total = calculateTotal(archer2Arrows);

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* Header */}
            <div className="bg-[#333333] text-white px-3 py-3">
                <div className="flex items-center justify-between">
                    <Button variant="ghost" size="icon" onClick={handleBack} className="text-white hover:bg-white/20 h-8 w-8">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-amber-400 font-bold text-lg">SET {currentSetNumber}</span>
                    <div className="w-8" />
                </div>
            </div>

            {/* Set Points Summary */}
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

            {/* Scoring Area */}
            <div className="flex-1 p-3 space-y-3">
                {/* Archer 1 Row */}
                <Card className={`border-2 ${activeArcher === 1 ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}>
                    <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
                                    {match.archer1_seed}
                                </div>
                                <span className="font-bold text-slate-800 text-sm">{match.archer1.last_name}</span>
                            </div>
                            <div className="text-xl font-black text-slate-800">{archer1Total}</div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {archer1Arrows.map((score, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleCellClick(1, i)}
                                    className={`h-14 rounded-lg font-bold text-2xl transition-all ${getScoreColor(score)} ${activeArcher === 1 && activeCursor === i ? "ring-2 ring-blue-600 ring-offset-2" : ""}`}
                                >
                                    {displayScore(score)}
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Archer 2 Row */}
                <Card className={`border-2 ${activeArcher === 2 ? "border-red-500 bg-red-50" : "border-slate-200 bg-white"}`}>
                    <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center text-xs font-bold text-white">
                                    {match.archer2_seed}
                                </div>
                                <span className="font-bold text-slate-800 text-sm">{match.archer2.last_name}</span>
                            </div>
                            <div className="text-xl font-black text-slate-800">{archer2Total}</div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {archer2Arrows.map((score, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleCellClick(2, i)}
                                    className={`h-14 rounded-lg font-bold text-2xl transition-all ${getScoreColor(score)} ${activeArcher === 2 && activeCursor === i ? "ring-2 ring-red-600 ring-offset-2" : ""}`}
                                >
                                    {displayScore(score)}
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Set Result Preview */}
                {allArrowsFilled() && (
                    <div className="text-center py-2">
                        <div className="inline-flex items-center gap-4 bg-white rounded-full px-4 py-2 shadow border border-slate-200">
                            <span className={`font-bold ${archer1Total > archer2Total ? "text-emerald-600" : archer1Total < archer2Total ? "text-slate-400" : "text-amber-500"}`}>
                                {archer1Total > archer2Total ? "+2" : archer1Total < archer2Total ? "0" : "+1"}
                            </span>
                            <span className="text-slate-300">|</span>
                            <span className={`font-bold ${archer2Total > archer1Total ? "text-emerald-600" : archer2Total < archer1Total ? "text-slate-400" : "text-amber-500"}`}>
                                {archer2Total > archer1Total ? "+2" : archer2Total < archer1Total ? "0" : "+1"}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Keypad */}
            <div className="bg-white p-3 border-t border-slate-200">
                <div className="grid grid-cols-6 gap-2 mb-2">
                    <button onClick={() => handleKeypadPress(11)} className="h-12 rounded-lg font-bold text-lg bg-yellow-400 text-black">X</button>
                    <button onClick={() => handleKeypadPress(10)} className="h-12 rounded-lg font-bold text-lg bg-yellow-400 text-black">10</button>
                    <button onClick={() => handleKeypadPress(9)} className="h-12 rounded-lg font-bold text-lg bg-yellow-400 text-black">9</button>
                    <button onClick={() => handleKeypadPress(8)} className="h-12 rounded-lg font-bold text-lg bg-red-500 text-white">8</button>
                    <button onClick={() => handleKeypadPress(7)} className="h-12 rounded-lg font-bold text-lg bg-red-500 text-white">7</button>
                    <button onClick={() => handleKeypadPress(6)} className="h-12 rounded-lg font-bold text-lg bg-blue-500 text-white">6</button>
                </div>
                <div className="grid grid-cols-6 gap-2">
                    <button onClick={() => handleKeypadPress(5)} className="h-12 rounded-lg font-bold text-lg bg-blue-500 text-white">5</button>
                    <button onClick={() => handleKeypadPress(4)} className="h-12 rounded-lg font-bold text-lg bg-gray-800 text-white">4</button>
                    <button onClick={() => handleKeypadPress(3)} className="h-12 rounded-lg font-bold text-lg bg-gray-800 text-white">3</button>
                    <button onClick={() => handleKeypadPress(2)} className="h-12 rounded-lg font-bold text-lg bg-slate-100 border-2 border-slate-300 text-slate-700">2</button>
                    <button onClick={() => handleKeypadPress(1)} className="h-12 rounded-lg font-bold text-lg bg-slate-100 border-2 border-slate-300 text-slate-700">1</button>
                    <button onClick={() => handleKeypadPress(0)} className="h-12 rounded-lg font-bold text-lg bg-green-600 text-white">M</button>
                </div>
            </div>

            {/* Actions */}
            <div className="bg-white p-3 flex gap-2 border-t border-slate-200 pb-safe">
                <Button variant="outline" onClick={handleDelete} className="flex-shrink-0 border-slate-300">
                    <RotateCcw className="h-4 w-4" />
                </Button>
                <Button onClick={handleConfirmSet} disabled={!allArrowsFilled() || isSaving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-2" />CONFIRMAR SET</>}
                </Button>
            </div>
        </div>
    );
}
