"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Target, AssignmentStatus } from "@/types/database";

interface TargetWithStatus extends Target {
    archerCount: number;
    scoringCount: number;
    completedCount: number;
}

interface Assignment {
    id: string;
    target_id: string;
    is_finished: boolean;
    archer: {
        first_name: string;
        last_name: string;
    };
}

interface TargetStats {
    inactive: number;
    scoring: number;
    confirmed: number;
    conflict: number;
}

export function useRealtimeTargets(tournamentId: string) {
    const [targets, setTargets] = useState<TargetWithStatus[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const supabase = createClient();

    const fetchTargets = useCallback(async () => {
        // 1. Get all targets for this tournament
        const { data: targetsData, error: targetsError } = await supabase
            .from("targets")
            .select("*")
            .eq("tournament_id", tournamentId)
            .order("target_number");

        if (targetsError) {
            console.error("Error fetching targets:", targetsError);
            setIsLoading(false);
            return;
        }

        // 2. Get all assignments for this tournament
        const { data: assignmentsData, error: assignmentsError } = await supabase
            .from("assignments")
            .select("id, target_id, is_finished, archer:archers(first_name, last_name)")
            .eq("tournament_id", tournamentId);

        if (assignmentsError) {
            console.error("Error fetching assignments:", assignmentsError);
        }

        // 3. Get tournament info to know total arrows
        const { data: tournament } = await supabase
            .from("tournaments")
            .select("qualification_arrows")
            .eq("id", tournamentId)
            .single();

        const totalArrows = tournament?.qualification_arrows || 36;

        // 4. Get scores count per assignment
        const assignmentIds = (assignmentsData || []).map((a: any) => a.id);

        let scoresByAssignment = new Map<string, number>();
        if (assignmentIds.length > 0) {
            const { data: scoresData } = await supabase
                .from("qualification_scores")
                .select("assignment_id")
                .in("assignment_id", assignmentIds)
                .not("score", "is", null);

            // Count scores per assignment
            for (const score of scoresData || []) {
                const current = scoresByAssignment.get(score.assignment_id) || 0;
                scoresByAssignment.set(score.assignment_id, current + 1);
            }
        }

        // 5. Group assignments by target and calculate status
        const assignmentsByTarget = new Map<string, Assignment[]>();
        for (const assignment of assignmentsData || []) {
            if (!assignmentsByTarget.has(assignment.target_id)) {
                assignmentsByTarget.set(assignment.target_id, []);
            }
            // Supabase returns nested selects as arrays, extract first item
            const archerData = Array.isArray(assignment.archer) ? assignment.archer[0] : assignment.archer;
            assignmentsByTarget.get(assignment.target_id)!.push({
                id: assignment.id,
                target_id: assignment.target_id,
                is_finished: assignment.is_finished,
                archer: archerData || { first_name: '', last_name: '' }
            });
        }

        // 6. Calculate target statuses
        const targetsWithCounts: TargetWithStatus[] = (targetsData || []).map((target: Target) => {
            const assignments = assignmentsByTarget.get(target.id) || [];
            const archerCount = assignments.length;

            let scoringCount = 0;
            let completedCount = 0;

            for (const assignment of assignments) {
                const arrowCount = scoresByAssignment.get(assignment.id) || 0;
                if (arrowCount >= totalArrows || assignment.is_finished) {
                    completedCount++;
                } else if (arrowCount > 0) {
                    scoringCount++;
                }
            }

            // Determine target status
            let current_status: AssignmentStatus = "inactive";
            if (archerCount === 0) {
                current_status = "inactive";
            } else if (completedCount === archerCount && archerCount > 0) {
                current_status = "confirmed";
            } else if (scoringCount > 0 || completedCount > 0) {
                current_status = "scoring";
            }

            return {
                ...target,
                current_status,
                archerCount,
                scoringCount,
                completedCount,
            };
        });

        setTargets(targetsWithCounts);
        setIsLoading(false);
    }, [tournamentId, supabase]);

    useEffect(() => {
        fetchTargets();

        // Subscribe to realtime changes on scores
        const channel = supabase
            .channel(`control-room-${tournamentId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "qualification_scores",
                },
                () => {
                    // Refetch when scores change
                    fetchTargets();
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "assignments",
                    filter: `tournament_id=eq.${tournamentId}`,
                },
                () => {
                    // Refetch when assignments change
                    fetchTargets();
                }
            )
            .subscribe((status) => {
                setIsConnected(status === "SUBSCRIBED");
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [tournamentId, supabase, fetchTargets]);

    // Calculate stats
    const stats: TargetStats = {
        inactive: targets.filter((t) => t.current_status === "inactive").length,
        scoring: targets.filter((t) => t.current_status === "scoring").length,
        confirmed: targets.filter((t) => t.current_status === "confirmed").length,
        conflict: targets.filter((t) => t.current_status === "conflict").length,
    };

    return {
        targets,
        stats,
        isConnected,
        isLoading,
        refetch: fetchTargets,
    };
}
