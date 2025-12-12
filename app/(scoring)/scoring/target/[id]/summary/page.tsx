"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface ArcherAssignment {
    id: string;
    position: string;
    turn: string;
    current_end: number;
    archer: {
        id: string;
        first_name: string;
        last_name: string;
        age_category: string;
        club: string | null;
    };
    scores: number[][]; // scores[endIndex][arrowIndex]
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

export default function TargetSummaryPage() {
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

        const { data: tournament } = await supabase
            .from("tournaments")
            .select("id, name, arrows_per_end, qualification_arrows")
            .eq("id", target.tournament_id)
            .single();

        const { data: assignments } = await supabase
            .from("assignments")
            .select(`
                id,
                position,
                turn,
                current_end,
                archer:archers(id, first_name, last_name, age_category, club)
            `)
            .eq("target_id", targetId)
            .order("position");

        const assignmentIds = assignments?.map(a => a.id) || [];
        const { data: allScores } = await supabase
            .from("qualification_scores")
            .select("assignment_id, end_number, arrow_number, score")
            .in("assignment_id", assignmentIds)
            .order("end_number")
            .order("arrow_number")
            .range(0, 50000);

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

        const archerAssignments: ArcherAssignment[] = (assignments || []).map(a => {
            const assignmentScores = scoresByAssignment.get(a.id) || new Map();
            const scoresArray: number[][] = [];

            let totalScore = 0;
            // Iterate known ends
            for (const [endNum, endScores] of assignmentScores) {
                scoresArray[endNum - 1] = endScores;
                totalScore += endScores.reduce((sum: number, s: number) => sum + (s === 11 ? 10 : (s || 0)), 0);
            }

            return {
                id: a.id,
                position: a.position,
                turn: a.turn,
                current_end: a.current_end || 1,
                archer: a.archer as any,
                scores: scoresArray,
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

    const handleBack = () => {
        router.push(`/scoring/target/${targetId}`);
    };

    if (isLoading) return <div className="flex min-h-screen justify-center items-center bg-slate-100"><Loader2 className="h-10 w-10 animate-spin text-blue-600" /></div>;
    if (!targetData) return <div>Error loading target</div>;

    const { arrows_per_end, qualification_arrows } = targetData.tournament;
    const totalEnds = Math.ceil(qualification_arrows / arrows_per_end);

    return (
        <div className="min-h-screen bg-slate-100 pb-safe font-sans">
            {/* Header */}
            <div className="bg-[#333333] text-white p-3 shadow-md sticky top-0 z-20">
                <div className="flex justify-between items-center mb-1">
                    <Button variant="ghost" size="icon" onClick={handleBack} className="text-white hover:bg-white/20 h-8 w-8 -ml-2">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <span className="text-xs uppercase tracking-wider text-slate-300 font-bold">Resumen de Paca</span>
                    <div className="w-8" />
                </div>
                <div className="flex justify-between items-end border-t border-slate-600 pt-2">
                    <h1 className="text-xl font-bold">Paca {targetData.target_number}</h1>
                    <span className="text-sm font-semibold bg-slate-700 px-2 py-1 rounded">Distancia: {targetData.distance}m</span>
                </div>
            </div>

            <div className="p-2 space-y-4">
                {targetData.assignments.map((assignment) => {
                    let runningTotal = 0;
                    let running10s = 0;
                    let runningXs = 0;

                    return (
                        <div key={assignment.id} className="bg-white rounded-lg shadow-sm overflow-hidden border border-slate-200">
                            {/* Archer Header */}
                            <div className="bg-slate-50 p-3 border-b border-slate-200 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-slate-900 text-lg">
                                        {assignment.position} - {assignment.archer.last_name} {assignment.archer.first_name}
                                    </h3>
                                    <p className="text-xs text-slate-500">{assignment.archer.club || "Sin club"}</p>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto">
                                <div className="min-w-fit">
                                    <div className="grid grid-cols-[2rem_repeat(6,1fr)_2.5rem_2.5rem_2.5rem_2rem_2rem] bg-slate-100 text-center text-[10px] uppercase font-bold text-slate-500 py-1 border-b border-slate-200">
                                        <div>#</div>
                                        {Array.from({ length: arrows_per_end }).map((_, i) => <div key={i}>{i + 1}</div>)}
                                        <div>End</div>
                                        <div>Dist</div>
                                        <div>Tot</div>
                                        <div>10+X</div>
                                        <div>X</div>
                                    </div>

                                    {Array.from({ length: totalEnds }).map((_, idx) => {
                                        const endNum = idx + 1;
                                        const scores = assignment.scores[idx] || [];

                                        const endSum = scores.reduce((a, b) => a + (b === 11 ? 10 : (b || 0)), 0);
                                        const end10s = scores.filter(s => s === 10 || s === 11).length;
                                        const endXs = scores.filter(s => s === 11).length;

                                        if (scores.length > 0) {
                                            runningTotal += endSum;
                                            running10s += end10s;
                                            runningXs += endXs;
                                        }

                                        const isEmpty = scores.length === 0;

                                        return (
                                            <div
                                                key={endNum}
                                                className={`grid grid-cols-[2rem_repeat(6,1fr)_2.5rem_2.5rem_2.5rem_2rem_2rem] items-center text-center py-1 text-sm border-b border-slate-50 ${isEmpty ? "bg-slate-50/50" : "bg-white"}`}
                                            >
                                                <div className="font-bold text-slate-400 text-xs">{endNum}</div>
                                                {Array.from({ length: arrows_per_end }).map((_, i) => {
                                                    const val = scores[i] ?? null;
                                                    return (
                                                        <div key={i} className={`font-bold ${val === 11 ? "text-yellow-600 font-black" : // X
                                                            val === 10 ? "text-yellow-600 font-black" :
                                                                val >= 9 ? "text-yellow-600" :
                                                                    val >= 7 ? "text-red-500" :
                                                                        val >= 5 ? "text-blue-500" :
                                                                            val >= 1 ? "text-slate-900" : "text-slate-300"
                                                            }`}>
                                                            {val === null ? "" : (val === 0 ? "M" : val === 11 ? "X" : val === 10 ? "10" : val)}
                                                        </div>
                                                    )
                                                })}
                                                <div className="font-bold text-slate-700">{isEmpty ? "" : endSum}</div>
                                                <div className="font-bold text-slate-700">{isEmpty ? "" : runningTotal}</div>
                                                <div className="font-black text-slate-900">{isEmpty ? "" : runningTotal}</div>
                                                <div className="text-xs text-slate-500">{isEmpty ? "" : end10s}</div>
                                                <div className="text-xs text-slate-500">{isEmpty ? "" : endXs}</div>
                                            </div>
                                        );
                                    })}

                                    {/* Footer Row */}
                                    <div className="grid grid-cols-[2rem_repeat(6,1fr)_2.5rem_2.5rem_2.5rem_2rem_2rem] items-center text-center py-2 bg-slate-100 font-black text-slate-900 border-t border-slate-300">
                                        <div className="col-span-8 text-right pr-2 uppercase text-xs text-slate-500">Total</div>
                                        {/* Removed empty div to fix alignment */}
                                        <div>{runningTotal}</div> {/* Dist */}
                                        <div>{runningTotal}</div> {/* Tot */}
                                        <div>{running10s}</div> {/* 10+X */}
                                        <div>{runningXs}</div> {/* X */}
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
