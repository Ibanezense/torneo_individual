import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateBracket, processFirstRoundByes } from "@/lib/utils/brackets";
import type { AgeCategory, Gender } from "@/types/database";

export const dynamic = "force-dynamic";

interface ArcherWithStats {
    archerId: string;
    firstName: string;
    lastName: string;
    ageCategory: AgeCategory;
    gender: Gender;
    distance: number;
    totalScore: number;
    tenPlusXCount: number;
    xCount: number;
    seed: number;
}

// POST - Generate ALL brackets for a tournament (grouped by category + distance only)
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
            .select("id, name, qualification_arrows")
            .eq("id", tournamentId)
            .single();

        if (tournamentError || !tournament) {
            return NextResponse.json(
                { error: "Torneo no encontrado" },
                { status: 404 }
            );
        }

        // Get ALL assignments with archer details and target distance
        const { data: assignments, error: assignmentsError } = await supabase
            .from("assignments")
            .select(`
                id,
                target:targets(distance),
                archer:archers!inner(
                    id,
                    first_name,
                    last_name,
                    age_category,
                    gender
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

        // Get ALL scores
        const assignmentIds = assignments.map((a: any) => a.id);
        const { data: scores } = await supabase
            .from("qualification_scores")
            .select("assignment_id, score")
            .in("assignment_id", assignmentIds)
            .not("score", "is", null);

        // Calculate totals by assignment
        const scoresByAssignment = new Map<string, { total: number; tenPlusX: number; x: number }>();
        for (const score of scores || []) {
            if (!scoresByAssignment.has(score.assignment_id)) {
                scoresByAssignment.set(score.assignment_id, { total: 0, tenPlusX: 0, x: 0 });
            }
            const stats = scoresByAssignment.get(score.assignment_id)!;
            const val = score.score === 11 ? 10 : score.score;
            stats.total += val;
            if (score.score === 10 || score.score === 11) stats.tenPlusX++;
            if (score.score === 11) stats.x++;
        }

        // Build archer list with all info
        const allArchers: ArcherWithStats[] = assignments.map((a: any) => {
            const archer = a.archer;
            const distance = a.target?.distance || 0;
            const stats = scoresByAssignment.get(a.id) || { total: 0, tenPlusX: 0, x: 0 };
            return {
                archerId: archer.id,
                firstName: archer.first_name,
                lastName: archer.last_name,
                ageCategory: archer.age_category,
                gender: archer.gender,
                distance,
                totalScore: stats.total,
                tenPlusXCount: stats.tenPlusX,
                xCount: stats.x,
                seed: 0,
            };
        });

        // Group archers by: category + distance (gender mixed)
        const groups = new Map<string, ArcherWithStats[]>();
        for (const archer of allArchers) {
            const key = `${archer.ageCategory}|${archer.distance}`;
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(archer);
        }

        // Delete existing brackets for this tournament
        const { data: existingBrackets } = await supabase
            .from("elimination_brackets")
            .select("id")
            .eq("tournament_id", tournamentId);

        if (existingBrackets && existingBrackets.length > 0) {
            const bracketIds = existingBrackets.map(b => b.id);

            // Delete matches first
            await supabase
                .from("elimination_matches")
                .delete()
                .in("bracket_id", bracketIds);

            // Delete brackets
            await supabase
                .from("elimination_brackets")
                .delete()
                .eq("tournament_id", tournamentId);
        }

        // Generate brackets for each group with >= 2 archers
        const results: {
            category: AgeCategory;
            gender: Gender;
            distance: number;
            archerCount: number;
            bracketSize: number;
            matchCount: number;
            targetsAssigned: number;
        }[] = [];

        for (const [key, archers] of groups) {
            if (archers.length < 2) {
                console.log(`Skipping group ${key}: only ${archers.length} archer(s)`);
                continue;
            }

            const [category, distanceStr] = key.split("|");
            const distance = parseInt(distanceStr);
            const gender = "male" as Gender; // Mixed bracket, use male as default for DB

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
                gender as Gender
            );
            const processedMatches = processFirstRoundByes(generatedBracket.matches);

            // Insert bracket
            const { data: newBracket, error: bracketError } = await supabase
                .from("elimination_brackets")
                .insert({
                    tournament_id: tournamentId,
                    category: category as AgeCategory,
                    gender: gender as Gender,
                    bracket_size: generatedBracket.bracketSize,
                    current_round: 1,
                    is_completed: false,
                })
                .select()
                .single();

            if (bracketError || !newBracket) {
                console.error(`Error creating bracket for ${key}:`, bracketError);
                continue;
            }

            // Get the highest target number to create new sequential targets for elimination
            const { data: maxTargetResult } = await supabase
                .from("targets")
                .select("target_number")
                .eq("tournament_id", tournamentId)
                .order("target_number", { ascending: false })
                .limit(1)
                .single();

            let nextTargetNumber = (maxTargetResult?.target_number || 0) + 1;

            // Get ALL non-bye matches for target assignment (all rounds)
            const allNonByeMatches = processedMatches.filter(m => !m.isBye);

            // Create targets for ALL matches and map them
            const matchTargetMap = new Map<string, string>(); // key: "round-position"

            for (const match of allNonByeMatches) {
                const { data: newTarget, error: targetError } = await supabase
                    .from("targets")
                    .insert({
                        tournament_id: tournamentId,
                        target_number: nextTargetNumber,
                        distance: distance,
                        current_status: "inactive",
                    })
                    .select("id")
                    .single();

                if (!targetError && newTarget) {
                    matchTargetMap.set(`${match.roundNumber}-${match.matchPosition}`, newTarget.id);
                    nextTargetNumber++;
                }
            }

            // Also create target for bronze medal match
            const { data: bronzeTarget } = await supabase
                .from("targets")
                .insert({
                    tournament_id: tournamentId,
                    target_number: nextTargetNumber,
                    distance: distance,
                    current_status: "inactive",
                })
                .select("id")
                .single();

            const bronzeTargetId = bronzeTarget?.id || null;
            if (bronzeTarget) nextTargetNumber++;

            // Insert matches with target assignments for ALL rounds
            const matchInserts = processedMatches.map((match) => ({
                bracket_id: newBracket.id,
                round_number: match.roundNumber,
                match_position: match.matchPosition,
                archer1_id: match.archer1Id,
                archer2_id: match.archer2Id,
                archer1_seed: match.archer1Seed,
                archer2_seed: match.archer2Seed,
                archer1_set_points: 0,
                archer2_set_points: 0,
                status: match.isBye ? "completed" : "pending",
                winner_id: match.isBye ? (match.archer1Id || match.archer2Id) : null,
                target_id: match.isBye
                    ? null
                    : (matchTargetMap.get(`${match.roundNumber}-${match.matchPosition}`) || null),
            }));

            // Add bronze medal match (round_number = 0 as special indicator)
            // Only add if bracket has semifinals (bracketSize >= 4)
            if (generatedBracket.bracketSize >= 4) {
                matchInserts.push({
                    bracket_id: newBracket.id,
                    round_number: 0, // Special: bronze match
                    match_position: 1,
                    archer1_id: null as any,
                    archer2_id: null as any,
                    archer1_seed: null as any,
                    archer2_seed: null as any,
                    archer1_set_points: 0,
                    archer2_set_points: 0,
                    status: "pending",
                    winner_id: null,
                    target_id: bronzeTargetId,
                });
            }

            const { error: matchesError } = await supabase
                .from("elimination_matches")
                .insert(matchInserts);

            if (matchesError) {
                console.error(`Error creating matches for ${key}:`, matchesError);
                continue;
            }

            results.push({
                category: category as AgeCategory,
                gender: gender as Gender,
                distance,
                archerCount: archers.length,
                bracketSize: generatedBracket.bracketSize,
                matchCount: matchInserts.length,
                targetsAssigned: allNonByeMatches.length + (generatedBracket.bracketSize >= 4 ? 1 : 0),
            });
        }

        if (results.length === 0) {
            return NextResponse.json(
                { error: "No se pudieron generar brackets. Se necesitan al menos 2 arqueros por categoría/distancia." },
                { status: 400 }
            );
        }

        return NextResponse.json({
            success: true,
            bracketsGenerated: results.length,
            brackets: results,
            totalArchers: results.reduce((sum, r) => sum + r.archerCount, 0),
            totalMatches: results.reduce((sum, r) => sum + r.matchCount, 0),
        });
    } catch (error: any) {
        console.error("Error generating all brackets:", error);
        return NextResponse.json(
            { error: error.message || "Error interno" },
            { status: 500 }
        );
    }
}
