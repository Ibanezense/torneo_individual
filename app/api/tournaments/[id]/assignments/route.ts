import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Archer, Target, TargetPosition, ShootingTurn } from "@/types/database";
import { enforceMutationOrigin } from "@/lib/security/origin";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

interface AssignmentInsertInput {
    tournament_id: string;
    archer_id: string;
    target_id: string;
    position: TargetPosition;
    turn: ShootingTurn;
    access_code: string;
}

type ManualAssignmentInput = AssignmentInsertInput;

function buildAssignmentAccessCode(
    _tournamentId: string,
    targetNumber: number,
    _position: TargetPosition
): string {
    void _tournamentId;
    void _position;
    return `T${targetNumber}`;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const forbiddenResponse = enforceMutationOrigin(request);
        if (forbiddenResponse) return forbiddenResponse;

        const { id: tournamentId } = await params;
        const supabase = await createClient();

        const { data: tournament, error: tournamentError } = await supabase
            .from("tournaments")
            .select("*")
            .eq("id", tournamentId)
            .single();

        if (tournamentError || !tournament) {
            return NextResponse.json({ error: "Torneo no encontrado" }, { status: 404 });
        }

        const { data: participantRows, error: participantsError } = await supabase
            .from("tournament_participants")
            .select("archer_id")
            .eq("tournament_id", tournamentId);

        if (participantsError) {
            return NextResponse.json({ error: "Error al obtener participantes del torneo" }, { status: 500 });
        }

        const participantIds = new Set(
            (participantRows || []).map((row: { archer_id: string }) => row.archer_id)
        );

        const body = (await request.json()) as {
            archerIds?: string[];
            assignments?: ManualAssignmentInput[];
        };

        if (Array.isArray(body.assignments)) {
            const desiredAssignments = body.assignments.filter(
                (assignment): assignment is ManualAssignmentInput =>
                    Boolean(
                        assignment &&
                            assignment.tournament_id === tournamentId &&
                            typeof assignment.archer_id === "string" &&
                            typeof assignment.target_id === "string" &&
                            typeof assignment.position === "string" &&
                            typeof assignment.turn === "string" &&
                            typeof assignment.access_code === "string"
                    )
            );

            const invalidAssignmentArchers = desiredAssignments
                .map((assignment) => assignment.archer_id)
                .filter((archerId) => !participantIds.has(archerId));

            if (invalidAssignmentArchers.length > 0) {
                return NextResponse.json(
                    {
                        error: "Hay asignaciones con arqueros que no fueron marcados como participantes del torneo.",
                        invalidArcherIds: Array.from(new Set(invalidAssignmentArchers)),
                    },
                    { status: 400 }
                );
            }

            const persistResult = await reconcileAssignments(supabase, tournamentId, desiredAssignments);
            if (!persistResult.success) {
                return NextResponse.json({ error: persistResult.error }, { status: 400 });
            }

            return NextResponse.json({
                success: true,
                assignments: desiredAssignments.length,
            });
        }

        const archerIds = Array.isArray(body.archerIds)
            ? body.archerIds.filter((id): id is string => typeof id === "string" && id.length > 0)
            : [];

        if (archerIds.length === 0) {
            return NextResponse.json({ error: "No se seleccionaron arqueros" }, { status: 400 });
        }

        if (participantIds.size === 0) {
            return NextResponse.json(
                { error: "No hay participantes marcados para este torneo. Seleccionalos en la pantalla de Arqueros." },
                { status: 400 }
            );
        }

        const nonParticipantIds = archerIds.filter((archerId) => !participantIds.has(archerId));
        if (nonParticipantIds.length > 0) {
            return NextResponse.json(
                {
                    error: "Incluiste arqueros que no fueron marcados como participantes del torneo.",
                    invalidArcherIds: nonParticipantIds,
                },
                { status: 400 }
            );
        }

        const { data: archers, error: archersError } = await supabase
            .from("archers")
            .select("*")
            .in("id", archerIds);

        if (archersError || !archers) {
            return NextResponse.json({ error: "Error al obtener arqueros" }, { status: 500 });
        }

        if (archers.length !== archerIds.length) {
            const foundIds = new Set(archers.map((archer) => archer.id));
            const missing = archerIds.filter((id) => !foundIds.has(id));
            return NextResponse.json(
                {
                    error: "Algunos arqueros no existen en la base de datos",
                    missingArcherIds: missing,
                },
                { status: 400 }
            );
        }

        const { data: existingTargets, error: targetsError } = await supabase
            .from("targets")
            .select("*")
            .eq("tournament_id", tournamentId)
            .order("target_number");

        if (targetsError) {
            return NextResponse.json({ error: "Error al obtener pacas" }, { status: 500 });
        }

        if (!existingTargets || existingTargets.length === 0) {
            return NextResponse.json(
                { error: "No hay pacas configuradas. Configura las pacas primero." },
                { status: 400 }
            );
        }

        const archersByGroup = new Map<string, Archer[]>();
        for (const archer of archers) {
            const division = archer.division || "recurvo";
            const key = `${archer.distance}|${archer.age_category}|${division}`;
            if (!archersByGroup.has(key)) {
                archersByGroup.set(key, []);
            }
            archersByGroup.get(key)!.push(archer);
        }

        const targetsByDistance = new Map<number, Target[]>();
        for (const target of existingTargets) {
            if (!targetsByDistance.has(target.distance)) {
                targetsByDistance.set(target.distance, []);
            }
            targetsByDistance.get(target.distance)!.push(target);
        }

        const targetUsage = new Map<string, number>();
        const assignments: AssignmentInsertInput[] = [];
        const unassignedArchers: Archer[] = [];

        const positions: TargetPosition[] = ["A", "B", "C", "D"];
        const turns: ShootingTurn[] = ["AB", "AB", "CD", "CD"];

        for (const [groupKey, groupArchers] of archersByGroup) {
            const [distanceStr] = groupKey.split("|");
            const distance = parseInt(distanceStr, 10);
            const distanceTargets = targetsByDistance.get(distance) || [];

            if (distanceTargets.length === 0) {
                console.warn(`No targets configured for distance ${distance}m`);
                unassignedArchers.push(...groupArchers);
                continue;
            }

            const shuffledArchers = shuffleArray([...groupArchers]);
            const archerCount = shuffledArchers.length;
            if (archerCount === 0) continue;

            const availableTargets = distanceTargets
                .map((target) => ({
                    target,
                    used: targetUsage.get(target.id) || 0,
                }))
                .filter((item) => item.used < 4)
                .sort((a, b) => b.used - a.used);

            if (availableTargets.length === 0) {
                console.warn(`No available targets for ${distance}m`);
                unassignedArchers.push(...groupArchers);
                continue;
            }

            for (const archer of shuffledArchers) {
                const targetEntry = availableTargets.find((entry) => entry.used < 4);
                if (!targetEntry) {
                    unassignedArchers.push(archer);
                    continue;
                }

                const slotIndex = targetEntry.used;
                const position = positions[slotIndex];
                const turn = turns[slotIndex];

                if (!position || !turn) {
                    unassignedArchers.push(archer);
                    continue;
                }

                assignments.push({
                    tournament_id: tournamentId,
                    archer_id: archer.id,
                    target_id: targetEntry.target.id,
                    position,
                    turn,
                    access_code: buildAssignmentAccessCode(
                        tournamentId,
                        targetEntry.target.target_number,
                        position
                    ),
                });

                targetEntry.used += 1;
                targetUsage.set(targetEntry.target.id, targetEntry.used);
            }
        }

        if (assignments.length === 0 || unassignedArchers.length > 0) {
            const details = unassignedArchers.slice(0, 10).map((archer) => ({
                id: archer.id,
                name: `${archer.first_name} ${archer.last_name}`,
                distance: archer.distance,
                category: archer.age_category,
                division: archer.division,
            }));

            return NextResponse.json(
                {
                    error: "No hay suficientes pacas para asignar a todos los arqueros seleccionados.",
                    unassignedCount: unassignedArchers.length,
                    details,
                },
                { status: 400 }
            );
        }

        const persistResult = await reconcileAssignments(supabase, tournamentId, assignments);
        if (!persistResult.success) {
            return NextResponse.json({ error: persistResult.error }, { status: 500 });
        }

        const usedTargetIds = new Set(assignments.map((assignment) => assignment.target_id));

        return NextResponse.json({
            success: true,
            targets: usedTargetIds.size,
            assignments: assignments.length,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Error interno";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const supabase = await createClient();

        const { data: assignments, error } = await supabase
            .from("assignments")
            .select(
                `
        *,
        archer:archers(*),
        target:targets(*)
      `
            )
            .eq("tournament_id", tournamentId)
            .order("target_id");

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ assignments });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Error interno";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

async function reconcileAssignments(
    supabase: ServerSupabaseClient,
    tournamentId: string,
    desiredAssignments: AssignmentInsertInput[]
): Promise<{ success: true } | { success: false; error: string }> {
    const { error } = await supabase.rpc("admin_replace_tournament_assignments", {
        p_tournament_id: tournamentId,
        p_assignments: desiredAssignments.map((assignment) => ({
            archer_id: assignment.archer_id,
            target_id: assignment.target_id,
            position: assignment.position,
            turn: assignment.turn,
            access_code: assignment.access_code,
        })),
    });

    if (error) {
        return {
            success: false,
            error: error.message,
        };
    }

    return { success: true };
}
