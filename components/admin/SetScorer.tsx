"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, ArrowRight, Save, Loader2, AlertTriangle, Delete } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { EliminationMatchWithArchers, Set as MatchSet } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

interface SetScorerProps {
    match: EliminationMatchWithArchers;
    onMatchUpdate: (match: EliminationMatchWithArchers) => void;
}

export function SetScorer({ match, onMatchUpdate }: SetScorerProps) {
    const supabase = createClient();
    const [isLoading, setIsLoading] = useState(false);
    const [sets, setSets] = useState<MatchSet[]>([]);

    // Scoring state
    const [currentSetNumber, setCurrentSetNumber] = useState(1);
    const [activeArcher, setActiveArcher] = useState<"archer1" | "archer2">("archer1");
    // Arrows for current input only
    const [archer1Arrows, setArcher1Arrows] = useState<(number | null)[]>([null, null, null]);
    const [archer2Arrows, setArcher2Arrows] = useState<(number | null)[]>([null, null, null]);

    // Shootoff state
    const [shootoffArcher1Arrow, setShootoffArcher1Arrow] = useState<number | null>(null);
    const [shootoffArcher2Arrow, setShootoffArcher2Arrow] = useState<number | null>(null);
    const [shootoffArcher1Distance, setShootoffArcher1Distance] = useState("");
    const [shootoffArcher2Distance, setShootoffArcher2Distance] = useState("");
    const [shootoffPhase, setShootoffPhase] = useState<"arrows" | "distance" | "confirm">("arrows");

    const isMatchComplete = match.status === "completed";
    const isShootoff = match.status === "shootoff";

    useEffect(() => {
        fetchSets();
    }, [match.id]);

    const fetchSets = async () => {
        const { data } = await supabase
            .from("sets")
            .select("*")
            .eq("match_id", match.id)
            .order("set_number");

        if (data && data.length > 0) {
            setSets(data);
            const lastSet = data[data.length - 1];
            // If last set is confirmed, prepare next set
            if (lastSet.is_confirmed && match.status !== "completed") {
                setCurrentSetNumber(lastSet.set_number + 1);
                resetInputs();
            } else if (!lastSet.is_confirmed) {
                // If last set is not confirmed, load it
                setCurrentSetNumber(lastSet.set_number);
                // Be careful - arrays from DB might be shorter or longer? 
                // Assuming standard 3 arrows for now.
                const a1 = [...lastSet.archer1_arrows, null, null, null].slice(0, 3);
                const a2 = [...lastSet.archer2_arrows, null, null, null].slice(0, 3);
                setArcher1Arrows(a1);
                setArcher2Arrows(a2);
            }
        } else {
            setCurrentSetNumber(1);
            resetInputs();
        }
    };

    const resetInputs = () => {
        setArcher1Arrows([null, null, null]);
        setArcher2Arrows([null, null, null]);
        setActiveArcher("archer1");
    };

    const handleKeypadClick = (value: number | string) => {
        if (isMatchComplete) return;

        let scoreVal: number;
        if (value === "X") scoreVal = 11;
        else if (value === "M") scoreVal = 0;
        else scoreVal = Number(value);

        if (activeArcher === "archer1") {
            const index = archer1Arrows.findIndex(s => s === null);
            if (index !== -1) {
                const newArrows = [...archer1Arrows];
                newArrows[index] = scoreVal;
                setArcher1Arrows(newArrows);
                // Auto advance if full
                if (index === 2) {
                    setActiveArcher("archer2");
                }
            }
        } else {
            const index = archer2Arrows.findIndex(s => s === null);
            if (index !== -1) {
                const newArrows = [...archer2Arrows];
                newArrows[index] = scoreVal;
                setArcher2Arrows(newArrows);
            }
        }
    };

    const handleDelete = () => {
        if (isMatchComplete) return;

        if (activeArcher === "archer2") {
            const index = [...archer2Arrows].reverse().findIndex(s => s !== null);
            if (index !== -1) {
                const realIndex = 2 - index;
                const newArrows = [...archer2Arrows];
                newArrows[realIndex] = null;
                setArcher2Arrows(newArrows);
                return;
            }
            // If archer 2 empty, go back to archer 1
            if (archer2Arrows.every(s => s === null)) {
                setActiveArcher("archer1");
            }
        }

        if (activeArcher === "archer1") {
            const index = [...archer1Arrows].reverse().findIndex(s => s !== null);
            if (index !== -1) {
                const realIndex = 2 - index;
                const newArrows = [...archer1Arrows];
                newArrows[realIndex] = null;
                setArcher1Arrows(newArrows);
            }
        }
    };

    const calculateSetTotal = (arrows: (number | null)[]) => {
        return arrows.reduce((sum: number, val: number | null) => {
            if (val === null) return sum;
            return sum + (val === 11 ? 10 : val);
        }, 0) || 0;
    };

    const isSetComplete = () => {
        return archer1Arrows.every(a => a !== null) && archer2Arrows.every(a => a !== null);
    };

    const confirmSet = async () => {
        if (!isSetComplete()) return;
        setIsLoading(true);

        const score1 = calculateSetTotal(archer1Arrows);
        const score2 = calculateSetTotal(archer2Arrows);

        let p1 = 0;
        let p2 = 0;

        if (score1 > score2) {
            p1 = 2;
        } else if (score2 > score1) {
            p2 = 2;
        } else {
            p1 = 1;
            p2 = 1;
        }

        try {
            // 1. Save Set
            // Check if set exists to update vs insert
            const existingSet = sets.find(s => s.set_number === currentSetNumber);

            const setPayload = {
                match_id: match.id,
                set_number: currentSetNumber,
                archer1_arrows: archer1Arrows.map(v => v === null ? 0 : v),
                archer2_arrows: archer2Arrows.map(v => v === null ? 0 : v),
                archer1_set_result: p1,
                archer2_set_result: p2,
                is_confirmed: true,
                confirmed_at: new Date().toISOString(),
                is_shootoff: false, // Handle separately if needed
            };

            if (existingSet) {
                await supabase.from("sets").update(setPayload).eq("id", existingSet.id);
            } else {
                await supabase.from("sets").insert(setPayload);
            }

            // 2. Update Match Totals
            const newTotal1 = match.archer1_set_points + p1;
            const newTotal2 = match.archer2_set_points + p2;

            let newStatus = "in_progress";
            let winnerId = null;

            // Check Win Condition (6 points)
            if (newTotal1 >= 6 || newTotal2 >= 6) {
                newStatus = "completed";
                if (newTotal1 > newTotal2) winnerId = match.archer1_id;
                else if (newTotal2 > newTotal1) winnerId = match.archer2_id;
                else {
                    // Tie at 6-6? Usually not possible with sets of 2pts to win 6.
                    // 5-5 -> shootoff.
                    // If 5-5, we go to shootoff.
                }
            } else if (newTotal1 === 5 && newTotal2 === 5) {
                newStatus = "shootoff";
            }

            const { data: updatedMatch, error } = await supabase
                .from("elimination_matches")
                .update({
                    archer1_set_points: newTotal1,
                    archer2_set_points: newTotal2,
                    status: newStatus as any,
                    winner_id: winnerId,
                })
                .eq("id", match.id)
                .select(`
                    *,
                    archer1:archers!elimination_matches_archer1_id_fkey(*),
                    archer2:archers!elimination_matches_archer2_id_fkey(*),
                    winner:archers!elimination_matches_winner_id_fkey(*)
                `)
                .single();

            if (error) throw error;
            if (updatedMatch) {
                onMatchUpdate(updatedMatch);
                await fetchSets();

                // If match is completed, advance winner to next round
                if (newStatus === "completed" && winnerId) {
                    await advanceWinner(match, winnerId);
                    toast.success("Set confirmado - Ganador avanzado");
                } else {
                    toast.success("Set confirmado");
                }
            }
        } catch (error: any) {
            console.error(error);
            toast.error("Error guardando set", { description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    const advanceWinner = async (completedMatch: EliminationMatchWithArchers, winnerId: string) => {
        const nextMatchPosition = Math.ceil(completedMatch.match_position / 2);
        const nextRound = completedMatch.round_number + 1;
        const loserId = completedMatch.archer1_id === winnerId ? completedMatch.archer2_id : completedMatch.archer1_id;

        console.log("advanceWinner called:", {
            currentRound: completedMatch.round_number,
            currentPosition: completedMatch.match_position,
            nextRound,
            nextMatchPosition,
            bracketId: completedMatch.bracket_id,
            winnerId,
        });

        // Advance winner to next round
        const { data: nextMatch, error: nextMatchError } = await supabase
            .from("elimination_matches")
            .select("id, archer1_id, archer2_id, target_id")
            .eq("bracket_id", completedMatch.bracket_id)
            .eq("round_number", nextRound)
            .eq("match_position", nextMatchPosition)
            .single();

        console.log("Next match query result:", { nextMatch, error: nextMatchError });

        if (nextMatch) {
            const isOddPosition = completedMatch.match_position % 2 === 1;
            const updateData: Record<string, string> = isOddPosition
                ? { archer1_id: winnerId }
                : { archer2_id: winnerId };

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
        // First, get bracket_size to determine which round is the semifinal
        const { data: bracket } = await supabase
            .from("elimination_brackets")
            .select("bracket_size")
            .eq("id", completedMatch.bracket_id)
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
                    .eq("bracket_id", completedMatch.bracket_id)
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

    // Shootoff handlers
    const handleShootoffArrowPress = (value: number) => {
        if (activeArcher === "archer1" && shootoffArcher1Arrow === null) {
            setShootoffArcher1Arrow(value);
            setActiveArcher("archer2");
        } else if (activeArcher === "archer2" && shootoffArcher2Arrow === null) {
            setShootoffArcher2Arrow(value);
        }
    };

    const handleShootoffSubmit = async () => {
        if (shootoffArcher1Arrow === null || shootoffArcher2Arrow === null) return;

        const score1 = shootoffArcher1Arrow === 11 ? 10 : shootoffArcher1Arrow;
        const score2 = shootoffArcher2Arrow === 11 ? 10 : shootoffArcher2Arrow;

        if (score1 === score2) {
            // Tied! Need distance measurement
            setShootoffPhase("distance");
            return;
        }

        // We have a winner based on score
        setShootoffPhase("confirm");
    };

    const confirmShootoffWinner = async () => {
        setIsLoading(true);
        try {
            const score1 = shootoffArcher1Arrow === 11 ? 10 : (shootoffArcher1Arrow || 0);
            const score2 = shootoffArcher2Arrow === 11 ? 10 : (shootoffArcher2Arrow || 0);

            let winnerId: string;

            if (score1 !== score2) {
                winnerId = score1 > score2 ? match.archer1_id! : match.archer2_id!;
            } else {
                // Determine by distance (closer wins)
                const dist1 = parseFloat(shootoffArcher1Distance) || 999;
                const dist2 = parseFloat(shootoffArcher2Distance) || 999;
                winnerId = dist1 < dist2 ? match.archer1_id! : match.archer2_id!;
            }

            // Save shootoff set (set_number = 99)
            await supabase.from("sets").insert({
                match_id: match.id,
                set_number: 99,
                archer1_arrows: [shootoffArcher1Arrow || 0],
                archer2_arrows: [shootoffArcher2Arrow || 0],
                archer1_set_result: winnerId === match.archer1_id ? 1 : 0,
                archer2_set_result: winnerId === match.archer2_id ? 1 : 0,
                is_confirmed: true,
                confirmed_at: new Date().toISOString(),
                is_shootoff: true,
            });

            // Update match
            const { data: updatedMatch } = await supabase
                .from("elimination_matches")
                .update({
                    status: "completed",
                    winner_id: winnerId,
                })
                .eq("id", match.id)
                .select(`
                    *,
                    archer1:archers!elimination_matches_archer1_id_fkey(*),
                    archer2:archers!elimination_matches_archer2_id_fkey(*),
                    winner:archers!elimination_matches_winner_id_fkey(*)
                `)
                .single();

            if (updatedMatch) {
                await advanceWinner(updatedMatch as EliminationMatchWithArchers, winnerId);
                onMatchUpdate(updatedMatch as EliminationMatchWithArchers);
                toast.success("¡Shoot-off completado!");
            }
        } catch (error: any) {
            console.error(error);
            toast.error("Error en shoot-off");
        } finally {
            setIsLoading(false);
        }
    };

    const formatValue = (val: number | null) => {
        if (val === null) return "";
        if (val === 11) return "X";
        if (val === 0) return "M";
        return val.toString();
    };

    const getValueColor = (val: number | null) => {
        if (val === null) return "bg-white border-slate-200";
        if (val === 11 || val === 10) return "bg-yellow-100 border-yellow-400 text-yellow-800";
        if (val === 9) return "bg-yellow-50 border-yellow-300 text-yellow-700";
        if (val >= 7) return "bg-red-50 border-red-300 text-red-700";
        if (val >= 5) return "bg-blue-50 border-blue-300 text-blue-700";
        if (val >= 1) return "bg-slate-50 border-slate-300 text-slate-700";
        return "bg-slate-100 border-slate-300 text-slate-500"; // Miss
    };

    return (
        <div className="space-y-4">
            {/* Scoreboard */}
            <Card className="border-2 border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50 border-b border-slate-200 py-2 px-4">
                    <CardTitle className="text-sm font-bold text-slate-500 text-center uppercase tracking-wider">
                        Marcador de Sets
                    </CardTitle>
                </CardHeader>
                <div className="divide-y divide-slate-100">
                    <div className="grid grid-cols-[1fr_auto_1fr] p-3 gap-4 items-center">
                        <div className={`text-center transition-all duration-300 ${activeArcher === 'archer1' && !isMatchComplete ? 'scale-105 transform' : ''}`}>
                            <div className="font-bold text-slate-900 truncate">
                                {match.archer1 ? `${match.archer1.first_name}` : "Bye"}
                            </div>
                            <div className={cn(
                                "text-4xl font-black mt-1",
                                match.archer1_set_points > match.archer2_set_points ? "text-emerald-600" : "text-slate-700"
                            )}>
                                {match.archer1_set_points}
                            </div>
                            {activeArcher === 'archer1' && !isMatchComplete && (
                                <div className="mt-1 inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full animate-pulse">
                                    Disparando
                                </div>
                            )}
                        </div>
                        <div className="text-sm font-bold text-slate-300 uppercase">vs</div>
                        <div className={`text-center transition-all duration-300 ${activeArcher === 'archer2' && !isMatchComplete ? 'scale-105 transform' : ''}`}>
                            <div className="font-bold text-slate-900 truncate">
                                {match.archer2 ? `${match.archer2.first_name}` : "Bye"}
                            </div>
                            <div className={cn(
                                "text-4xl font-black mt-1",
                                match.archer2_set_points > match.archer1_set_points ? "text-emerald-600" : "text-slate-700"
                            )}>
                                {match.archer2_set_points}
                            </div>
                            {activeArcher === 'archer2' && !isMatchComplete && (
                                <div className="mt-1 inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full animate-pulse">
                                    Disparando
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Card>

            {/* Set History Table - Only if there are previous sets */}
            {sets.length > 0 && (
                <div className="overflow-x-auto pb-2">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="text-slate-500 border-b border-slate-200">
                                <th className="p-2 text-left font-medium">Set</th>
                                <th className="p-2 text-center font-medium">{match.archer1?.first_name}</th>
                                <th className="p-2 text-center font-medium">Pts</th>
                                <th className="p-2 text-center font-medium">Pts</th>
                                <th className="p-2 text-center font-medium">{match.archer2?.first_name}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sets.map((set) => {
                                const score1 = set.archer1_arrows.reduce((a, b) => a + (b === 11 ? 10 : b), 0);
                                const score2 = set.archer2_arrows.reduce((a, b) => a + (b === 11 ? 10 : b), 0);
                                return (
                                    <tr key={set.id} className="bg-white">
                                        <td className="p-2 font-bold text-slate-900">#{set.set_number}</td>
                                        <td className="p-2 text-center">
                                            <div className="flex justify-center gap-1">
                                                {set.archer1_arrows.map((v, i) => (
                                                    <span key={i} className="text-xs text-slate-600 font-mono">
                                                        {v === 11 ? 'X' : (v === 0 ? 'M' : v)}
                                                    </span>
                                                ))}
                                                <span className="font-bold ml-1 text-slate-900">({score1})</span>
                                            </div>
                                        </td>
                                        <td className={cn("p-2 text-center font-bold", set.archer1_set_result === 2 ? "text-emerald-600" : "text-slate-400")}>
                                            {set.archer1_set_result}
                                        </td>
                                        <td className={cn("p-2 text-center font-bold", set.archer2_set_result === 2 ? "text-emerald-600" : "text-slate-400")}>
                                            {set.archer2_set_result}
                                        </td>
                                        <td className="p-2 text-center">
                                            <div className="flex justify-center gap-1">
                                                {set.archer2_arrows.map((v, i) => (
                                                    <span key={i} className="text-xs text-slate-600 font-mono">
                                                        {v === 11 ? 'X' : (v === 0 ? 'M' : v)}
                                                    </span>
                                                ))}
                                                <span className="font-bold ml-1 text-slate-900">({score2})</span>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Current Set Input Area */}
            {!isMatchComplete && !isShootoff && (
                <Card className="border-2 border-blue-100 shadow-md">
                    <CardHeader className="bg-blue-50/50 border-b border-blue-100 py-3 px-4 flex flex-row items-center justify-between">
                        <CardTitle className="text-base font-bold text-blue-900">
                            Set {currentSetNumber}
                        </CardTitle>
                        <div className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                            Ingresando: {activeArcher === 'archer1' ? match.archer1?.first_name : match.archer2?.first_name}
                        </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-6">
                        {/* Archer 1 Inputs */}
                        <div
                            className={`space-y-2 transition-opacity ${activeArcher === 'archer2' ? 'opacity-50' : 'opacity-100'}`}
                            onClick={() => setActiveArcher('archer1')}
                        >
                            <label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                                <span>{match.archer1?.first_name}</span>
                                <span className="text-slate-900 font-black text-sm">
                                    Total: {calculateSetTotal(archer1Arrows)}
                                </span>
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {archer1Arrows.map((val, idx) => (
                                    <div
                                        key={`a1-${idx}`}
                                        className={cn(
                                            "h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-black shadow-sm transition-all",
                                            getValueColor(val),
                                            activeArcher === 'archer1' && val === null && archer1Arrows[idx - 1] !== null ? "ring-2 ring-blue-500 ring-offset-2 scale-105" : ""
                                        )}
                                    >
                                        {formatValue(val)}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Archer 2 Inputs */}
                        <div
                            className={`space-y-2 transition-opacity ${activeArcher === 'archer1' ? 'opacity-50' : 'opacity-100'}`}
                            onClick={() => setActiveArcher('archer2')}
                        >
                            <label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                                <span>{match.archer2?.first_name}</span>
                                <span className="text-slate-900 font-black text-sm">
                                    Total: {calculateSetTotal(archer2Arrows)}
                                </span>
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {archer2Arrows.map((val, idx) => (
                                    <div
                                        key={`a2-${idx}`}
                                        className={cn(
                                            "h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-black shadow-sm transition-all",
                                            getValueColor(val),
                                            activeArcher === 'archer2' && val === null && archer2Arrows[idx - 1] !== null ? "ring-2 ring-blue-500 ring-offset-2 scale-105" : ""
                                        )}
                                    >
                                        {formatValue(val)}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Keypad */}
                        <div className="grid grid-cols-4 gap-2 pt-2">
                            {['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M'].map((btn) => (
                                <button
                                    key={btn}
                                    onClick={() => handleKeypadClick(btn)}
                                    className={cn(
                                        "h-12 rounded-lg font-bold text-xl transition-all active:scale-95 shadow-sm border-b-4",
                                        btn === 'X' || btn === '10' ? "bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-200" :
                                            btn === '9' ? "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100" :
                                                btn === 'M' ? "bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300" :
                                                    Number(btn) >= 7 ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" :
                                                        Number(btn) >= 5 ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" :
                                                            "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                                    )}
                                >
                                    {btn}
                                </button>
                            ))}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                className="flex-1 h-12 text-red-600 hover:bg-red-50 border-red-200"
                                onClick={handleDelete}
                            >
                                <Delete className="h-5 w-5 mr-2" />
                                Borrar
                            </Button>
                            <Button
                                className="flex-[2] h-12 text-lg font-bold bg-blue-600 hover:bg-blue-700 shadow-md"
                                onClick={confirmSet}
                                disabled={!isSetComplete() || isLoading}
                            >
                                {isLoading ? <Loader2 className="animate-spin" /> : "Confirmar Set"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Shootoff UI */}
            {isShootoff && (
                <Card className="border-2 border-amber-200 bg-amber-50">
                    <CardHeader className="bg-amber-100 border-b border-amber-200 py-3 px-4">
                        <CardTitle className="text-base font-bold text-amber-900 text-center">
                            ⚡ SHOOT-OFF (5-5)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                        {/* Phase 1: Arrow Input */}
                        {shootoffPhase === "arrows" && (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className={`text-center p-3 rounded-lg ${activeArcher === 'archer1' ? 'bg-blue-100 ring-2 ring-blue-500' : 'bg-slate-100'}`}
                                        onClick={() => setActiveArcher('archer1')}>
                                        <div className="font-bold text-sm">{match.archer1?.first_name}</div>
                                        <div className={cn("text-4xl font-black mt-2", getValueColor(shootoffArcher1Arrow))}>
                                            {shootoffArcher1Arrow === null ? "-" : formatValue(shootoffArcher1Arrow)}
                                        </div>
                                    </div>
                                    <div className={`text-center p-3 rounded-lg ${activeArcher === 'archer2' ? 'bg-red-100 ring-2 ring-red-500' : 'bg-slate-100'}`}
                                        onClick={() => setActiveArcher('archer2')}>
                                        <div className="font-bold text-sm">{match.archer2?.first_name}</div>
                                        <div className={cn("text-4xl font-black mt-2", getValueColor(shootoffArcher2Arrow))}>
                                            {shootoffArcher2Arrow === null ? "-" : formatValue(shootoffArcher2Arrow)}
                                        </div>
                                    </div>
                                </div>

                                {/* Shootoff Keypad */}
                                <div className="grid grid-cols-4 gap-2">
                                    {['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M'].map((btn) => (
                                        <button
                                            key={btn}
                                            onClick={() => handleShootoffArrowPress(btn === 'X' ? 11 : btn === 'M' ? 0 : parseInt(btn))}
                                            className={cn(
                                                "h-12 rounded-lg font-bold text-lg transition-all active:scale-95",
                                                btn === 'X' || btn === '10' ? "bg-yellow-100 text-yellow-800" :
                                                    btn === '9' ? "bg-yellow-50 text-yellow-700" :
                                                        btn === 'M' ? "bg-slate-200 text-slate-600" :
                                                            Number(btn) >= 7 ? "bg-red-50 text-red-700" :
                                                                Number(btn) >= 5 ? "bg-blue-50 text-blue-700" :
                                                                    "bg-white text-slate-700 border border-slate-200"
                                            )}
                                        >
                                            {btn}
                                        </button>
                                    ))}
                                </div>

                                <Button
                                    onClick={handleShootoffSubmit}
                                    disabled={shootoffArcher1Arrow === null || shootoffArcher2Arrow === null}
                                    className="w-full bg-amber-600 hover:bg-amber-700"
                                >
                                    Continuar
                                </Button>
                            </>
                        )}

                        {/* Phase 2: Distance Measurement */}
                        {shootoffPhase === "distance" && (
                            <>
                                <div className="text-center mb-4">
                                    <AlertTriangle className="h-8 w-8 text-amber-600 mx-auto mb-2" />
                                    <p className="font-bold text-amber-900">¡Empate! Medir distancia al centro</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500">{match.archer1?.first_name}</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder="cm"
                                            value={shootoffArcher1Distance}
                                            onChange={(e) => setShootoffArcher1Distance(e.target.value)}
                                            className="w-full p-3 text-center text-xl font-bold border-2 rounded-lg"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500">{match.archer2?.first_name}</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder="cm"
                                            value={shootoffArcher2Distance}
                                            onChange={(e) => setShootoffArcher2Distance(e.target.value)}
                                            className="w-full p-3 text-center text-xl font-bold border-2 rounded-lg"
                                        />
                                    </div>
                                </div>
                                <Button
                                    onClick={() => setShootoffPhase("confirm")}
                                    disabled={!shootoffArcher1Distance || !shootoffArcher2Distance}
                                    className="w-full bg-amber-600 hover:bg-amber-700"
                                >
                                    Confirmar Distancias
                                </Button>
                            </>
                        )}

                        {/* Phase 3: Confirm Winner */}
                        {shootoffPhase === "confirm" && (
                            <>
                                <div className="text-center">
                                    <Trophy className="h-10 w-10 text-yellow-500 mx-auto mb-2" />
                                    <p className="font-bold text-lg mb-1">
                                        Ganador: {
                                            (() => {
                                                const s1 = shootoffArcher1Arrow === 11 ? 10 : (shootoffArcher1Arrow || 0);
                                                const s2 = shootoffArcher2Arrow === 11 ? 10 : (shootoffArcher2Arrow || 0);
                                                if (s1 !== s2) {
                                                    return s1 > s2 ? match.archer1?.first_name : match.archer2?.first_name;
                                                }
                                                const d1 = parseFloat(shootoffArcher1Distance) || 999;
                                                const d2 = parseFloat(shootoffArcher2Distance) || 999;
                                                return d1 < d2 ? match.archer1?.first_name : match.archer2?.first_name;
                                            })()
                                        }
                                    </p>
                                    <p className="text-sm text-slate-600">
                                        {formatValue(shootoffArcher1Arrow)} vs {formatValue(shootoffArcher2Arrow)}
                                        {shootoffArcher1Distance && ` | ${shootoffArcher1Distance}cm vs ${shootoffArcher2Distance}cm`}
                                    </p>
                                </div>
                                <Button
                                    onClick={confirmShootoffWinner}
                                    disabled={isLoading}
                                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                                >
                                    {isLoading ? <Loader2 className="animate-spin" /> : "Confirmar y Avanzar"}
                                </Button>
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {isMatchComplete && (
                <Card className="bg-emerald-50 border-2 border-emerald-200">
                    <CardContent className="p-6 text-center">
                        <div className="inline-flex items-center justify-center p-3 bg-white rounded-full shadow-sm mb-3">
                            <Trophy className="h-8 w-8 text-yellow-500" />
                        </div>
                        <h3 className="text-xl font-black text-emerald-900 mb-1">
                            ¡Partido Finalizado!
                        </h3>
                        <p className="text-emerald-700 font-medium">
                            Ganador: {match.winner?.first_name} {match.winner?.last_name}
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
