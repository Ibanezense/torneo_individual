// Scoring utility functions
import { SCORE_VALUES, SCORE_LABELS, SCORE_COLORS, SET_SYSTEM } from "@/lib/constants/world-archery";
import type { QualificationScore } from "@/types/database";

/**
 * Converts numeric score to display label
 */
export function scoreToLabel(score: number | null): string {
    if (score === null) return "-";
    return SCORE_LABELS[score] || String(score);
}

/**
 * Gets CSS classes for score display
 */
export function getScoreColors(score: number | null): { bg: string; text: string } {
    if (score === null) return { bg: "bg-muted", text: "text-muted-foreground" };
    return SCORE_COLORS[score] || { bg: "bg-gray-200", text: "text-black" };
}

/**
 * Calculates total score from an array of scores
 */
export function calculateTotal(scores: (number | null)[]): number {
    return scores.reduce<number>((sum, score) => {
        if (score === null) return sum;
        // X (11) counts as 10 for total
        return sum + (score === 11 ? 10 : score);
    }, 0);
}

/**
 * Counts X's (inner 10s) in an array of scores
 */
export function countXs(scores: (number | null)[]): number {
    return scores.filter((s) => s === 11).length;
}

/**
 * Counts 10s and Xs in an array of scores
 */
export function countTens(scores: (number | null)[]): number {
    return scores.filter((s) => s === 10 || s === 11).length;
}

/**
 * Validates if a score value is valid
 */
export function isValidScore(value: number): boolean {
    return value >= SCORE_VALUES.MIN && value <= SCORE_VALUES.X;
}

/**
 * Calculates set result based on totals
 * Returns: 2 for win, 1 for tie, 0 for loss
 */
export function calculateSetResult(
    archer1Total: number,
    archer2Total: number
): { archer1: number; archer2: number } {
    if (archer1Total > archer2Total) {
        return { archer1: SET_SYSTEM.POINTS_FOR_SET_WIN, archer2: SET_SYSTEM.POINTS_FOR_SET_LOSS };
    } else if (archer1Total < archer2Total) {
        return { archer1: SET_SYSTEM.POINTS_FOR_SET_LOSS, archer2: SET_SYSTEM.POINTS_FOR_SET_WIN };
    }
    return { archer1: SET_SYSTEM.POINTS_FOR_SET_TIE, archer2: SET_SYSTEM.POINTS_FOR_SET_TIE };
}

/**
 * Checks if a match is won (reached points to win)
 */
export function isMatchWon(setPoints: number): boolean {
    return setPoints >= SET_SYSTEM.POINTS_TO_WIN;
}

/**
 * Checks if a shoot-off is needed (both at 5 points after 5 sets)
 */
export function needsShootoff(archer1Points: number, archer2Points: number): boolean {
    return archer1Points === 5 && archer2Points === 5;
}

/**
 * Groups qualification scores by end
 */
export function groupScoresByEnd(
    scores: QualificationScore[],
    arrowsPerEnd: number
): Map<number, QualificationScore[]> {
    const ends = new Map<number, QualificationScore[]>();

    for (const score of scores) {
        if (!ends.has(score.end_number)) {
            ends.set(score.end_number, []);
        }
        ends.get(score.end_number)!.push(score);
    }

    // Sort arrows within each end
    for (const [, endScores] of ends) {
        endScores.sort((a, b) => a.arrow_number - b.arrow_number);
    }

    return ends;
}

/**
 * Calculates cumulative score up to a specific end
 */
export function calculateCumulativeScore(
    scores: QualificationScore[],
    upToEnd: number
): number {
    return scores
        .filter((s) => s.end_number <= upToEnd && s.score !== null)
        .reduce<number>((sum, s) => sum + (s.score === 11 ? 10 : s.score!), 0);
}
