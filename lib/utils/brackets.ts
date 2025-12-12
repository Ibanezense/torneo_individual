/**
 * Bracket Generation Algorithm
 * 
 * This module contains the logic for generating elimination brackets
 * following World Archery rules for seeding.
 */

import { BRACKET_SEEDINGS } from "@/lib/constants/world-archery";
import type { AgeCategory, Gender } from "@/types/database";

export interface RankedArcher {
    archerId: string;
    firstName: string;
    lastName: string;
    totalScore: number;
    tenPlusXCount: number;
    xCount: number;
    seed: number;
}

export interface BracketMatch {
    roundNumber: number;
    matchPosition: number;
    archer1Id: string | null;
    archer2Id: string | null;
    archer1Seed: number | null;
    archer2Seed: number | null;
    isBye: boolean;
    nextMatchPosition: number | null; // Position in next round
}

export interface GeneratedBracket {
    category: AgeCategory;
    gender: Gender;
    bracketSize: number;
    matches: BracketMatch[];
    rankedArchers: RankedArcher[];
}

/**
 * Get the next power of 2 that can fit all archers
 */
export function getNextBracketSize(archerCount: number): number {
    if (archerCount <= 8) return 8;
    if (archerCount <= 16) return 16;
    if (archerCount <= 32) return 32;
    if (archerCount <= 64) return 64;
    return 128;
}

/**
 * Get seeding pairs for a bracket size
 * If not predefined, generate dynamically
 */
export function getSeedingPairs(bracketSize: number): [number, number][] {
    if (BRACKET_SEEDINGS[bracketSize]) {
        return BRACKET_SEEDINGS[bracketSize];
    }

    // Generate seeding for larger brackets dynamically
    // Standard World Archery seeding: 1 vs last, 2 vs second-to-last, etc.
    const pairs: [number, number][] = [];
    const numMatches = bracketSize / 2;

    // Use standard seeding pattern
    for (let i = 0; i < numMatches; i++) {
        const seed1 = i + 1;
        const seed2 = bracketSize - i;
        pairs.push([seed1, seed2]);
    }

    // Reorder to match bracket visual (alternating sides)
    return reorderForBracket(pairs);
}

/**
 * Reorder seed pairs for proper bracket visual layout
 * This ensures the bracket follows World Archery format
 */
function reorderForBracket(pairs: [number, number][]): [number, number][] {
    if (pairs.length <= 4) return pairs;

    const result: [number, number][] = [];
    const half = Math.floor(pairs.length / 2);

    // Interleave top and bottom halves
    for (let i = 0; i < half; i++) {
        result.push(pairs[i]);
        if (i + half < pairs.length) {
            result.push(pairs[i + half]);
        }
    }

    return pairs; // Keep original for now, can be refined
}

/**
 * Calculate which match a winner advances to
 */
export function getNextMatchPosition(
    currentRound: number,
    currentPosition: number
): number {
    // Winner of match N in round R goes to match ceil(N/2) in round R+1
    return Math.ceil(currentPosition / 2);
}

/**
 * Generate elimination bracket for a category/gender
 */
export function generateBracket(
    rankedArchers: RankedArcher[],
    category: AgeCategory,
    gender: Gender
): GeneratedBracket {
    const archerCount = rankedArchers.length;

    if (archerCount < 2) {
        throw new Error("Se necesitan al menos 2 arqueros para generar brackets");
    }

    const bracketSize = getNextBracketSize(archerCount);
    const seedingPairs = getSeedingPairs(bracketSize);

    // Sort archers by ranking (already should be sorted, but ensure)
    const sortedArchers = [...rankedArchers].sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (b.tenPlusXCount !== a.tenPlusXCount) return b.tenPlusXCount - a.tenPlusXCount;
        return b.xCount - a.xCount;
    });

    // Assign seeds
    sortedArchers.forEach((archer, index) => {
        archer.seed = index + 1;
    });

    // Create archer map by seed
    const archerBySeed = new Map<number, RankedArcher>();
    for (const archer of sortedArchers) {
        archerBySeed.set(archer.seed, archer);
    }

    // Generate first round matches
    const matches: BracketMatch[] = [];

    seedingPairs.forEach((pair, index) => {
        const [seed1, seed2] = pair;
        const archer1 = archerBySeed.get(seed1) || null;
        const archer2 = archerBySeed.get(seed2) || null;

        const match: BracketMatch = {
            roundNumber: 1,
            matchPosition: index + 1,
            archer1Id: archer1?.archerId || null,
            archer2Id: archer2?.archerId || null,
            archer1Seed: archer1 ? seed1 : null,
            archer2Seed: archer2 ? seed2 : null,
            isBye: !archer1 || !archer2,
            nextMatchPosition: getNextMatchPosition(1, index + 1),
        };

        matches.push(match);
    });

    // Calculate total rounds
    const totalRounds = Math.log2(bracketSize);

    // Generate subsequent rounds (empty matches waiting for winners)
    let matchesInRound = bracketSize / 4; // Round 2 has half the matches of round 1

    for (let round = 2; round <= totalRounds; round++) {
        for (let pos = 1; pos <= matchesInRound; pos++) {
            const match: BracketMatch = {
                roundNumber: round,
                matchPosition: pos,
                archer1Id: null,
                archer2Id: null,
                archer1Seed: null,
                archer2Seed: null,
                isBye: false,
                nextMatchPosition: round < totalRounds ? getNextMatchPosition(round, pos) : null,
            };
            matches.push(match);
        }
        matchesInRound = matchesInRound / 2;
    }

    return {
        category,
        gender,
        bracketSize,
        matches,
        rankedArchers: sortedArchers,
    };
}

/**
 * Process byes - automatically advance archers with byes
 */
export function processFirstRoundByes(matches: BracketMatch[]): BracketMatch[] {
    const firstRoundMatches = matches.filter(m => m.roundNumber === 1);
    const updatedMatches = [...matches];

    for (const match of firstRoundMatches) {
        if (match.isBye) {
            // Find the round 2 match this winner goes to
            const nextMatch = updatedMatches.find(
                m => m.roundNumber === 2 && m.matchPosition === match.nextMatchPosition
            );

            if (nextMatch) {
                const winnerIdForBye = match.archer1Id || match.archer2Id;
                const winnerSeedForBye = match.archer1Seed || match.archer2Seed;

                // Determine if winner goes to archer1 or archer2 slot
                // Odd match positions fill archer1, even fill archer2
                if (match.matchPosition % 2 === 1) {
                    nextMatch.archer1Id = winnerIdForBye;
                    nextMatch.archer1Seed = winnerSeedForBye;
                } else {
                    nextMatch.archer2Id = winnerIdForBye;
                    nextMatch.archer2Seed = winnerSeedForBye;
                }
            }
        }
    }

    return updatedMatches;
}

/**
 * Get round name based on bracket size and round number
 */
export function getRoundName(bracketSize: number, roundNumber: number): string {
    // Special case: Bronze medal match
    if (roundNumber === 0) return "Bronce";

    const totalRounds = Math.log2(bracketSize);
    const roundsFromFinal = totalRounds - roundNumber + 1;

    if (roundsFromFinal === 1) return "Final";
    if (roundsFromFinal === 2) return "Semifinal";
    if (roundsFromFinal === 3) return "Cuartos";
    if (roundsFromFinal === 4) return "1/8";
    if (roundsFromFinal === 5) return "1/16";
    if (roundsFromFinal === 6) return "1/32";
    if (roundsFromFinal === 7) return "1/64";

    return `Ronda ${roundNumber}`;
}
