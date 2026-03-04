"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Check, Eraser, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { SET_SYSTEM } from "@/lib/constants/world-archery";
import { resolvePendingByeAdvances } from "@/lib/utils/elimination-advancement";

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
    bracket: { id: string; tournament_id: string; tournament: { elimination_arrows_per_set: number; points_to_win_match: number } };
}

interface SetData {
    id: string;
    set_number: number;
    archer1_arrows: number[];
    archer2_arrows: number[];
    archer1_set_result: number | null;
    archer2_set_result: number | null;
    is_confirmed: boolean;
    is_shootoff?: boolean | null;
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

const scoreValue = (score: number | null) => {
    if (score === null) return 0;
    return score === 11 ? 10 : score;
};

const getArrowColor = (score: number | null, active: boolean) => {
    const activeRing = active ? " ring-2 ring-sky-500 ring-offset-1 scale-[1.02]" : "";
    if (score === null) return `bg-slate-100 text-slate-400 ring-1 ring-slate-200${activeRing}`;
    if (score === 11 || score === 10 || score === 9) return `bg-yellow-300 text-slate-900${activeRing}`;
    if (score === 8 || score === 7) return `bg-red-500 text-white${activeRing}`;
    if (score === 6 || score === 5) return `bg-sky-400 text-white${activeRing}`;
    if (score === 4 || score === 3) return `bg-slate-700 text-white${activeRing}`;
    if (score === 2 || score === 1) return `bg-white text-slate-800 ring-1 ring-slate-300${activeRing}`;
    return `bg-slate-200 text-slate-500${activeRing}`;
};

const cloneArrows = (values?: number[], size = 3) => Array.from({ length: size }, (_, index) => values?.[index] ?? null);

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
    const [shootOffWinner, setShootOffWinner] = useState<1 | 2 | null>(null);

    const isShootOff = match?.status === "shootoff";
    const arrowSlots = isShootOff ? 1 : 3;

    const confirmedSets = useMemo(
        () => sets.filter((setRow) => setRow.is_confirmed && !setRow.is_shootoff).sort((a, b) => a.set_number - b.set_number),
        [sets]
    );

    const shootOffSet = useMemo(
        () => sets.find((setRow) => setRow.is_shootoff || setRow.set_number === 99) || null,
        [sets]
    );

    const fetchData = useCallback(async () => {
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

        if (matchData.status === "pending") {
            await supabase.from("elimination_matches").update({ status: "in_progress" }).eq("id", matchData.id);
            matchData.status = "in_progress";
        }

        const { data: setsData } = await supabase.from("sets").select("*").eq("match_id", matchData.id).order("set_number");
        const nextSets = (setsData || []) as SetData[];
        const confirmedRegulationSets = nextSets.filter((setRow) => setRow.is_confirmed && !setRow.is_shootoff);
        const realArcher1Points = confirmedRegulationSets.reduce((sum, setRow) => sum + (setRow.archer1_set_result || 0), 0);
        const realArcher2Points = confirmedRegulationSets.reduce((sum, setRow) => sum + (setRow.archer2_set_result || 0), 0);

        setSets(nextSets);
        setMatch({ ...(matchData as unknown as MatchData), archer1_set_points: realArcher1Points, archer2_set_points: realArcher2Points });

        if (matchData.status === "shootoff") {
            const currentShootOff = nextSets.find((setRow) => setRow.is_shootoff || setRow.set_number === 99);
            setCurrentSetNumber(99);
            setArcher1Arrows(cloneArrows(currentShootOff?.archer1_arrows, 1));
            setArcher2Arrows(cloneArrows(currentShootOff?.archer2_arrows, 1));
        } else {
            setCurrentSetNumber(confirmedRegulationSets.length + 1);
            setArcher1Arrows([null, null, null]);
            setArcher2Arrows([null, null, null]);
        }

        setActiveArcher(1);
        setActiveCursor(0);
        setShootOffWinner(null);
        setIsLoading(false);
    }, [supabase, targetId]);

    useEffect(() => {
        const timer = setTimeout(() => {
            void fetchData();
        }, 0);
        return () => clearTimeout(timer);
    }, [fetchData]);

    const handleKeypadPress = (value: number) => {
        const maxIndex = arrowSlots - 1;
        if (activeArcher === 1) {
            if (archer1Arrows[Math.min(activeCursor, maxIndex)] !== null) return;
            const next = [...archer1Arrows];
            next[Math.min(activeCursor, maxIndex)] = value;
            setArcher1Arrows(next);
            if (activeCursor < maxIndex) setActiveCursor(activeCursor + 1);
            else {
                setActiveArcher(2);
                setActiveCursor(0);
            }
            return;
        }

        if (archer2Arrows[Math.min(activeCursor, maxIndex)] !== null) return;
        const next = [...archer2Arrows];
        next[Math.min(activeCursor, maxIndex)] = value;
        setArcher2Arrows(next);
        if (activeCursor < maxIndex) setActiveCursor(activeCursor + 1);
    };

