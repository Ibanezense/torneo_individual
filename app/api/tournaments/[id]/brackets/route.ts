import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateBracket, processFirstRoundByes } from "@/lib/utils/brackets";
import type { AgeCategory, Gender } from "@/types/database";
import { enforceMutationOrigin } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

interface AssignmentArcherRow {
    id: string;
    archer:
    | {
        id: string;
        first_name: string;
        last_name: string;
        age_category: AgeCategory;
        gender: Gender;
    }
    | {
        id: string;
        first_name: string;
        last_name: string;
        age_category: AgeCategory;
        gender: Gender;
    }[]
    | null;
}

interface QualificationRoundRow {
    assignment_id: string;
    round_total: number;
    ten_plus_x_count: number;
    x_count: number;
}

// GET - List brackets for a tournament
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: tournamentId } = await params;
        const supabase = await createClient();

        const { data: brackets, error } = await supabase
            .from("elimination_brackets")
            .select(`
                *,
                matches:elimination_matches(
                    *,
                    archer1:archers!elimination_matches_archer1_id_fkey(id, first_name, last_name, club, division),
                    archer2:archers!elimination_matches_archer2_id_fkey(id, first_name, last_name, club, division),
                    target:targets(id, target_number, distance)
                )
            `)
            .eq("tournament_id", tournamentId)
            .order("category")
            .order("gender");

        if (error) {
            console.error("Error fetching brackets:", error);
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ brackets: brackets || [] });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Error interno";
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}

// POST - Generate brackets for a tournament
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const forbiddenResponse = enforceMutationOrigin(request);
        if (forbiddenResponse) return forbiddenResponse;

        const { id: tournamentId } = await params;
        const supabase = await createClient();
        const body = await request.json();

        const { category, gender, topN } = body as {
            category: AgeCategory;
            gender: Gender;
            topN?: number; // Optional: only take top N archers
        };

        if (!category || !gender) {
            return NextResponse.json(
                { error: "Categoría y género son requeridos" },
                { status: 400 }
            );
        }

        // Get tournament
        const { data: tournament, error: tournamentError } = await supabase
            .from("tournaments")
            .select("id, qualification_arrows")
            .eq("id", tournamentId)
            .single();

        if (tournamentError || !tournament) {
            return NextResponse.json(
                { error: "Torneo no encontrado" },
                { status: 404 }
            );
        }

        // Get ranked archers for this category/gender
        const { data: assignments, error: assignmentsError } = await supabase
            .from("assignments")
            .select(`
                id,
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

        // Filter by category and gender
        const assignmentRows = (assignments || []) as AssignmentArcherRow[];
        const filteredAssignments = assignmentRows.filter((assignment) => {
            const archer = Array.isArray(assignment.archer)
                ? assignment.archer[0]
                : assignment.archer;

            if (!archer) return false;
            return archer.age_category === category && archer.gender === gender;
        });

        if (filteredAssignments.length < 2) {
            return NextResponse.json(
                { error: `Se necesitan al menos 2 arqueros en ${category} ${gender}` },
                { status: 400 }
            );
        }

        // Get aggregated qualification rounds to avoid the 1000-row limit on qualification_scores
        const assignmentIds = filteredAssignments.map((assignment) => assignment.id);
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

        // Calculate totals
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

        // Build ranked archers
        const rankedArchers = filteredAssignments.flatMap((assignment) => {
            const archer = Array.isArray(assignment.archer)
                ? assignment.archer[0]
                : assignment.archer;
            if (!archer) return [];

            const stats = scoresByAssignment.get(assignment.id) || { total: 0, tenPlusX: 0, x: 0 };
            return {
                archerId: archer.id,
                firstName: archer.first_name,
                lastName: archer.last_name,
                totalScore: stats.total,
                tenPlusXCount: stats.tenPlusX,
                xCount: stats.x,
                seed: 0,
            };
        });

        // Sort by score
        rankedArchers.sort((a, b) => {
            if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
            if (b.tenPlusXCount !== a.tenPlusXCount) return b.tenPlusXCount - a.tenPlusXCount;
            return b.xCount - a.xCount;
        });

        // Limit to topN if specified
        const archersForBracket = topN ? rankedArchers.slice(0, topN) : rankedArchers;

        // Generate bracket
        const generatedBracket = generateBracket(archersForBracket, category, gender);
        const processedMatches = processFirstRoundByes(generatedBracket.matches);

        // Check if bracket already exists
        const { data: existingBracket } = await supabase
            .from("elimination_brackets")
            .select("id")
            .eq("tournament_id", tournamentId)
            .eq("category", category)
            .eq("gender", gender)
            .single();

        if (existingBracket) {
            // Delete existing matches and bracket
            await supabase
                .from("elimination_matches")
                .delete()
                .eq("bracket_id", existingBracket.id);

            await supabase
                .from("elimination_brackets")
                .delete()
                .eq("id", existingBracket.id);
        }

        // Insert bracket
        const { data: newBracket, error: bracketError } = await supabase
            .from("elimination_brackets")
            .insert({
                tournament_id: tournamentId,
                category,
                gender,
                bracket_size: generatedBracket.bracketSize,
                current_round: 1,
                is_completed: false,
            })
            .select()
            .single();

        if (bracketError || !newBracket) {
            return NextResponse.json(
                { error: bracketError?.message || "Error creando bracket" },
                { status: 500 }
            );
        }

        // Insert matches
        const matchInserts = processedMatches.map((match) => {
            const autoWinnerId =
                (match.archer1Id && !match.archer2Id ? match.archer1Id : null) ??
                (match.archer2Id && !match.archer1Id ? match.archer2Id : null);
            const isRoundOne = match.roundNumber === 1;
            const isClosedMatch = isRoundOne && Boolean(autoWinnerId);

            return {
                bracket_id: newBracket.id,
                round_number: match.roundNumber,
                match_position: match.matchPosition,
                archer1_id: match.archer1Id,
                archer2_id: match.archer2Id,
                archer1_seed: match.archer1Seed,
                archer2_seed: match.archer2Seed,
                archer1_set_points: 0,
                archer2_set_points: 0,
                status: isClosedMatch ? "completed" : "pending",
                winner_id: isClosedMatch ? autoWinnerId : null,
            };
        });

        const { error: matchesError } = await supabase
            .from("elimination_matches")
            .insert(matchInserts);

        if (matchesError) {
            return NextResponse.json(
                { error: matchesError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            bracket: newBracket,
            matchCount: matchInserts.length,
            archerCount: archersForBracket.length,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Error interno";
        console.error("Error generating brackets:", error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
