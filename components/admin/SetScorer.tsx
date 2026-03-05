"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Eraser, Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { SET_SYSTEM } from "@/lib/constants/world-archery";
import { resolvePendingByeAdvances } from "@/lib/utils/elimination-advancement";
import type { EliminationMatchWithArchers, Set as MatchSet } from "@/types/database";

interface SetScorerProps {
    match: EliminationMatchWithArchers;
    onMatchUpdate: (match: EliminationMatchWithArchers) => void;
}

const KEYPAD_COLORS: Record<string, string> = {
    X: "bg-[#FFE55C] text-black border-[#E6CE45]",
    "10": "bg-[#FFE55C] text-black border-[#E6CE45]",
    "9": "bg-[#FFE55C] text-black border-[#E6CE45]",
    "8": "bg-[#FF5C5C] text-white border-[#E64545]",
    "7": "bg-[#FF5C5C] text-white border-[#E64545]",
    "6": "bg-[#5C9DFF] text-white border-[#4589E6]",
    "5": "bg-[#5C9DFF] text-white border-[#4589E6]",
    "4": "bg-slate-900 text-white border-black",
    "3": "bg-slate-900 text-white border-black",
    "2": "bg-slate-200 text-black border-slate-300",
    "1": "bg-slate-200 text-black border-slate-300",
    M: "bg-slate-200 text-slate-500 border-slate-300",
};

const KEYPAD_LAYOUT = [["X", "10", "9"], ["8", "7", "6"], ["5", "4", "3"], ["2", "1", "M"]];

const displayScore = (score: number | null) => {
    if (score === null) return "";
    if (score === 11) return "X";
    if (score === 0) return "M";
    return String(score);
};

const scoreValue = (score: number | null) => (score === null ? 0 : score === 11 ? 10 : score);

const getArrowColor = (score: number | null, active: boolean) => {
    const ring = active ? " ring-2 ring-sky-500 ring-offset-1 scale-[1.02]" : "";
    if (score === null) return `bg-slate-100 text-slate-400 ring-1 ring-slate-200${ring}`;
    if (score === 11 || score === 10 || score === 9) return `bg-yellow-300 text-slate-900${ring}`;
    if (score === 8 || score === 7) return `bg-red-500 text-white${ring}`;
    if (score === 6 || score === 5) return `bg-sky-400 text-white${ring}`;
    if (score === 4 || score === 3) return `bg-slate-700 text-white${ring}`;
    if (score === 2 || score === 1) return `bg-white text-slate-800 ring-1 ring-slate-300${ring}`;
    return `bg-slate-200 text-slate-500${ring}`;
};

const cloneArrows = (values?: number[], size = 3) =>
    Array.from({ length: size }, (_, index) => values?.[index] ?? null);