    const handleCellClick = (archer: 1 | 2, index: number) => {
        setActiveArcher(archer);
        setActiveCursor(index);
    };

    const handleDelete = () => {
        const deleteFrom = (
            values: (number | null)[],
            setValues: (values: (number | null)[]) => void,
            fallback?: () => void
        ) => {
            const next = [...values];
            let index = Math.min(activeCursor, arrowSlots - 1);
            if (next[index] === null) {
                index = Array.from({ length: arrowSlots }, (_, i) => i).reverse().find((i) => next[i] !== null) ?? -1;
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

    const appendLocalSet = (newSet: SetData) => {
        setSets((prev) => {
            const remaining = prev.filter((setRow) => setRow.set_number !== newSet.set_number);
            return [...remaining, newSet].sort((a, b) => a.set_number - b.set_number);
        });
    };

    const advanceWinner = async (completedMatch: MatchData, winnerId: string) => {
        const nextMatchPosition = Math.ceil(completedMatch.match_position / 2);
        const nextRound = completedMatch.round_number + 1;
        const loserId = completedMatch.archer1_id === winnerId ? completedMatch.archer2_id : completedMatch.archer1_id;

        const { data: nextMatch } = await supabase
            .from("elimination_matches")
            .select("id, archer1_id, archer2_id, target_id")
            .eq("bracket_id", completedMatch.bracket.id)
            .eq("round_number", nextRound)
            .eq("match_position", nextMatchPosition)
            .single();

        if (nextMatch) {
            const isOddPosition = completedMatch.match_position % 2 === 1;
            const updateData: Record<string, string> = isOddPosition ? { archer1_id: winnerId } : { archer2_id: winnerId };
            const otherArcherId = isOddPosition ? nextMatch.archer2_id : nextMatch.archer1_id;
            if (otherArcherId && !nextMatch.target_id) updateData.target_id = completedMatch.target_id;
            await supabase.from("elimination_matches").update(updateData).eq("id", nextMatch.id);
        }

        const { data: bracket } = await supabase
            .from("elimination_brackets")
            .select("bracket_size")
            .eq("id", completedMatch.bracket.id)
            .single();

        if (!bracket) return;

        const semifinalRound = Math.log2(bracket.bracket_size) - 1;
        if (completedMatch.round_number === semifinalRound && loserId) {
            const { data: bronzeMatch } = await supabase
                .from("elimination_matches")
                .select("id")
                .eq("bracket_id", completedMatch.bracket.id)
                .eq("round_number", 0)
                .single();

            if (bronzeMatch) {
                const bronzeUpdate = completedMatch.match_position === 1 ? { archer1_id: loserId } : { archer2_id: loserId };
                await supabase.from("elimination_matches").update(bronzeUpdate).eq("id", bronzeMatch.id);
            }
        }

        await resolvePendingByeAdvances(supabase, completedMatch.bracket.id, bracket.bracket_size);
    };

    const handleConfirm = async () => {
        if (!match || !allArrowsFilled) return;
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
                    setIsSaving(false);
                    return;
                }

                const newSet: SetData = {
                    id: shootOffSet?.id || `shootoff-${match.id}`,
                    set_number: 99,
                    archer1_arrows: [archer1Arrows[0] ?? 0],
                    archer2_arrows: [archer2Arrows[0] ?? 0],
                    archer1_set_result: winnerId === match.archer1_id ? 1 : 0,
                    archer2_set_result: winnerId === match.archer2_id ? 1 : 0,
                    is_confirmed: true,
                    is_shootoff: true,
                };

                const newArcher1SetPoints = match.archer1_set_points + (winnerId === match.archer1_id ? 1 : 0);
                const newArcher2SetPoints = match.archer2_set_points + (winnerId === match.archer2_id ? 1 : 0);

                const { error: setError } = await supabase.from("sets").upsert({
                    match_id: match.id,
                    set_number: 99,
                    archer1_arrows: newSet.archer1_arrows,
                    archer2_arrows: newSet.archer2_arrows,
                    archer1_set_result: newSet.archer1_set_result,
                    archer2_set_result: newSet.archer2_set_result,
                    is_confirmed: true,
                    is_shootoff: true,
                    confirmed_at: new Date().toISOString(),
                }, { onConflict: "match_id,set_number" });

                if (setError) throw setError;

                const { error: matchError } = await supabase
                    .from("elimination_matches")
                    .update({
                        status: "completed",
                        winner_id: winnerId,
                        archer1_set_points: newArcher1SetPoints,
                        archer2_set_points: newArcher2SetPoints,
                    })
                    .eq("id", match.id);

                if (matchError) throw matchError;

                await advanceWinner(match, winnerId);
                appendLocalSet(newSet);
                setMatch({
                    ...match,
                    status: "completed",
                    winner_id: winnerId,
                    archer1_set_points: newArcher1SetPoints,
                    archer2_set_points: newArcher2SetPoints,
                });
                toast.success("Shoot-off completado");
                setIsSaving(false);
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

            const newArcher1SetPoints = match.archer1_set_points + archer1Points;
            const newArcher2SetPoints = match.archer2_set_points + archer2Points;
            const pointsToWin = match.bracket?.tournament?.points_to_win_match || SET_SYSTEM.POINTS_TO_WIN;

            let newStatus = "in_progress";
            let winnerId: string | null = null;

            if (newArcher1SetPoints >= pointsToWin) {
                newStatus = "completed";
                winnerId = match.archer1_id;
            } else if (newArcher2SetPoints >= pointsToWin) {
                newStatus = "completed";
                winnerId = match.archer2_id;
            } else if (currentSetNumber >= SET_SYSTEM.MAX_SETS) {
                if (newArcher1SetPoints === newArcher2SetPoints) newStatus = "shootoff";
                else {
                    newStatus = "completed";
                    winnerId = newArcher1SetPoints > newArcher2SetPoints ? match.archer1_id : match.archer2_id;
                }
            }

            const newSet: SetData = {
                id: `${match.id}-${currentSetNumber}`,
                set_number: currentSetNumber,
                archer1_arrows: archer1Arrows.slice(0, 3).map((arrow) => arrow ?? 0),
                archer2_arrows: archer2Arrows.slice(0, 3).map((arrow) => arrow ?? 0),
                archer1_set_result: archer1Points,
                archer2_set_result: archer2Points,
                is_confirmed: true,
            };

            const { error: setError } = await supabase.from("sets").upsert({
                match_id: match.id,
                set_number: currentSetNumber,
                archer1_arrows: newSet.archer1_arrows,
                archer2_arrows: newSet.archer2_arrows,
                archer1_set_result: archer1Points,
                archer2_set_result: archer2Points,
                is_confirmed: true,
                confirmed_at: new Date().toISOString(),
            }, { onConflict: "match_id,set_number" });

            if (setError) throw setError;

            const { error: matchUpdateError } = await supabase
                .from("elimination_matches")
                .update({
                    archer1_set_points: newArcher1SetPoints,
                    archer2_set_points: newArcher2SetPoints,
                    status: newStatus,
                    winner_id: winnerId,
                })
                .eq("id", match.id);

            if (matchUpdateError) throw matchUpdateError;

            appendLocalSet(newSet);

            if (winnerId) {
                await advanceWinner(match, winnerId);
                setMatch({
                    ...match,
                    archer1_set_points: newArcher1SetPoints,
                    archer2_set_points: newArcher2SetPoints,
                    status: "completed",
                    winner_id: winnerId,
                });
                toast.success("Duelo finalizado");
                setIsSaving(false);
                return;
            }

            if (newStatus === "shootoff") {
                setMatch({
                    ...match,
                    archer1_set_points: newArcher1SetPoints,
                    archer2_set_points: newArcher2SetPoints,
                    status: "shootoff",
                });
                setCurrentSetNumber(99);
                setArcher1Arrows([null, null, null]);
                setArcher2Arrows([null, null, null]);
                setActiveArcher(1);
                setActiveCursor(0);
                setShootOffWinner(null);
                toast.info("Empate 5-5: registrar shoot-off");
                setIsSaving(false);
                return;
            }

            setMatch({
                ...match,
                archer1_set_points: newArcher1SetPoints,
                archer2_set_points: newArcher2SetPoints,
                status: "in_progress",
            });
            setCurrentSetNumber(currentSetNumber + 1);
            setArcher1Arrows([null, null, null]);
            setArcher2Arrows([null, null, null]);
            setActiveArcher(1);
            setActiveCursor(0);
            toast.success(`Set ${currentSetNumber} confirmado`);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Error interno";
            toast.error("Error", { description: message });
        } finally {
            setIsSaving(false);
        }
    };

    const handleBack = () => router.push(`/scoring/elimination/target/${targetId}`);

    if (isLoading) {
        return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-blue-700" /></div>;
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

    return (
        <div className="min-h-screen bg-[#eef2f7] flex flex-col">
            <div className="sticky top-0 z-20 bg-[#0f4170] text-white shadow-lg">
                <div className="mx-auto max-w-md px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                        <button onClick={handleBack} className="inline-flex items-center gap-2 text-white/90 hover:text-white">
                            <ArrowLeft className="h-4 w-4" />
                            Volver al duelo
                        </button>
                        <div className="inline-flex items-center gap-1 text-emerald-200">
                            <Radio className="h-3.5 w-3.5" />
                            Guardado en linea
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 px-3 py-3">
                <Card className="border-0 shadow-md">
                    <CardContent className="p-0">
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-slate-100 bg-white px-4 py-4">
                            <div className="text-center">
                                <div className="text-lg font-black text-slate-900">{match.archer1.first_name}</div>
                                <div className="text-xs font-medium text-slate-500">{match.archer1.last_name}</div>
                                <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Seed #{match.archer1_seed || "?"}</div>
                            </div>
                            <div className="rounded-2xl bg-slate-50 px-4 py-2 text-center ring-1 ring-slate-200">
                                <div className="grid grid-cols-2 gap-4">
                                    <div><div className="text-3xl font-black text-emerald-500">{match.archer1_set_points}</div><div className="text-[10px] font-bold uppercase text-slate-500">Acum.</div></div>
                                    <div><div className="text-3xl font-black text-[#0f4170]">{match.archer2_set_points}</div><div className="text-[10px] font-bold uppercase text-slate-500">Acum.</div></div>
                                </div>
                            </div>
                            <div className="text-center">
                                <div className="text-lg font-black text-slate-900">{match.archer2.first_name}</div>
                                <div className="text-xs font-medium text-slate-500">{match.archer2.last_name}</div>
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
                                <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2 px-3 py-3 bg-amber-50/60">
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

                            {match.status !== "completed" && (
                                <div className="space-y-3 px-3 py-3 bg-sky-50/60">
                                    <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2">
                                        {renderArrowGroup(archer1Arrows, 1, true, arrowSlots)}
                                        <div className="text-center text-lg font-black text-slate-800">{currentSetPreview.left ?? "-"}</div>
                                        <div className="text-center text-xs font-bold uppercase tracking-wide text-sky-700">{isShootOff ? "Shoot-off" : `Set ${currentSetNumber}`}</div>
                                        <div className="text-center text-lg font-black text-slate-800">{currentSetPreview.right ?? "-"}</div>
                                        {renderArrowGroup(archer2Arrows, 2, true, arrowSlots)}
                                    </div>

                                    {isShootOffTie && (
                                        <div className="rounded-xl bg-white px-3 py-3 ring-1 ring-amber-200">
                                            <div className="mb-2 text-sm font-bold text-amber-700">Empate en el shoot-off. Marca al ganador del duelo.</div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                                                    <input type="checkbox" checked={shootOffWinner === 1} onChange={() => setShootOffWinner(shootOffWinner === 1 ? null : 1)} />
                                                    {match.archer1.first_name} {match.archer1.last_name}
                                                </label>
                                                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
                                                    <input type="checkbox" checked={shootOffWinner === 2} onChange={() => setShootOffWinner(shootOffWinner === 2 ? null : 2)} />
                                                    {match.archer2.first_name} {match.archer2.last_name}
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {match.status !== "completed" && (
                <div className="bg-white border-t border-slate-200">
                    <div className="p-2 pb-safe">
                        <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
                            {KEYPAD_LAYOUT.flat().map((key) => (
                                <button key={key} onClick={() => handleKeypadPress(key === "X" ? 11 : key === "M" ? 0 : parseInt(key, 10))} className={`h-14 rounded-lg text-2xl font-bold shadow-sm active:scale-95 transition-transform border-b-4 ${KEYPAD_COLORS[key]}`}>
                                    {key}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2 max-w-md mx-auto mt-3">
                            <Button onClick={handleDelete} variant="outline" className="h-12 border-slate-300 text-slate-600 hover:bg-slate-100">
                                <Eraser className="w-5 h-5 mr-2" />
                                Borrar Flecha
                            </Button>
                            <Button onClick={handleConfirm} disabled={!allArrowsFilled || (isShootOffTie && shootOffWinner === null) || isSaving} className="h-12 text-lg font-bold bg-green-600 hover:bg-green-700 shadow-md shadow-green-900/20 disabled:opacity-50">
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="mr-2 h-5 w-5" />}
                                {isShootOff ? "Confirmar Shoot-off" : "Confirmar Set"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
