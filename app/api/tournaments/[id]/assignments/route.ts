import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Archer, Target, TargetPosition, ShootingTurn } from "@/types/database";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const supabase = await createClient();

        // Get tournament
        const { data: tournament, error: tournamentError } = await supabase
            .from("tournaments")
            .select("*")
            .eq("id", tournamentId)
            .single();

        if (tournamentError || !tournament) {
            return NextResponse.json(
                { error: "Torneo no encontrado" },
                { status: 404 }
            );
        }

        // Get request body
        const body = await request.json();
        const archerIds: string[] = body.archerIds || [];

        if (archerIds.length === 0) {
            return NextResponse.json(
                { error: "No se seleccionaron arqueros" },
                { status: 400 }
            );
        }

        // Get archers
        const { data: archers, error: archersError } = await supabase
            .from("archers")
            .select("*")
            .in("id", archerIds);

        if (archersError || !archers) {
            return NextResponse.json(
                { error: "Error al obtener arqueros" },
                { status: 500 }
            );
        }

        // Get existing targets for this tournament
        const { data: existingTargets, error: targetsError } = await supabase
            .from("targets")
            .select("*")
            .eq("tournament_id", tournamentId)
            .order("target_number");

        if (targetsError) {
            return NextResponse.json(
                { error: "Error al obtener pacas" },
                { status: 500 }
            );
        }

        if (!existingTargets || existingTargets.length === 0) {
            return NextResponse.json(
                { error: "No hay pacas configuradas. Configura las pacas primero." },
                { status: 400 }
            );
        }

        // Delete existing assignments for this tournament
        await supabase
            .from("assignments")
            .delete()
            .eq("tournament_id", tournamentId);

        // Group archers by distance AND category (but allow gender mixing)
        // Key format: "distance-category" e.g., "20-u18"
        const archersByGroup = new Map<string, Archer[]>();
        for (const archer of archers) {
            const key = `${archer.distance}-${archer.age_category}`;
            if (!archersByGroup.has(key)) {
                archersByGroup.set(key, []);
            }
            archersByGroup.get(key)!.push(archer);
        }

        // Group targets by distance
        const targetsByDistance = new Map<number, Target[]>();
        for (const target of existingTargets) {
            if (!targetsByDistance.has(target.distance)) {
                targetsByDistance.set(target.distance, []);
            }
            targetsByDistance.get(target.distance)!.push(target);
        }

        // Track which targets have been used and their current position
        const targetUsage = new Map<string, number>(); // targetId -> next available position (0-3)

        // Create assignments
        const assignments: {
            tournament_id: string;
            archer_id: string;
            target_id: string;
            position: TargetPosition;
            turn: ShootingTurn;
            access_code: string;
        }[] = [];

        const positions: TargetPosition[] = ["A", "B", "C", "D"];
        const turns: ShootingTurn[] = ["AB", "AB", "CD", "CD"];

        // Process each group (distance + category)
        for (const [groupKey, groupArchers] of archersByGroup) {
            const [distanceStr] = groupKey.split("-");
            const distance = parseInt(distanceStr);
            const distanceTargets = targetsByDistance.get(distance) || [];

            if (distanceTargets.length === 0) {
                console.warn(`No targets configured for distance ${distance}m`);
                continue;
            }

            // Shuffle archers within the group (mixes genders randomly)
            const shuffledArchers = shuffleArray([...groupArchers]);
            const archerCount = shuffledArchers.length;

            if (archerCount === 0) continue;

            // Find available targets for this distance (sorted by usage - fill partially used first)
            const availableTargets = distanceTargets
                .map(target => ({
                    target,
                    used: targetUsage.get(target.id) || 0,
                }))
                .filter(t => t.used < 4)
                .sort((a, b) => b.used - a.used); // Partially filled targets first

            if (availableTargets.length === 0) {
                console.warn(`No available targets for ${distance}m`);
                continue;
            }

            // Calculate how many targets this group needs exclusively
            // First, check if there's a partially filled target we should complete
            let archerIndex = 0;
            let targetIndex = 0;

            // Step 1: Complete any partially filled target first (from previous category)
            if (availableTargets[0].used > 0 && availableTargets[0].used < 4) {
                const partialTarget = availableTargets[0];
                const slotsToFill = 4 - partialTarget.used;
                const archersForPartial = Math.min(slotsToFill, archerCount);

                for (let i = 0; i < archersForPartial; i++) {
                    const pos = targetUsage.get(partialTarget.target.id) || 0;
                    assignments.push({
                        tournament_id: tournamentId,
                        archer_id: shuffledArchers[archerIndex].id,
                        target_id: partialTarget.target.id,
                        position: positions[pos],
                        turn: turns[pos],
                        access_code: `T${partialTarget.target.target_number}${positions[pos]}`,
                    });
                    targetUsage.set(partialTarget.target.id, pos + 1);
                    archerIndex++;
                }
                targetIndex = 1; // Move to next target
            }

            // Step 2: Get remaining archers and empty targets
            const remainingArchers = archerCount - archerIndex;
            const emptyTargets = availableTargets.slice(targetIndex).filter(t => t.used === 0);

            if (remainingArchers > 0 && emptyTargets.length > 0) {
                // Calculate how many targets we need for remaining archers
                const targetsNeeded = Math.ceil(remainingArchers / 4);
                const targetsToUse = Math.min(targetsNeeded, emptyTargets.length);

                // Calculate balanced distribution for these targets
                const basePerTarget = Math.floor(remainingArchers / targetsToUse);
                const remainder = remainingArchers % targetsToUse;

                // Create distribution: first 'remainder' targets get base+1, rest get base
                const distribution: number[] = [];
                for (let i = 0; i < targetsToUse; i++) {
                    distribution.push(basePerTarget + (i < remainder ? 1 : 0));
                }

                // Assign archers according to distribution
                for (let t = 0; t < targetsToUse; t++) {
                    const targetInfo = emptyTargets[t];
                    const archersForThis = distribution[t];

                    for (let a = 0; a < archersForThis && archerIndex < shuffledArchers.length; a++) {
                        const pos = targetUsage.get(targetInfo.target.id) || 0;
                        assignments.push({
                            tournament_id: tournamentId,
                            archer_id: shuffledArchers[archerIndex].id,
                            target_id: targetInfo.target.id,
                            position: positions[pos],
                            turn: turns[pos],
                            access_code: `T${targetInfo.target.target_number}${positions[pos]}`,
                        });
                        targetUsage.set(targetInfo.target.id, pos + 1);
                        archerIndex++;
                    }
                }
            }

            // Log any unassigned archers
            if (archerIndex < shuffledArchers.length) {
                console.warn(`${shuffledArchers.length - archerIndex} archers unassigned at ${distance}m - not enough targets`);
            }
        }

        if (assignments.length === 0) {
            return NextResponse.json(
                { error: "No se pudieron crear asignaciones. Verifica que las distancias de los arqueros coincidan con las pacas configuradas." },
                { status: 400 }
            );
        }

        // Insert assignments
        const { data: insertedAssignments, error: assignmentsError } = await supabase
            .from("assignments")
            .insert(assignments)
            .select();

        if (assignmentsError) {
            return NextResponse.json(
                { error: "Error al crear asignaciones: " + assignmentsError.message },
                { status: 500 }
            );
        }

        // Count how many targets are actually used
        const usedTargetIds = new Set(assignments.map(a => a.target_id));

        return NextResponse.json({
            success: true,
            targets: usedTargetIds.size,
            assignments: insertedAssignments.length,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || "Error interno" },
            { status: 500 }
        );
    }
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const supabase = await createClient();

        const { data: assignments, error } = await supabase
            .from("assignments")
            .select(`
        *,
        archer:archers(*),
        target:targets(*)
      `)
            .eq("tournament_id", tournamentId)
            .order("target_id");

        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ assignments });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || "Error interno" },
            { status: 500 }
        );
    }
}