export function SetScorer({ match, onMatchUpdate }: SetScorerProps) {
    const supabase = createClient();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [sets, setSets] = useState<MatchSet[]>([]);
    const [currentSetNumber, setCurrentSetNumber] = useState(1);
    const [archer1Arrows, setArcher1Arrows] = useState<(number | null)[]>([null, null, null]);
    const [archer2Arrows, setArcher2Arrows] = useState<(number | null)[]>([null, null, null]);
    const [activeArcher, setActiveArcher] = useState<1 | 2>(1);
    const [activeCursor, setActiveCursor] = useState(0);
    const [shootOffWinner, setShootOffWinner] = useState<1 | 2 | null>(null);

    const isShootOff = match.status === "shootoff" || currentSetNumber === 99;
    const isCompleted = match.status === "completed";
    const canEditCompleted = true;
    const arrowSlots = isShootOff ? 1 : 3;

    const confirmedSets = useMemo(
        () =>
            sets
                .filter((setRow) => setRow.is_confirmed && !setRow.is_shootoff)
                .sort((a, b) => a.set_number - b.set_number),
        [sets]
    );

    const shootOffSet = useMemo(
        () => sets.find((setRow) => setRow.is_shootoff || setRow.set_number === 99) || null,
        [sets]
    );

    useEffect(() => {
        let cancelled = false;

        const loadSets = async () => {
            setIsLoading(true);
            const { data, error } = await supabase
                .from("sets")
                .select("*")
                .eq("match_id", match.id)
                .order("set_number");

            if (cancelled) return;
            if (error) {
                toast.error("Error cargando sets");
                setIsLoading(false);
                return;
            }

            const nextSets = (data || []) as MatchSet[];
            const regulationSets = nextSets.filter((setRow) => setRow.is_confirmed && !setRow.is_shootoff);
            const existingShootOff = nextSets.find((setRow) => setRow.is_shootoff || setRow.set_number === 99);

            setSets(nextSets);
            if (match.status === "shootoff") {
                setCurrentSetNumber(99);
                setArcher1Arrows(cloneArrows(existingShootOff?.archer1_arrows, 1));
                setArcher2Arrows(cloneArrows(existingShootOff?.archer2_arrows, 1));
            } else if (match.status === "completed" && canEditCompleted) {
                if (existingShootOff) {
                    setCurrentSetNumber(99);
                    setArcher1Arrows(cloneArrows(existingShootOff.archer1_arrows, 1));
                    setArcher2Arrows(cloneArrows(existingShootOff.archer2_arrows, 1));
                } else if (regulationSets.length > 0) {
                    const lastSet = regulationSets[regulationSets.length - 1];
                    setCurrentSetNumber(lastSet.set_number);
                    setArcher1Arrows(cloneArrows(lastSet.archer1_arrows, 3));
                    setArcher2Arrows(cloneArrows(lastSet.archer2_arrows, 3));
                } else {
                    setCurrentSetNumber(1);
                    setArcher1Arrows([null, null, null]);
                    setArcher2Arrows([null, null, null]);
                }
            } else {
                setCurrentSetNumber(regulationSets.length + 1);
                setArcher1Arrows([null, null, null]);
                setArcher2Arrows([null, null, null]);
            }

            setActiveArcher(1);
            setActiveCursor(0);
            setShootOffWinner(null);
            setIsLoading(false);
        };

        void loadSets();
        return () => {
            cancelled = true;
        };
    }, [canEditCompleted, match.id, match.status, supabase]);

    const handleKeypadPress = (value: number) => {
        if (isCompleted && !canEditCompleted) return;

        const maxIndex = arrowSlots - 1;
        const cellIndex = Math.min(activeCursor, maxIndex);

        if (activeArcher === 1) {
            if (archer1Arrows[cellIndex] !== null) return;
            const next = [...archer1Arrows];
            next[cellIndex] = value;
            setArcher1Arrows(next);
            if (activeCursor < maxIndex) setActiveCursor(activeCursor + 1);
            else {
                setActiveArcher(2);
                setActiveCursor(0);
            }
            return;
        }

        if (archer2Arrows[cellIndex] !== null) return;
        const next = [...archer2Arrows];
        next[cellIndex] = value;
        setArcher2Arrows(next);
        if (activeCursor < maxIndex) setActiveCursor(activeCursor + 1);
    };

    const handleCellClick = (archer: 1 | 2, index: number) => {
        if (isCompleted && !canEditCompleted) return;
        setActiveArcher(archer);
        setActiveCursor(index);
    };

    const handleDelete = () => {
        if (isCompleted && !canEditCompleted) return;

        const deleteFrom = (
            values: (number | null)[],
            setValues: (values: (number | null)[]) => void,
            fallback?: () => void
        ) => {
            const next = [...values];
            let index = Math.min(activeCursor, arrowSlots - 1);
            if (next[index] === null) {
                index =
                    Array.from({ length: arrowSlots }, (_, i) => i)
                        .reverse()
                        .find((i) => next[i] !== null) ?? -1;
            }
            if (index === -1) {
                fallback?.();
                return;
            }
            next[index] = null;
            setValues(next);
            setActiveCursor(Math.max(index - 1, 0));
        };

        if (activeArcher === 2) {
            deleteFrom(archer2Arrows, setArcher2Arrows, () => {
                setActiveArcher(1);
                setActiveCursor(Math.max(arrowSlots - 1, 0));
            });
            return;
        }

        deleteFrom(archer1Arrows, setArcher1Arrows);
    };

    const appendLocalSet = (newSet: MatchSet) => {
        setSets((prev) => [...prev.filter((setRow) => setRow.set_number !== newSet.set_number), newSet].sort((a, b) => a.set_number - b.set_number));
    };

    const advanceWinner = async (completedMatch: EliminationMatchWithArchers, winnerId: string) => {
        const nextMatchPosition = Math.ceil(completedMatch.match_position / 2);
        const nextRound = completedMatch.round_number + 1;
        const loserId = completedMatch.archer1_id === winnerId ? completedMatch.archer2_id : completedMatch.archer1_id;

        const { data: nextMatch } = await supabase
            .from("elimination_matches")
            .select("id, archer1_id, archer2_id, target_id, status, winner_id")
            .eq("bracket_id", completedMatch.bracket_id)
            .eq("round_number", nextRound)
            .eq("match_position", nextMatchPosition)
            .single();

        if (nextMatch) {
            const isOddPosition = completedMatch.match_position % 2 === 1;
            const updateData: Record<string, string | null | number> = isOddPosition ? { archer1_id: winnerId } : { archer2_id: winnerId };
            const otherArcherId = isOddPosition ? nextMatch.archer2_id : nextMatch.archer1_id;
            if (otherArcherId && !nextMatch.target_id && completedMatch.target_id) updateData.target_id = completedMatch.target_id;

            const nextArcher1Id = isOddPosition ? winnerId : nextMatch.archer1_id;
            const nextArcher2Id = isOddPosition ? nextMatch.archer2_id : winnerId;
            if (nextArcher1Id && nextArcher2Id && (nextMatch.status === "completed" || nextMatch.winner_id)) {
                updateData.status = "pending";
                updateData.winner_id = null;
                updateData.archer1_set_points = 0;
                updateData.archer2_set_points = 0;
            }

            await supabase.from("elimination_matches").update(updateData).eq("id", nextMatch.id);
        }

        const { data: bracket } = await supabase
            .from("elimination_brackets")
            .select("bracket_size")
            .eq("id", completedMatch.bracket_id)
            .single();

        if (!bracket) return;

        const semifinalRound = Math.log2(bracket.bracket_size) - 1;
        if (completedMatch.round_number === semifinalRound && loserId) {
            const { data: bronzeMatch } = await supabase
                .from("elimination_matches")
                .select("id")
                .eq("bracket_id", completedMatch.bracket_id)
                .eq("round_number", 0)
                .single();

            if (bronzeMatch) {
                const bronzeUpdate = completedMatch.match_position === 1 ? { archer1_id: loserId } : { archer2_id: loserId };
                await supabase.from("elimination_matches").update(bronzeUpdate).eq("id", bronzeMatch.id);
            }
        }

        await resolvePendingByeAdvances(supabase, completedMatch.bracket_id, bracket.bracket_size);
    };

    const archer1Total = archer1Arrows
        .slice(0, arrowSlots)
        .reduce((sum: number, arrow: number | null) => sum + scoreValue(arrow), 0);
    const archer2Total = archer2Arrows
        .slice(0, arrowSlots)
        .reduce((sum: number, arrow: number | null) => sum + scoreValue(arrow), 0);

    const allArrowsFilled = useMemo(
        () =>
            archer1Arrows.slice(0, arrowSlots).every((arrow) => arrow !== null) &&
            archer2Arrows.slice(0, arrowSlots).every((arrow) => arrow !== null),
        [archer1Arrows, archer2Arrows, arrowSlots]
    );

    const currentSetPreview = useMemo(() => {
        if (!allArrowsFilled) return { left: null, right: null };
        if (isShootOff) {
            if (archer1Total > archer2Total) return { left: 1, right: 0 };
            if (archer2Total > archer1Total) return { left: 0, right: 1 };
            return { left: shootOffWinner === 1 ? 1 : 0, right: shootOffWinner === 2 ? 1 : 0 };
        }
        if (archer1Total > archer2Total) return { left: 2, right: 0 };
        if (archer2Total > archer1Total) return { left: 0, right: 2 };
        return { left: 1, right: 1 };
    }, [allArrowsFilled, archer1Total, archer2Total, isShootOff, shootOffWinner]);

    const isShootOffTie = isShootOff && allArrowsFilled && archer1Total === archer2Total;

    const handleConfirm = async () => {
        if (!allArrowsFilled || (isCompleted && !canEditCompleted)) return;
        setIsSaving(true);

        try {
            if (isShootOff) {
                let winnerId: string | null = null;
                if (archer1Total > archer2Total) winnerId = match.archer1_id;
                else if (archer2Total > archer1Total) winnerId = match.archer2_id;
                else if (shootOffWinner === 1) winnerId = match.archer1_id;
                else if (shootOffWinner === 2) winnerId = match.archer2_id;

                if (!winnerId) {
                    toast.error("Define el ganador del shoot-off");
                    return;
                }

                const newSet: MatchSet = {
                    id: shootOffSet?.id || `shootoff-${match.id}`,
                    match_id: match.id,
                    set_number: 99,
                    archer1_arrows: [archer1Arrows[0] ?? 0],
                    archer2_arrows: [archer2Arrows[0] ?? 0],
                    archer1_set_result: winnerId === match.archer1_id ? 1 : 0,
                    archer2_set_result: winnerId === match.archer2_id ? 1 : 0,
                    is_shootoff: true,
                    shootoff_archer1_distance: null,
                    shootoff_archer2_distance: null,
                    is_confirmed: true,
                    confirmed_at: new Date().toISOString(),
                };

                const previousShootOffLeft = shootOffSet?.archer1_set_result || 0;
                const previousShootOffRight = shootOffSet?.archer2_set_result || 0;
                const nextArcher1Points =
                    match.archer1_set_points - previousShootOffLeft + (winnerId === match.archer1_id ? 1 : 0);
                const nextArcher2Points =
                    match.archer2_set_points - previousShootOffRight + (winnerId === match.archer2_id ? 1 : 0);

                const { error: setError } = await supabase.from("sets").upsert({
                    match_id: match.id,
                    set_number: 99,
                    archer1_arrows: newSet.archer1_arrows,
                    archer2_arrows: newSet.archer2_arrows,
                    archer1_set_result: newSet.archer1_set_result,
                    archer2_set_result: newSet.archer2_set_result,
                    is_confirmed: true,
                    is_shootoff: true,
                    confirmed_at: newSet.confirmed_at,
                }, { onConflict: "match_id,set_number" });

                if (setError) throw setError;

                const { error: matchError } = await supabase
                    .from("elimination_matches")
                    .update({
                        status: "completed",
                        winner_id: winnerId,
                        archer1_set_points: nextArcher1Points,
                        archer2_set_points: nextArcher2Points,
                    })
                    .eq("id", match.id);

                if (matchError) throw matchError;

                await advanceWinner(match, winnerId);
                appendLocalSet(newSet);
                onMatchUpdate({
                    ...match,
                    status: "completed",
                    winner_id: winnerId,
                    winner: winnerId === match.archer1_id ? match.archer1 : match.archer2,
                    archer1_set_points: nextArcher1Points,
                    archer2_set_points: nextArcher2Points,
                });
                toast.success("Shoot-off completado");
                return;
            }

            let archer1Points = 0;
            let archer2Points = 0;
            if (archer1Total > archer2Total) archer1Points = 2;
            else if (archer2Total > archer1Total) archer2Points = 2;
            else {
                archer1Points = 1;
                archer2Points = 1;
            }

            const editedSet = sets.find(
                (setRow) => setRow.set_number === currentSetNumber && !setRow.is_shootoff
            );
            const previousArcher1Points = editedSet?.archer1_set_result || 0;
            const previousArcher2Points = editedSet?.archer2_set_result || 0;
            const nextArcher1Points = match.archer1_set_points - previousArcher1Points + archer1Points;
            const nextArcher2Points = match.archer2_set_points - previousArcher2Points + archer2Points;

            let status: "in_progress" | "shootoff" | "completed" = "in_progress";
            let winnerId: string | null = null;

            if (nextArcher1Points >= SET_SYSTEM.POINTS_TO_WIN) {
                status = "completed";
                winnerId = match.archer1_id;
            } else if (nextArcher2Points >= SET_SYSTEM.POINTS_TO_WIN) {
                status = "completed";
                winnerId = match.archer2_id;
            } else if (currentSetNumber >= SET_SYSTEM.MAX_SETS) {
                if (nextArcher1Points === nextArcher2Points) status = "shootoff";
                else {
                    status = "completed";
                    winnerId = nextArcher1Points > nextArcher2Points ? match.archer1_id : match.archer2_id;
                }
            }

            const newSet: MatchSet = {
                id: `${match.id}-${currentSetNumber}`,
                match_id: match.id,
                set_number: currentSetNumber,
                archer1_arrows: archer1Arrows.slice(0, 3).map((arrow) => arrow ?? 0),
                archer2_arrows: archer2Arrows.slice(0, 3).map((arrow) => arrow ?? 0),
                archer1_set_result: archer1Points,
                archer2_set_result: archer2Points,
                is_shootoff: false,
                shootoff_archer1_distance: null,
                shootoff_archer2_distance: null,
                is_confirmed: true,
                confirmed_at: new Date().toISOString(),
            };

            const { error: setError } = await supabase.from("sets").upsert({
                match_id: match.id,
                set_number: currentSetNumber,
                archer1_arrows: newSet.archer1_arrows,
                archer2_arrows: newSet.archer2_arrows,
                archer1_set_result: archer1Points,
                archer2_set_result: archer2Points,
                is_confirmed: true,
                confirmed_at: newSet.confirmed_at,
            }, { onConflict: "match_id,set_number" });

            if (setError) throw setError;

            const { error: matchError } = await supabase
                .from("elimination_matches")
                .update({
                    archer1_set_points: nextArcher1Points,
                    archer2_set_points: nextArcher2Points,
                    status,
                    winner_id: winnerId,
                })
                .eq("id", match.id);

            if (matchError) throw matchError;

            appendLocalSet(newSet);

            const updatedMatch: EliminationMatchWithArchers = {
                ...match,
                archer1_set_points: nextArcher1Points,
                archer2_set_points: nextArcher2Points,
                status,
                winner_id: winnerId,
                winner: winnerId === match.archer1_id ? match.archer1 : winnerId === match.archer2_id ? match.archer2 : null,
            };

            if (winnerId) {
                await advanceWinner(match, winnerId);
                onMatchUpdate(updatedMatch);
                toast.success("Duelo finalizado");
                return;
            }

            onMatchUpdate(updatedMatch);
            if (status === "shootoff") {
                setCurrentSetNumber(99);
                setArcher1Arrows([null, null, null]);
                setArcher2Arrows([null, null, null]);
                setActiveArcher(1);
                setActiveCursor(0);
                setShootOffWinner(null);
                toast.info("Empate 5-5: registrar shoot-off");
                return;
            }

            setCurrentSetNumber(currentSetNumber + 1);
            setArcher1Arrows([null, null, null]);
            setArcher2Arrows([null, null, null]);
            setActiveArcher(1);
            setActiveCursor(0);
            toast.success(`Set ${currentSetNumber} confirmado`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Error interno";
            toast.error("Error guardando set", { description: message });
        } finally {
            setIsSaving(false);
        }
    };

    const renderArrowGroup = (values: (number | null)[], archer: 1 | 2, interactive: boolean, slots = arrowSlots) => (
        <div className={`flex ${archer === 1 ? "justify-start" : "justify-end"} gap-1`}>
            {Array.from({ length: slots }).map((_, index) => (
                <button
                    key={`${archer}-${index}`}
                    type="button"
                    disabled={!interactive}
                    onClick={() => interactive && handleCellClick(archer, index)}
                    className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-black transition ${getArrowColor(values[index] ?? null, interactive && activeArcher === archer && activeCursor === index)}`}
                >
                    {displayScore(values[index] ?? null)}
                </button>
            ))}
        </div>
    );

    if (isLoading) {
        return (
            <div className="flex min-h-[320px] items-center justify-center rounded-3xl bg-white shadow-md">
                <Loader2 className="h-8 w-8 animate-spin text-[#0f4170]" />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <Card className="border-0 shadow-md">
                <CardContent className="p-0">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-slate-100 bg-white px-4 py-4">
                        <div className="text-center">
                            <div className="text-lg font-black text-slate-900">{match.archer1?.first_name || "-"}</div>
                            <div className="text-xs font-medium text-slate-500">{match.archer1?.last_name || ""}</div>
                            <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Seed #{match.archer1_seed || "?"}</div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-4 py-2 text-center ring-1 ring-slate-200">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-3xl font-black text-emerald-500">{match.archer1_set_points}</div>
                                    <div className="text-[10px] font-bold uppercase text-slate-500">Acum.</div>
                                </div>
                                <div>
                                    <div className="text-3xl font-black text-[#0f4170]">{match.archer2_set_points}</div>
                                    <div className="text-[10px] font-bold uppercase text-slate-500">Acum.</div>
                                </div>
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-lg font-black text-slate-900">{match.archer2?.first_name || "-"}</div>
                            <div className="text-xs font-medium text-slate-500">{match.archer2?.last_name || ""}</div>
                            <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Seed #{match.archer2_seed || "?"}</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2 bg-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        <div className="text-left">Flechas</div>
                        <div className="text-center">Pts</div>
                        <div className="text-center">Set</div>
                        <div className="text-center">Pts</div>
                        <div className="text-right">Flechas</div>
                    </div>

                    <div className="divide-y divide-slate-100">
                        {confirmedSets.map((setRow) => (
                            <div key={setRow.id} className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2 px-3 py-3">
                                {renderArrowGroup(cloneArrows(setRow.archer1_arrows, 3), 1, false, 3)}
                                <div className="text-center text-lg font-black text-slate-700">{setRow.archer1_set_result || 0}</div>
                                <div className="text-center text-xs font-bold uppercase tracking-wide text-slate-400">Set {setRow.set_number}</div>
                                <div className="text-center text-lg font-black text-slate-700">{setRow.archer2_set_result || 0}</div>
                                {renderArrowGroup(cloneArrows(setRow.archer2_arrows, 3), 2, false, 3)}
                            </div>
                        ))}

                        {shootOffSet?.is_confirmed && (
                            <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2 bg-amber-50/60 px-3 py-3">
                                {renderArrowGroup(cloneArrows(shootOffSet.archer1_arrows, 1), 1, false, 1)}
                                <div className="text-center text-lg font-black text-slate-700">{shootOffSet.archer1_set_result || 0}</div>
                                <div className="text-center">
                                    <div className="text-xs font-bold uppercase tracking-wide text-amber-700">Set {confirmedSets.length + 1}</div>
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Shoot-off</div>
                                </div>
                                <div className="text-center text-lg font-black text-slate-700">{shootOffSet.archer2_set_result || 0}</div>
                                {renderArrowGroup(cloneArrows(shootOffSet.archer2_arrows, 1), 2, false, 1)}
                            </div>
                        )}

                        {(!isCompleted || canEditCompleted) && (
                            <div className="space-y-3 bg-sky-50/60 px-3 py-3">
                                <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2">
                                    {renderArrowGroup(archer1Arrows, 1, true, arrowSlots)}
                                    <div className="text-center text-lg font-black text-slate-800">{currentSetPreview.left ?? "-"}</div>
                                    <div className="text-center text-xs font-bold uppercase tracking-wide text-sky-700">
                                        {isShootOff ? "Shoot-off" : `Set ${currentSetNumber}`}
                                    </div>
                                    <div className="text-center text-lg font-black text-slate-800">{currentSetPreview.right ?? "-"}</div>
                                    {renderArrowGroup(archer2Arrows, 2, true, arrowSlots)}
                                </div>

                                {isShootOffTie && (
                                    <div className="rounded-xl bg-white px-3 py-3 ring-1 ring-amber-200">
                                        <div className="mb-2 text-sm font-bold text-amber-700">Empate en el shoot-off. Marca al ganador del duelo.</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                                                <input type="checkbox" checked={shootOffWinner === 1} onChange={() => setShootOffWinner(shootOffWinner === 1 ? null : 1)} />
                                                {match.archer1?.first_name} {match.archer1?.last_name}
                                            </label>
                                            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                                                <input type="checkbox" checked={shootOffWinner === 2} onChange={() => setShootOffWinner(shootOffWinner === 2 ? null : 2)} />
                                                {match.archer2?.first_name} {match.archer2?.last_name}
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {isCompleted && (
                <Card className="border-emerald-200 bg-emerald-50 shadow-md">
                    <CardContent className="py-6 text-center">
                        <div className="mb-3 inline-flex items-center justify-center rounded-full bg-white p-3 shadow-sm">
                            <Trophy className="h-8 w-8 text-yellow-500" />
                        </div>
                        <h3 className="mb-1 text-xl font-black text-emerald-900">Partido finalizado</h3>
                        <p className="font-medium text-emerald-700">Ganador: {match.winner?.first_name} {match.winner?.last_name}</p>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-3 gap-2">
                {KEYPAD_LAYOUT.flat().map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => handleKeypadPress(key === "X" ? 11 : key === "M" ? 0 : parseInt(key, 10))}
                        className={`h-14 rounded-lg border-b-4 text-2xl font-bold shadow-sm transition-transform active:scale-95 ${KEYPAD_COLORS[key]}`}
                    >
                        {key}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <Button onClick={handleDelete} variant="outline" className="h-12 border-slate-300 text-slate-600 hover:bg-slate-100">
                    <Eraser className="mr-2 h-5 w-5" />
                    Borrar Flecha
                </Button>
                <Button
                    onClick={handleConfirm}
                    disabled={!allArrowsFilled || (isShootOffTie && shootOffWinner === null) || isSaving}
                    className="h-12 bg-green-600 text-lg font-bold shadow-md shadow-green-900/20 hover:bg-green-700 disabled:opacity-50"
                >
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-5 w-5" />}
                    {isShootOff ? "Confirmar Shoot-off" : "Confirmar Set"}
                </Button>
            </div>
        </div>
    );
}
