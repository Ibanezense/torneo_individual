import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateBracket, processFirstRoundByes } from "@/lib/utils/brackets";
import type { AgeCategory, Gender, TournamentDivision } from "@/types/database";
import { enforceMutationOrigin } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

interface ArcherWithStats {
    archerId: string;
    firstName: string;
    lastName: string;
    ageCategory: AgeCategory;
    gender: Gender;
    division: TournamentDivision;
    distance: number;
    totalScore: number;
    tenPlusXCount: number;
    xCount: number;
    seed: number;
}

interface AssignmentRow {
    id: string;
    archer:
    | {
        id: string;
        first_name: string;
        last_name: string;
        age_category: AgeCategory;
        gender: Gender;
        division: TournamentDivision;
        distance: number;
    }
    | {
        id: string;
        first_name: string;
        last_name: string;
        age_category: AgeCategory;
        gender: Gender;
        division: TournamentDivision;
        distance: number;
    }[]
    | null;
}

interface QualificationRoundRow {
    assignment_id: string;
    round_total: number;
    ten_plus_x_count: number;
    x_count: number;
}

interface TournamentTargetRow {
    id: string;
    target_number: number;
}

interface BracketGroupingConfig {
    splitByGender: boolean;
    splitByDivision: boolean;
}

function buildBracketGroupKey(
    archer: Pick<ArcherWithStats, "ageCategory" | "distance" | "gender" | "division">,
    config: BracketGroupingConfig
): string {
    return [
        archer.ageCategory,
        String(archer.distance),
        config.splitByGender ? archer.gender : "mixed",
        config.splitByDivision ? archer.division : "mixed",
    ].join("|");
}

