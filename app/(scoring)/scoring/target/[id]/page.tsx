"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Target, CheckCircle2, FileText, NotebookText } from "lucide-react";
import { toast } from "sonner";
import { CATEGORY_LABELS } from "@/lib/constants/categories";
import type { AgeCategory } from "@/types/database";

interface ArcherAssignment {
    id: string;
    position: string;
    turn: string;
    current_end: number;
    is_finished: boolean;
    archer: {
        id: string;
        first_name: string;
        last_name: string;
        age_category: string;
        club: string | null;
    };
    scores: number[][]; // scores[end][arrow]
    totalScore: number;
}

interface TargetData {
    id: string;
    target_number: number;
    distance: number;
    tournament: {
        id: string;
        name: string;
        arrows_per_end: number;
        qualification_arrows: number;
    };
    assignments: ArcherAssignment[];
}

export default function TargetScoringPage() {
    const params = useParams();
    const router = useRouter();
    const targetId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [targetData, setTargetData] = useState<TargetData | null>(null);

    useEffect(() => {
        fetchTargetData();
    }, [targetId]);

    const fetchTargetData = async () => {
        setIsLoading(true);

        // Fetch target with tournament
        const { data: target, error: targetError } = await supabase
            .from("targets")
            .select("id, target_number, distance, tournament_id")
            .eq("id", targetId)
            .single();

        if (targetError || !target) {
            toast.error("Paca no encontrada");
            setIsLoading(false);
            return;
        }

        // Fetch tournament
        const { data: tournament } = await supabase
            .from("tournaments")
            .select("id, name, arrows_per_end, qualification_arrows")
            .eq("id", target.tournament_id)
            .single();

        // Fetch assignments with archers - now including is_finished
        const { data: assignments } = await supabase
            .from("assignments")
            .select(`
                id,
                position,
                turn,
                current_end,
                is_finished,
                archer:archers(id, first_name, last_name, age_category, club)
            `)
            .eq("target_id", targetId)
            .order("position");

        // Fetch all scores for all assignments
        const assignmentIds = assignments?.map(a => a.id) || [];
        const { data: allScores } = await supabase
            .from("qualification_scores")
            .select("assignment_id, end_number, arrow_number, score")
            .in("assignment_id", assignmentIds)
            .order("end_number")
            .order("arrow_number")
            .range(0, 50000);

        // Organize scores
        const scoresByAssignment = new Map<string, Map<number, number[]>>();
        for (const score of allScores || []) {
            if (!scoresByAssignment.has(score.assignment_id)) {
                scoresByAssignment.set(score.assignment_id, new Map());
            }
            const assignmentScores = scoresByAssignment.get(score.assignment_id)!;
            if (!assignmentScores.has(score.end_number)) {
                assignmentScores.set(score.end_number, []);
            }
            assignmentScores.get(score.end_number)![score.arrow_number - 1] = score.score;
        }

        // Build result
        const archerAssignments: ArcherAssignment[] = (assignments || []).map(a => {
            const assignmentScores = scoresByAssignment.get(a.id) || new Map();
            const scoresArray: number[][] = [];
            let totalScore = 0;

            for (const [endNum, endScores] of assignmentScores) {
                scoresArray[endNum - 1] = endScores;
                totalScore += endScores.reduce((sum: number, s: number) => sum + (s === 11 ? 10 : (s || 0)), 0); // Correct sum logic
            }

            return {
                id: a.id,
                position: a.position,
                turn: a.turn,
                current_end: a.current_end || 1,
                is_finished: a.is_finished || false,
                archer: a.archer as any,
                scores: scoresArray, // Index is EndNumber - 1
                totalScore,
            };
        });

        setTargetData({
            id: target.id,
            target_number: target.target_number,
            distance: target.distance,
            tournament: tournament || { id: "", name: "Torneo", arrows_per_end: 6, qualification_arrows: 72 },
            assignments: archerAssignments,
        });

        setIsLoading(false);
    };

    const handleArcherClick = (assignmentId: string) => {
        router.push(`/scoring/${assignmentId}?targetId=${targetId}`);
    };

    const handleSummaryClick = () => {
        router.push(`/scoring/target/${targetId}/summary`);
    };

    const minEnd = targetData?.assignments.length
        ? Math.min(...targetData.assignments.map(a => a.current_end))
        : 1;

    if (isLoading) return <div className="flex min-h-screen justify-center items-center"><Loader2 className="h-12 w-12 animate-spin text-blue-600" /></div>;
    if (!targetData) return <div>Error loading target</div>;

    const { arrows_per_end } = targetData.tournament;
    const arrowSlots = Array.from({ length: arrows_per_end }, (_, i) => i + 1);

    return (
        <div className="min-h-screen bg-slate-100 pb-safe font-sans">
            {/* Header matching reference */}
            <div className="bg-[#333333] text-white p-3 shadow-md sticky top-0 z-20">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs uppercase tracking-wider text-slate-300 font-bold">Qualification Round</span>
                    <Button variant="ghost" size="icon" onClick={handleSummaryClick} className="text-white hover:bg-white/20 h-8 w-8">
                        <NotebookText className="h-5 w-5 text-blue-400" />
                    </Button>
                </div>
                <div className="flex justify-between items-end border-t border-slate-600 pt-2">
                    <h1 className="text-xl font-bold">Paca {targetData.target_number}</h1>
                    <span className="text-sm font-semibold bg-slate-700 px-2 py-1 rounded">Distancia: {targetData.distance}m</span>
                </div>
                <div className="mt-2 h-1 bg-slate-600 w-full rounded-full overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${((minEnd - 1) / (targetData.tournament.qualification_arrows / arrows_per_end)) * 100}%` }} />
                </div>
            </div>

            <div className="p-2 space-y-3 mt-1">
                {targetData.assignments.map((assignment) => {
                    const isConfirmed = assignment.current_end > minEnd;
                    const isFinished = assignment.is_finished;

                    // Logic to decide which end to show on the card
                    let displayEndNum = assignment.current_end;

                    // For finished archers: show their last completed end (current_end)
                    // For in-progress archers who have confirmed: show previous end (current_end - 1)
                    // The "isConfirmed" case only applies when archer is NOT finished
                    if (!isFinished && isConfirmed && displayEndNum > 1) {
                        displayEndNum = displayEndNum - 1;
                    }

                    const displayScores = assignment.scores[displayEndNum - 1] || [];
                    const endTotal = displayScores.reduce((a: number, b: number) => a + (b === 11 ? 10 : (b || 0)), 0);

                    // Calculate Running Total up to this displayed end
                    let runningTotal = 0;
                    for (let i = 0; i < displayEndNum; i++) {
                        const s = assignment.scores[i];
                        if (s) runningTotal += s.reduce((a: number, b: number) => a + (b === 11 ? 10 : (b || 0)), 0);
                    }

                    return (
                        <div
                            key={assignment.id}
                            onClick={() => !isFinished && handleArcherClick(assignment.id)}
                            className={`
                                overflow-hidden rounded-xl bg-white shadow-sm border-2 transition-all
                                ${isFinished
                                    ? "border-emerald-500 bg-emerald-50/50 cursor-default"
                                    : isConfirmed
                                        ? "border-green-500 active:scale-[0.99]"
                                        : "border-transparent active:scale-[0.99]"
                                }
                            `}
                        >
                            {/* Card Header */}
                            <div className="flex items-center justify-between p-3 pb-2 border-b border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg font-black shadow-sm ${isFinished ? "bg-emerald-100 border-emerald-600 text-emerald-700" : "bg-blue-50 border-slate-900 text-slate-900"}`}>
                                        {isFinished ? <CheckCircle2 className="h-5 w-5" /> : assignment.position}
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-slate-900 leading-tight">
                                            {assignment.archer.last_name} {assignment.archer.first_name}
                                        </h3>
                                        <p className="text-xs text-slate-500 font-medium">
                                            {assignment.archer.club || "Sin Club"} ({assignment.archer.age_category})
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    {isFinished ? (
                                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
                                            Terminado
                                        </Badge>
                                    ) : null}
                                    <div className="text-xl font-black text-slate-900">{assignment.totalScore}</div>
                                </div>
                            </div>

                            {/* Mini Score Grid */}
                            <div className="p-2 bg-slate-50/50">
                                <div className="flex items-center text-center text-xs font-bold text-slate-500 mb-1">
                                    <div className="w-8">Ronda</div>
                                    <div className="flex-1 grid grid-cols-6 gap-1">
                                        {arrowSlots.map(n => <div key={n} className="leading-none">{n}</div>)}
                                    </div>
                                    <div className="w-10 ml-2">Total</div>
                                    <div className="w-10">Acum</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-8 text-center text-lg font-bold text-slate-400">
                                        {displayEndNum}
                                    </div>
                                    <div className="flex-1 grid grid-cols-6 gap-1">
                                        {arrowSlots.map((_, i) => {
                                            const score = displayScores[i] ?? null;
                                            return (
                                                <div
                                                    key={i}
                                                    className={`
                                                        aspect-square rounded flex items-center justify-center text-sm font-bold shadow-sm ring-1 ring-inset ring-black/5
                                                        ${score === null ? "bg-white" :
                                                            score === 11 ? "bg-[#FFE55C] text-black" : // X
                                                                score === 10 ? "bg-[#FFE55C] text-black" : // 10
                                                                    score >= 9 ? "bg-[#FFE55C] text-black" :
                                                                        score >= 7 ? "bg-[#FF5C5C] text-white" :
                                                                            score >= 5 ? "bg-[#5C9DFF] text-white" :
                                                                                score >= 3 ? "bg-slate-900 text-white" :
                                                                                    score >= 1 ? "bg-slate-200 text-black" :
                                                                                        "bg-slate-200 text-slate-500" // M
                                                        }
                                                    `}
                                                >
                                                    {score === null ? "" : (score === 0 ? "M" : score === 11 ? "X" : score === 10 ? "10" : score)}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="w-10 ml-2 text-center font-bold text-slate-700 text-base leading-none">
                                        {endTotal}
                                    </div>
                                    <div className="w-10 text-center font-black text-slate-900 text-base leading-none">
                                        {runningTotal}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
