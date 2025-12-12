// Assignment algorithm - distributes archers to targets
import type { Archer, Target, Assignment, AgeCategory, Gender, TargetPosition, ShootingTurn } from "@/types/database";
import { getDistance } from "@/lib/constants/categories";

interface ArcherWithDistance extends Archer {
    distance: number;
}

interface AssignmentResult {
    archer_id: string;
    target_number: number;
    position: TargetPosition;
    turn: ShootingTurn;
    distance: number;
}

/**
 * Groups archers by category, gender, and distance
 */
function groupArchers(
    archers: Archer[],
    tournamentType: "indoor" | "outdoor"
): Map<string, ArcherWithDistance[]> {
    const groups = new Map<string, ArcherWithDistance[]>();

    for (const archer of archers) {
        const distance = getDistance(archer.age_category, tournamentType);
        const key = `${archer.age_category}-${archer.gender}-${distance}`;

        const archerWithDistance: ArcherWithDistance = {
            ...archer,
            distance,
        };

        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(archerWithDistance);
    }

    return groups;
}

/**
 * Shuffles archers while trying to avoid same-club conflicts on the same target
 */
function shuffleAvoidingClubConflicts(archers: ArcherWithDistance[]): ArcherWithDistance[] {
    // Group by club
    const byClub = new Map<string, ArcherWithDistance[]>();
    const noClub: ArcherWithDistance[] = [];

    for (const archer of archers) {
        if (archer.club) {
            if (!byClub.has(archer.club)) {
                byClub.set(archer.club, []);
            }
            byClub.get(archer.club)!.push(archer);
        } else {
            noClub.push(archer);
        }
    }

    // Sort clubs by size (largest first for better distribution)
    const sortedClubs = Array.from(byClub.entries())
        .sort((a, b) => b[1].length - a[1].length);

    // Interleave archers from different clubs
    const result: ArcherWithDistance[] = [];
    let hasMore = true;

    while (hasMore) {
        hasMore = false;
        for (const [, clubArchers] of sortedClubs) {
            if (clubArchers.length > 0) {
                result.push(clubArchers.shift()!);
                hasMore = true;
            }
        }
    }

    // Add archers without clubs at the end
    result.push(...noClub);

    return result;
}

/**
 * Assigns archers to targets following World Archery rules
 * - Groups by category/gender/distance
 * - 4 archers per target (positions A, B, C, D)
 * - Turns: A and B shoot together, C and D shoot together
 * - Avoids same-club archers on same target when possible
 */
export function generateAssignments(
    archers: Archer[],
    tournamentType: "indoor" | "outdoor",
    startingTargetNumber: number = 1
): { assignments: AssignmentResult[]; targetCount: number } {
    const groups = groupArchers(archers, tournamentType);
    const assignments: AssignmentResult[] = [];
    let currentTarget = startingTargetNumber;

    // Process each group
    for (const [, groupArchers] of groups) {
        // Shuffle to avoid club conflicts
        const shuffled = shuffleAvoidingClubConflicts(groupArchers);
        const positions: TargetPosition[] = ["A", "B", "C", "D"];
        const turns: ShootingTurn[] = ["AB", "AB", "CD", "CD"];

        // Assign in groups of 4
        for (let i = 0; i < shuffled.length; i++) {
            const positionIndex = i % 4;

            // Move to next target when we've filled one
            if (i > 0 && positionIndex === 0) {
                currentTarget++;
            }

            assignments.push({
                archer_id: shuffled[i].id,
                target_number: currentTarget,
                position: positions[positionIndex],
                turn: turns[positionIndex],
                distance: shuffled[i].distance,
            });
        }

        // Move to next target for the next group
        if (groupArchers.length > 0) {
            currentTarget++;
        }
    }

    return {
        assignments,
        targetCount: currentTarget - startingTargetNumber,
    };
}

/**
 * Validates that assignments don't have club conflicts
 * Returns list of target numbers with conflicts
 */
export function checkClubConflicts(
    assignments: AssignmentResult[],
    archers: Archer[]
): number[] {
    const archerMap = new Map(archers.map((a) => [a.id, a]));
    const targetArchers = new Map<number, Archer[]>();

    for (const assignment of assignments) {
        const archer = archerMap.get(assignment.archer_id);
        if (!archer) continue;

        if (!targetArchers.has(assignment.target_number)) {
            targetArchers.set(assignment.target_number, []);
        }
        targetArchers.get(assignment.target_number)!.push(archer);
    }

    const conflictTargets: number[] = [];

    for (const [targetNumber, archersOnTarget] of targetArchers) {
        const clubs = archersOnTarget
            .filter((a) => a.club)
            .map((a) => a.club);

        const uniqueClubs = new Set(clubs);
        if (clubs.length > uniqueClubs.size) {
            conflictTargets.push(targetNumber);
        }
    }

    return conflictTargets;
}