// POST - Generate ALL brackets for a tournament (grouped by category + distance)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const forbiddenResponse = enforceMutationOrigin(request);
        if (forbiddenResponse) return forbiddenResponse;

        const { id: tournamentId } = await params;
        const supabase = await createClient();

        // Get tournament
        const { data: tournament, error: tournamentError } = await supabase
            .from("tournaments")
            .select("id, name, qualification_arrows, distances, categories, divisions, split_brackets_by_gender, split_brackets_by_division")
            .eq("id", tournamentId)
            .single();

        if (tournamentError || !tournament) {
            return NextResponse.json(
                { error: "Torneo no encontrado" },
                { status: 404 }
            );
        }

        // Get ALL assignments with archer details
        const { data: assignments, error: assignmentsError } = await supabase
            .from("assignments")
            .select(`
                id,
                archer:archers!inner(
                    id,
                    first_name,
                    last_name,
                    age_category,
                    gender,
                    division,
                    distance
                )
            `)
            .eq("tournament_id", tournamentId);

        if (assignmentsError) {
            return NextResponse.json(
                { error: assignmentsError.message },
                { status: 500 }
            );
        }

        if (!assignments || assignments.length === 0) {
            return NextResponse.json(
                { error: "No hay arqueros asignados en este torneo" },
                { status: 400 }
            );
        }

        // Get aggregated qualification rounds to avoid the 1000-row limit on qualification_scores
        const assignmentRows = assignments as AssignmentRow[];
        const assignmentIds = assignmentRows.map((assignment) => assignment.id);
        const { data: qualificationRounds, error: qualificationRoundsError } = await supabase
            .from("qualification_rounds")
            .select("assignment_id, round_total, ten_plus_x_count, x_count")
            .in("assignment_id", assignmentIds);

        if (qualificationRoundsError) {
            return NextResponse.json(
                { error: qualificationRoundsError.message },
                { status: 500 }
            );
        }

        // Calculate totals by assignment using aggregated round rows
        const scoresByAssignment = new Map<string, { total: number; tenPlusX: number; x: number }>();
        for (const round of (qualificationRounds || []) as QualificationRoundRow[]) {
            if (!scoresByAssignment.has(round.assignment_id)) {
                scoresByAssignment.set(round.assignment_id, { total: 0, tenPlusX: 0, x: 0 });
            }
            const stats = scoresByAssignment.get(round.assignment_id)!;
            stats.total += round.round_total || 0;
            stats.tenPlusX += round.ten_plus_x_count || 0;
            stats.x += round.x_count || 0;
        }

        const configuredCategories = Array.isArray(tournament.categories) && tournament.categories.length > 0
            ? (tournament.categories as AgeCategory[])
            : [];
        const configuredDivisions = Array.isArray(tournament.divisions) && tournament.divisions.length > 0
            ? (tournament.divisions as TournamentDivision[])
            : [];
        const configuredDistances = Array.isArray(tournament.distances) && tournament.distances.length > 0
            ? tournament.distances
            : [];
        const groupingConfig: BracketGroupingConfig = {
            splitByGender: Boolean(tournament.split_brackets_by_gender),
            splitByDivision: Boolean(tournament.split_brackets_by_division),
        };

        // Build archer list with all info
        const allArchers: ArcherWithStats[] = assignmentRows.flatMap((assignment) => {
            const archer = Array.isArray(assignment.archer)
                ? assignment.archer[0]
                : assignment.archer;
            if (!archer) return [];

            const stats = scoresByAssignment.get(assignment.id) || { total: 0, tenPlusX: 0, x: 0 };
            return {
                archerId: archer.id,
                firstName: archer.first_name,
                lastName: archer.last_name,
                ageCategory: archer.age_category,
                gender: archer.gender,
                division: archer.division,
                distance: archer.distance,
                totalScore: stats.total,
                tenPlusXCount: stats.tenPlusX,
                xCount: stats.x,
                seed: 0,
            };
        });

        const eligibleArchers = allArchers.filter((archer) => {
            const categoryAllowed =
                configuredCategories.length === 0 || configuredCategories.includes(archer.ageCategory);
            const divisionAllowed =
                configuredDivisions.length === 0 || configuredDivisions.includes(archer.division);
            const distanceAllowed =
                configuredDistances.length === 0 || configuredDistances.includes(archer.distance);

            return categoryAllowed && divisionAllowed && distanceAllowed;
        });

        // Group archers by the tournament bracket config.
        const groups = new Map<string, ArcherWithStats[]>();
        for (const archer of eligibleArchers) {
            const key = buildBracketGroupKey(archer, groupingConfig);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(archer);
        }

        // Resolve stale elimination targets before assigning new target numbers.
        const { data: existingBrackets } = await supabase
            .from("elimination_brackets")
            .select("id")
            .eq("tournament_id", tournamentId);

        const bracketIds = (existingBrackets || []).map((bracket) => bracket.id);
        let safeTargetIdsToDelete: string[] = [];

        const { data: tournamentTargets } = await supabase
            .from("targets")
            .select("id, target_number")
            .eq("tournament_id", tournamentId)
            .order("target_number");

        if (existingBrackets && existingBrackets.length > 0) {
            const { data: existingMatchTargets } = await supabase
                .from("elimination_matches")
                .select("target_id")
                .in("bracket_id", bracketIds)
                .not("target_id", "is", null);

            const targetIdsToDelete = Array.from(
                new Set(
                    (existingMatchTargets || [])
                        .map((match) => match.target_id)
                        .filter((targetId): targetId is string => Boolean(targetId))
                )
            );

            if (targetIdsToDelete.length > 0) {
                const { data: assignedTargets } = await supabase
                    .from("assignments")
                    .select("target_id")
                    .in("target_id", targetIdsToDelete);

                const protectedTargetIds = new Set(
                    (assignedTargets || [])
                        .map((assignment) => assignment.target_id)
                        .filter((targetId): targetId is string => Boolean(targetId))
                );

                safeTargetIdsToDelete = targetIdsToDelete.filter(
                    (targetId) => !protectedTargetIds.has(targetId)
                );
            }
        }

        let nextTargetNumber =
            (((tournamentTargets || []) as TournamentTargetRow[])
                .filter((target) => !safeTargetIdsToDelete.includes(target.id))
                .reduce((maxValue, target) => Math.max(maxValue, target.target_number), 0)) + 1;

        // Generate brackets for each group with >= 2 archers
        const results: {
            category: AgeCategory;
            distance: number;
            gender?: Gender;
            division?: TournamentDivision;
            archerCount: number;
            bracketSize: number;
            matchCount: number;
            targetsAssigned: number;
        }[] = [];
        const targetInserts: Array<{
            id: string;
            target_number: number;
            distance: number;
            current_status: "inactive";
        }> = [];
        const bracketInserts: Array<{
            id: string;
            category: AgeCategory;
            gender: Gender;
            division: TournamentDivision;
            bracket_size: number;
            current_round: number;
            is_completed: boolean;
        }> = [];
        const matchInserts: Array<{
            id: string;
            bracket_id: string;
            round_number: number;
            match_position: number;
            archer1_id: string | null;
            archer2_id: string | null;
            archer1_seed: number | null;
            archer2_seed: number | null;
            archer1_set_points: number;
            archer2_set_points: number;
            status: "pending" | "completed";
            winner_id: string | null;
            target_id: string | null;
        }> = [];

        for (const [key, archers] of groups) {
            if (archers.length < 2) {
                console.log(`Skipping group ${key}: only ${archers.length} archer(s)`);
                continue;
            }

            const [category, distanceStr, groupGender, groupDivision] = key.split("|");
            const distance = parseInt(distanceStr, 10);
            const bracketGender: Gender = groupingConfig.splitByGender
                ? ((groupGender as Gender) || archers[0]?.gender || "male")
                : (archers[0]?.gender ?? "male");
            const bracketDivision: TournamentDivision = groupingConfig.splitByDivision
                ? ((groupDivision as TournamentDivision) || archers[0]?.division || "recurvo")
                : (archers[0]?.division ?? "recurvo");

            // Sort archers by score (descending), then by 10+X, then by X
            archers.sort((a, b) => {
                if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
                if (b.tenPlusXCount !== a.tenPlusXCount) return b.tenPlusXCount - a.tenPlusXCount;
                return b.xCount - a.xCount;
            });

            // Assign seeds
            archers.forEach((a, i) => { a.seed = i + 1; });

            // Generate bracket
            const generatedBracket = generateBracket(
                archers.map(a => ({
                    archerId: a.archerId,
                    firstName: a.firstName,
                    lastName: a.lastName,
                    totalScore: a.totalScore,
                    tenPlusXCount: a.tenPlusXCount,
                    xCount: a.xCount,
                    seed: a.seed,
                })),
                category as AgeCategory,
                bracketGender
            );
            const processedMatches = processFirstRoundByes(generatedBracket.matches);
            const bracketId = crypto.randomUUID();

            bracketInserts.push({
                id: bracketId,
                category: category as AgeCategory,
                gender: bracketGender,
                division: bracketDivision,
                bracket_size: generatedBracket.bracketSize,
                current_round: 1,
                is_completed: false,
            });

            // Get ALL non-bye matches for target assignment (all rounds)
            const allNonByeMatches = processedMatches.filter(m => !m.isBye);

            // Create targets for ALL matches and map them
            const matchTargetMap = new Map<string, string>(); // key: "round-position"

            for (const match of allNonByeMatches) {
                const targetId = crypto.randomUUID();
                targetInserts.push({
                    id: targetId,
                    target_number: nextTargetNumber,
                    distance,
                    current_status: "inactive",
                });
                matchTargetMap.set(`${match.roundNumber}-${match.matchPosition}`, targetId);
                nextTargetNumber++;
            }

            // Also create target for bronze medal match
            const bronzeTargetId = crypto.randomUUID();
            targetInserts.push({
                id: bronzeTargetId,
                target_number: nextTargetNumber,
                distance,
                current_status: "inactive",
            });
            nextTargetNumber++;

            // Insert matches with target assignments for ALL rounds
            const groupMatchInserts: typeof matchInserts = processedMatches.map((match) => {
                const autoWinnerId =
                    (match.archer1Id && !match.archer2Id ? match.archer1Id : null) ??
                    (match.archer2Id && !match.archer1Id ? match.archer2Id : null);
                const hasAnyArcher = Boolean(match.archer1Id || match.archer2Id);
                const isRoundOne = match.roundNumber === 1;
                const isClosedMatch = !hasAnyArcher || (isRoundOne && Boolean(autoWinnerId));

                return {
                    id: crypto.randomUUID(),
                    bracket_id: bracketId,
                    round_number: match.roundNumber,
                    match_position: match.matchPosition,
                    archer1_id: match.archer1Id,
                    archer2_id: match.archer2Id,
                    archer1_seed: match.archer1Seed,
                    archer2_seed: match.archer2Seed,
                    archer1_set_points: 0,
                    archer2_set_points: 0,
                    status: (isClosedMatch ? "completed" : "pending") as "completed" | "pending",
                    winner_id: isClosedMatch ? autoWinnerId : null,
                    target_id: match.isBye
                        ? null
                        : (matchTargetMap.get(`${match.roundNumber}-${match.matchPosition}`) || null),
                };
            });

            // Add bronze medal match (round_number = 0 as special indicator)
            // Only add if bracket has semifinals (bracketSize >= 4)
            if (generatedBracket.bracketSize >= 4) {
                groupMatchInserts.push({
                    id: crypto.randomUUID(),
                    bracket_id: bracketId,
                    round_number: 0, // Special: bronze match
                    match_position: 1,
                    archer1_id: null,
                    archer2_id: null,
                    archer1_seed: null,
                    archer2_seed: null,
                    archer1_set_points: 0,
                    archer2_set_points: 0,
                    status: "pending",
                    winner_id: null,
                    target_id: bronzeTargetId,
                });
            } else {
                targetInserts.pop();
            }

            matchInserts.push(...groupMatchInserts);

            results.push({
                category: category as AgeCategory,
                distance,
                gender: groupingConfig.splitByGender ? bracketGender : undefined,
                division: groupingConfig.splitByDivision ? bracketDivision : undefined,
                archerCount: archers.length,
                bracketSize: generatedBracket.bracketSize,
                matchCount: groupMatchInserts.length,
                targetsAssigned: allNonByeMatches.length + (generatedBracket.bracketSize >= 4 ? 1 : 0),
            });
        }

        if (results.length === 0) {
            return NextResponse.json(
                { error: "No se pudieron generar brackets. Se necesitan al menos 2 arqueros por categoria y distancia." },
                { status: 400 }
            );
        }

        const { error: replaceError } = await supabase.rpc("admin_replace_tournament_brackets", {
            p_tournament_id: tournamentId,
            p_brackets: bracketInserts,
            p_targets: targetInserts,
            p_matches: matchInserts,
            p_stale_target_ids: safeTargetIdsToDelete,
        });

        if (replaceError) {
            return NextResponse.json(
                { error: replaceError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            bracketsGenerated: results.length,
            brackets: results,
            totalArchers: results.reduce((sum, r) => sum + r.archerCount, 0),
            totalMatches: results.reduce((sum, r) => sum + r.matchCount, 0),
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Error interno";
        console.error("Error generating all brackets:", error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}


