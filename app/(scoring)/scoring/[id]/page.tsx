"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, CheckCircle2, History, Eraser } from "lucide-react";
import { toast } from "sonner";

// Custom Keypad Colors
const KEYPAD_COLORS: Record<string, string> = {
    "X": "bg-[#FFE55C] text-black border-[#E6CE45]",
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
    "M": "bg-slate-200 text-slate-500 border-slate-300",
};

const KEYPAD_LAYOUT = [
    ["X", "10", "9"],
    ["8", "7", "6"],
    ["5", "4", "3"],
    ["2", "1", "M"],
];

export default function ScoringPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const assignmentId = params.id as string;
    const targetId = searchParams.get("targetId");
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [assignment, setAssignment] = useState<any | null>(null);
    const [currentEnd, setCurrentEnd] = useState(1);

    // Data State
    const [arrows, setArrows] = useState<(number | null)[]>([]);
    const [savedScores, setSavedScores] = useState<Map<number, number[]>>(new Map());

    // UI State
    const [isSaving, setIsSaving] = useState(false);
    const [cursor, setCursor] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Color helpers
    const getCellColor = (val: number | null, isSelected: boolean) => {
        if (isSelected) return "bg-[#FFD700] ring-2 ring-yellow-600 text-black font-bold z-10"; // Highlight active cell (Yellow/Gold)
        if (val === null) return "bg-white";
        // Standard colors for display
        return ""; // We will style text/bg differently for table
    };

    const getScoreColorClass = (val: number | null) => {
        if (val === null) return "text-slate-400";
        if (val === 11 || val === 10) return "text-yellow-600 font-black";
        if (val >= 9) return "text-yellow-600 font-black";
        if (val >= 7) return "text-red-500 font-bold";
        if (val >= 5) return "text-blue-500 font-bold";
        if (val >= 3) return "text-slate-900 font-bold";
        return "text-slate-500 font-bold";
    };

    const getDisplayVal = (val: number | null) => {
        if (val === null) return "";
        if (val === 0) return "M";
        if (val === 11) return "X"; // New logic: 11 is X
        if (val === 10) return "10";
        return val.toString();
    };


    useEffect(() => {
        fetchAssignment();
    }, [assignmentId]);

    // Scroll to current end on load/update
    useEffect(() => {
        if (scrollRef.current) {
            // Find the active row
            const activeRow = document.getElementById(`end-row-${currentEnd}`);
            if (activeRow) {
                activeRow.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }
    }, [currentEnd, isLoading]);


    const fetchAssignment = async () => {
        setIsLoading(true);

        const { data: assignmentData, error } = await supabase
            .from("assignments")
            .select(`
                id, position, turn, current_end,
                archer:archers(first_name, last_name, age_category),
                target:targets(target_number, distance, tournament_id)
            `)
            .eq("id", assignmentId)
            .single();

        if (error || !assignmentData) {
            toast.error("Asignación no encontrada");
            setIsLoading(false);
            return;
        }

        const { data: tournament } = await supabase
            .from("tournaments")
            .select("name, arrows_per_end, qualification_arrows")
            .eq("id", (assignmentData.target as any).tournament_id)
            .single();

        const fullAssignment = {
            ...assignmentData,
            tournament: tournament || { name: "Torneo", arrows_per_end: 6, qualification_arrows: 72 }
        };

        setAssignment(fullAssignment);
        setCurrentEnd(fullAssignment.current_end || 1);

        const { data: scores } = await supabase
            .from("qualification_scores")
            .select("end_number, arrow_number, score")
            .eq("assignment_id", assignmentId)
            .order("end_number")
            .order("arrow_number");

        const scoresByEnd = new Map<number, number[]>();
        for (const score of scores || []) {
            if (!scoresByEnd.has(score.end_number)) {
                scoresByEnd.set(score.end_number, []);
            }
            scoresByEnd.get(score.end_number)![score.arrow_number - 1] = score.score as number;
        }
        setSavedScores(scoresByEnd);

        // Init arrows for current end
        const arrowsCount = fullAssignment.tournament.arrows_per_end || 6;
        const currentEndScores = scoresByEnd.get(fullAssignment.current_end || 1);

        if (currentEndScores && currentEndScores.length > 0) {
            const filled = Array(arrowsCount).fill(null);
            currentEndScores.forEach((s, i) => { if (i < arrowsCount) filled[i] = s; });
            setArrows(filled);
            const firstNull = filled.indexOf(null);
            setCursor(firstNull === -1 ? arrowsCount : firstNull);
        } else {
            setArrows(Array(arrowsCount).fill(null));
            setCursor(0);
        }

        setIsLoading(false);
    };

    const handleKeypadPress = (key: string) => {
        let val: number;
        if (key === "M") val = 0;
        else if (key === "X") val = 11; // Display as X, Value 11 (counts as 10)
        else val = parseInt(key);

        const newArrows = [...arrows];
        if (cursor < arrows.length) {
            newArrows[cursor] = val;
            setArrows(newArrows);
            if (cursor < arrows.length) {
                setCursor(cursor + 1);
            }
        }
    };

    const handleConfirm = async () => {
        if (!assignment) return;

        const { arrows_per_end, qualification_arrows } = assignment.tournament;
        const totalEnds = Math.ceil(qualification_arrows / arrows_per_end);
        const isLastEnd = currentEnd >= totalEnds;

        setIsSaving(true);
        try {
            await supabase.from("qualification_scores").delete()
                .eq("assignment_id", assignmentId).eq("end_number", currentEnd);

            const scoresToInsert = arrows.map((score, index) => ({
                assignment_id: assignmentId,
                end_number: currentEnd,
                arrow_number: index + 1,
                score: score === null ? 0 : score,
            }));

            const { error } = await supabase.from("qualification_scores").insert(scoresToInsert);
            if (error) throw error;

            // Check if this is the last end
            if (isLastEnd) {
                // Mark archer as finished
                await supabase.from("assignments").update({
                    current_end: currentEnd,
                    is_finished: true
                }).eq("id", assignmentId);

                toast.success("¡Arquero completado!", {
                    description: `${totalEnds} rondas registradas correctamente`,
                });

                // Check if ALL archers on this target are now finished
                const currentTargetId = targetId || (assignment.target as any).id;

                const { data: otherAssignments } = await supabase
                    .from("assignments")
                    .select("id, is_finished")
                    .eq("target_id", currentTargetId);

                const allFinished = (otherAssignments || []).every(a =>
                    a.id === assignmentId ? true : a.is_finished
                );

                if (allFinished) {
                    // All archers finished - go to summary
                    toast.success("¡Paca completada!", {
                        description: "Todos los arqueros han terminado",
                    });
                    router.push(`/scoring/target/${currentTargetId}/summary`);
                } else {
                    // Not all finished - go back to Target Hub
                    router.push(`/scoring/target/${currentTargetId}`);
                }
            } else {
                // Advance to next end
                await supabase.from("assignments").update({ current_end: currentEnd + 1 }).eq("id", assignmentId);

                toast.success(`Ronda ${currentEnd} guardada`);

                if (targetId) {
                    router.push(`/scoring/target/${targetId}`);
                } else {
                    router.refresh();
                    setCurrentEnd(prev => prev + 1);
                    setArrows(Array(assignment.tournament.arrows_per_end).fill(null));
                    setCursor(0);
                    setIsSaving(false);
                }
            }
        } catch (error: any) {
            toast.error("Error", { description: error.message });
            setIsSaving(false);
        }
    };

    const handleDeleteArrow = () => {
        if (cursor > 0) {
            const newArrows = [...arrows];
            const target = Math.min(cursor, arrows.length - 1);

            if (arrows[cursor] !== null && cursor < arrows.length) {
                newArrows[cursor] = null;
                setArrows(newArrows);
            } else {
                if (cursor > 0) {
                    newArrows[cursor - 1] = null;
                    setArrows(newArrows);
                    setCursor(cursor - 1);
                }
            }
        }
    };


    const handleBack = () => {
        if (targetId) router.push(`/scoring/target/${targetId}`);
        else router.back();
    };

    const handleSummary = () => {
        if (targetId) router.push(`/scoring/target/${targetId}/summary`);
    };

    if (isLoading || !assignment) {
        return <div className="flex h-screen items-center justify-center bg-slate-100"><Loader2 className="animate-spin text-blue-600" /></div>;
    }

    const { arrows_per_end, qualification_arrows } = assignment.tournament;
    const totalEnds = Math.ceil(qualification_arrows / arrows_per_end);

    return (
        <div className="flex flex-col h-screen bg-slate-100 font-sans overflow-hidden">
            {/* Navbar */}
            <div className="bg-[#333333] text-white p-2 flex items-center justify-between shrink-0 shadow-md z-20">
                <Button variant="ghost" size="icon" onClick={handleBack} className="text-white hover:bg-white/20">
                    <ArrowLeft className="h-6 w-6" />
                </Button>
                <div className="text-center">
                    <h2 className="font-bold text-lg leading-none">{assignment.position} - {assignment.archer.last_name} {assignment.archer.first_name}</h2>
                    <p className="text-xs text-slate-400 mt-0.5 uppercase tracking-wide">
                        {assignment.target.distance}m
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={handleSummary} className="text-white hover:bg-white/20"><History className="w-5 h-5" /></Button>
                </div>
            </div>

            {/* Scorecard Table (Scrollable) */}
            <div className="flex-1 overflow-y-auto bg-slate-200" ref={scrollRef}>
                <div className="min-w-fit bg-white shadow-sm pb-20">
                    <div className="sticky top-0 z-10 grid grid-cols-[2.5rem_repeat(6,1fr)_2.5rem_3rem_2.5rem_2rem] bg-slate-100 border-b border-slate-300 text-center text-[10px] uppercase font-bold text-slate-600 py-2 px-1">
                        <div>No.</div>
                        {Array.from({ length: arrows_per_end }).map((_, i) => <div key={i}>{i + 1}</div>)}
                        <div>End</div>
                        <div>Tot</div>
                        <div>10+X</div>
                        <div>X</div>
                    </div>

                    {Array.from({ length: totalEnds }).map((_, idx) => {
                        const endNum = idx + 1;
                        // Determine row state
                        const isCurrent = endNum === currentEnd;
                        const isPast = endNum < currentEnd;
                        const isFuture = endNum > currentEnd;

                        // Data
                        let rowArrows: (number | null)[] = [];
                        if (isCurrent) rowArrows = arrows;
                        else if (isPast) {
                            const scores = savedScores.get(endNum) || [];
                            rowArrows = Array.from({ length: arrows_per_end }, (_, i) => scores[i] ?? null);
                        } else {
                            rowArrows = Array(arrows_per_end).fill(null);
                        }

                        // Totals Calculation (X=11 counts as 10)
                        const endTotal = rowArrows.reduce((a: number, b: number | null) => {
                            const val = b === 11 ? 10 : (b || 0); // 11 is 10 points
                            return a + val;
                        }, 0);

                        // Running Stat Calculation
                        let runningTotal = 0;
                        let running10s = 0;
                        let runningXs = 0;

                        // Calculate up to this end
                        for (let e = 1; e <= endNum; e++) {
                            let eArrows: number[] = [];
                            if (e === currentEnd) eArrows = rowArrows.map(v => v || 0); // Use current input
                            else eArrows = savedScores.get(e) || [];

                            const eSum = eArrows.reduce((a, b) => a + (b === 11 ? 10 : (b || 0)), 0);
                            runningTotal += eSum;

                            eArrows.forEach(v => {
                                if (v === 11) { runningXs++; running10s++; } // X is 10+X and X
                                else if (v === 10) { running10s++; }
                            });
                        }

                        if (isFuture) {
                            runningTotal = 0; running10s = 0; runningXs = 0;
                        }

                        return (
                            <div
                                key={endNum}
                                id={`end-row-${endNum}`}
                                className={`
                                    grid grid-cols-[2.5rem_repeat(6,1fr)_2.5rem_3rem_2.5rem_2rem] items-center text-center border-b border-slate-200 py-1 px-1
                                    ${isCurrent ? "bg-amber-100" : (isFuture ? "bg-slate-50 opacity-60" : "bg-white")}
                                `}
                            >
                                <div className="font-bold text-slate-500 text-xs">{endNum}</div>
                                {Array.from({ length: arrows_per_end }).map((_, slotIdx) => {
                                    const val = rowArrows[slotIdx];
                                    const isSelected = isCurrent && cursor === slotIdx;

                                    // Special styling for Current vs Past
                                    if (isCurrent) {
                                        return (
                                            <div key={slotIdx} className="p-0.5">
                                                <button
                                                    onClick={() => setCursor(slotIdx)}
                                                    className={`
                                                        w-full aspect-square rounded flex items-center justify-center text-lg font-bold border
                                                        ${isSelected
                                                            ? "bg-amber-300 border-amber-500 shadow-inner ring-1 ring-amber-500 text-black"
                                                            : "bg-white border-slate-300 text-slate-800"
                                                        }
                                                    `}
                                                >
                                                    {getDisplayVal(val)}
                                                </button>
                                            </div>
                                        );
                                    } else {
                                        // Past/Future cells (read only look)
                                        return (
                                            <div key={slotIdx} className="flex items-center justify-center text-base font-bold">
                                                <span className={getScoreColorClass(val)}>
                                                    {isFuture ? "" : getDisplayVal(val)}
                                                </span>
                                            </div>
                                        );
                                    }
                                })}
                                <div className="font-bold text-slate-800 text-sm">
                                    {(isCurrent || isPast) ? endTotal : ""}
                                </div>
                                <div className="font-black text-slate-900 text-sm">
                                    {(isCurrent || isPast) ? runningTotal : ""}
                                </div>
                                <div className="text-xs font-bold text-slate-600">
                                    {(isCurrent || isPast) ? running10s : ""}
                                </div>
                                <div className="text-xs font-bold text-slate-600">
                                    {(isCurrent || isPast) ? runningXs : ""}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Controls Area */}
            <div className="bg-white border-t border-slate-200">
                {/* Keypad */}
                <div className="p-2 pb-safe">
                    <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
                        {KEYPAD_LAYOUT.flat().map((key) => (
                            <button
                                key={key}
                                onClick={() => handleKeypadPress(key)}
                                className={`
                                    h-14 rounded-lg text-2xl font-bold shadow-sm active:scale-95 transition-transform border-b-4
                                    ${KEYPAD_COLORS[key]}
                                `}
                            >
                                {key}
                            </button>
                        ))}
                    </div>

                    {/* Actions Row */}
                    <div className="grid grid-cols-2 gap-2 max-w-md mx-auto mt-3">
                        {/* Delete Arrow Button */}
                        <Button
                            onClick={handleDeleteArrow}
                            variant="outline"
                            className="h-12 border-slate-300 text-slate-600 hover:bg-slate-100"
                        >
                            <Eraser className="w-5 h-5 mr-2" />
                            Borrar Flecha
                        </Button>

                        {/* Confirm Button */}
                        {arrows.every(a => a !== null) ? (
                            <Button
                                onClick={handleConfirm}
                                disabled={isSaving}
                                className="h-12 text-lg font-bold bg-green-600 hover:bg-green-700 shadow-md shadow-green-900/20"
                            >
                                {isSaving ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                                Confirmar
                            </Button>
                        ) : (
                            <Button disabled className="h-12 bg-slate-200 text-slate-400">
                                Completar Ronda
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
