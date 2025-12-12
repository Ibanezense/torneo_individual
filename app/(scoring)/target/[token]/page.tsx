"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArcherCard } from "@/components/scoring/ArcherCard";
import { FullPageLoader } from "@/components/shared/LoadingSpinner";
import { toast } from "sonner";
import type { Assignment, Archer, QualificationScore, Target, Tournament } from "@/types/database";

interface ArcherData {
    assignment: Assignment;
    archer: Archer;
    scores: QualificationScore[];
    currentEndScores: (number | null)[];
}

export default function TargetScoringPage() {
    const params = useParams();
    const token = params.token as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [target, setTarget] = useState<Target | null>(null);
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [archers, setArchers] = useState<ArcherData[]>([]);
    const [activeArcherIndex, setActiveArcherIndex] = useState(0);
    const [currentArrowIndex, setCurrentArrowIndex] = useState(0);
    const [activeTurn, setActiveTurn] = useState<"AB" | "CD">("AB");

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);

            // Find assignment by token
            const { data: assignmentData, error: assignmentError } = await supabase
                .from("assignments")
                .select(`
          *,
          archer:archers(*),
          target:targets(*),
          target:targets(tournament:tournaments(*))
        `)
                .eq("access_token", token)
                .single();

            if (assignmentError || !assignmentData) {
                toast.error("Token inválido o expirado");
                setIsLoading(false);
                return;
            }

            const targetData = assignmentData.target as any;
            const tournamentData = targetData.tournament as Tournament;

            setTarget(targetData);
            setTournament(tournamentData);

            // Get all assignments for this target
            const { data: allAssignments, error: allError } = await supabase
                .from("assignments")
                .select(`
          *,
          archer:archers(*)
        `)
                .eq("target_id", targetData.id)
                .order("position");

            if (allError) {
                toast.error("Error al cargar datos");
                setIsLoading(false);
                return;
            }

            // Get scores for all assignments
            const assignmentIds = allAssignments.map((a) => a.id);
            const { data: scoresData } = await supabase
                .from("qualification_scores")
                .select("*")
                .in("assignment_id", assignmentIds);

            const archersData: ArcherData[] = allAssignments.map((assignment) => {
                const scores = (scoresData || []).filter(
                    (s) => s.assignment_id === assignment.id
                );
                return {
                    assignment: assignment as Assignment,
                    archer: assignment.archer as Archer,
                    scores,
                    currentEndScores: Array(tournamentData.arrows_per_end).fill(null),
                };
            });

            setArchers(archersData);
            setIsLoading(false);
        };

        fetchData();
    }, [token, supabase]);

    const handleScoreChange = (archerIndex: number, arrowIndex: number, score: number | null) => {
        setArchers((prev) => {
            const updated = [...prev];
            updated[archerIndex] = {
                ...updated[archerIndex],
                currentEndScores: updated[archerIndex].currentEndScores.map((s, i) =>
                    i === arrowIndex ? score : s
                ),
            };
            return updated;
        });
    };

    const handleConfirmEnd = async (archerIndex: number) => {
        const archerData = archers[archerIndex];
        const endNumber = archerData.assignment.current_end + 1;

        // Validate all arrows have scores
        if (archerData.currentEndScores.some((s) => s === null)) {
            toast.error("Completa todas las flechas antes de confirmar");
            return;
        }

        try {
            // Insert scores
            const scoresToInsert = archerData.currentEndScores.map((score, i) => ({
                assignment_id: archerData.assignment.id,
                end_number: endNumber,
                arrow_number: i + 1,
                score,
            }));

            const { error: scoresError } = await supabase
                .from("qualification_scores")
                .insert(scoresToInsert);

            if (scoresError) throw scoresError;

            // Insert/update end confirmation
            const endTotal = archerData.currentEndScores.reduce<number>(
                (sum, s) => sum + (s === 11 ? 10 : (s ?? 0)),
                0
            );

            const { error: endError } = await supabase.from("qualification_ends").insert({
                assignment_id: archerData.assignment.id,
                end_number: endNumber,
                end_total: endTotal,
                is_confirmed: true,
                confirmed_at: new Date().toISOString(),
            });

            if (endError) throw endError;

            // Update assignment current_end
            const totalEnds = tournament!.qualification_arrows / tournament!.arrows_per_end;
            const isFinished = endNumber >= totalEnds;

            const { error: assignmentError } = await supabase
                .from("assignments")
                .update({
                    current_end: endNumber,
                    is_finished: isFinished,
                })
                .eq("id", archerData.assignment.id);

            if (assignmentError) throw assignmentError;

            // Update local state
            setArchers((prev) => {
                const updated = [...prev];
                updated[archerIndex] = {
                    ...updated[archerIndex],
                    assignment: {
                        ...updated[archerIndex].assignment,
                        current_end: endNumber,
                        is_finished: isFinished,
                    },
                    scores: [
                        ...updated[archerIndex].scores,
                        ...scoresToInsert.map((s, i) => ({
                            ...s,
                            id: `temp-${i}`,
                            recorded_at: new Date().toISOString(),
                            recorded_by: null,
                            is_edited: false,
                            original_score: null,
                            edited_at: null,
                            edited_by: null,
                            edit_reason: null,
                        })),
                    ],
                    currentEndScores: Array(tournament!.arrows_per_end).fill(null),
                };
                return updated;
            });

            setCurrentArrowIndex(0);
            toast.success(`Ronda ${endNumber} confirmada`);
        } catch (error: any) {
            toast.error("Error al guardar", { description: error.message });
        }
    };

    if (isLoading) {
        return <FullPageLoader text="Cargando paca..." />;
    }

    if (!target || !tournament) {
        return (
            <div className="flex h-full items-center justify-center p-4">
                <Card>
                    <CardContent className="p-6 text-center">
                        <p className="text-lg font-medium text-destructive">
                            Token inválido o expirado
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Escanea nuevamente el código QR de tu paca
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const turnArchers = {
        AB: archers.filter((a) => a.assignment.turn === "AB"),
        CD: archers.filter((a) => a.assignment.turn === "CD"),
    };

    return (
        <div className="p-4 space-y-4">
            {/* Header */}
            <Card>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Paca {target.target_number}</CardTitle>
                            <CardDescription>
                                {tournament.name} • {target.distance}m
                            </CardDescription>
                        </div>
                        <Badge className="text-lg">{target.distance}m</Badge>
                    </div>
                </CardHeader>
            </Card>

            {/* Turn Tabs */}
            <Tabs value={activeTurn} onValueChange={(v) => setActiveTurn(v as "AB" | "CD")}>
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="AB">
                        Turno AB ({turnArchers.AB.length})
                    </TabsTrigger>
                    <TabsTrigger value="CD">
                        Turno CD ({turnArchers.CD.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="AB" className="space-y-4 mt-4">
                    {turnArchers.AB.map((data, idx) => {
                        const globalIndex = archers.findIndex(
                            (a) => a.assignment.id === data.assignment.id
                        );
                        return (
                            <ArcherCard
                                key={data.assignment.id}
                                archer={data.archer}
                                assignment={data.assignment}
                                scores={data.scores}
                                currentEndScores={data.currentEndScores}
                                arrowsPerEnd={tournament.arrows_per_end}
                                isActive={activeArcherIndex === globalIndex && activeTurn === "AB"}
                                onActivate={() => setActiveArcherIndex(globalIndex)}
                                onScoreChange={(arrowIdx, score) =>
                                    handleScoreChange(globalIndex, arrowIdx, score)
                                }
                                onConfirmEnd={() => handleConfirmEnd(globalIndex)}
                                currentArrowIndex={currentArrowIndex}
                                onArrowSelect={setCurrentArrowIndex}
                            />
                        );
                    })}
                </TabsContent>

                <TabsContent value="CD" className="space-y-4 mt-4">
                    {turnArchers.CD.map((data, idx) => {
                        const globalIndex = archers.findIndex(
                            (a) => a.assignment.id === data.assignment.id
                        );
                        return (
                            <ArcherCard
                                key={data.assignment.id}
                                archer={data.archer}
                                assignment={data.assignment}
                                scores={data.scores}
                                currentEndScores={data.currentEndScores}
                                arrowsPerEnd={tournament.arrows_per_end}
                                isActive={activeArcherIndex === globalIndex && activeTurn === "CD"}
                                onActivate={() => setActiveArcherIndex(globalIndex)}
                                onScoreChange={(arrowIdx, score) =>
                                    handleScoreChange(globalIndex, arrowIdx, score)
                                }
                                onConfirmEnd={() => handleConfirmEnd(globalIndex)}
                                currentArrowIndex={currentArrowIndex}
                                onArrowSelect={setCurrentArrowIndex}
                            />
                        );
                    })}
                </TabsContent>
            </Tabs>
        </div>
    );
}
