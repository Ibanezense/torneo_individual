// World Archery rules and constants

// Scoring values
export const SCORE_VALUES = {
    X: 11,  // Inner 10 (X)
    MAX: 10,
    MIN: 0, // Miss (M)
} as const;

// Display labels for scores
export const SCORE_LABELS: Record<number, string> = {
    11: "X",
    10: "10",
    9: "9",
    8: "8",
    7: "7",
    6: "6",
    5: "5",
    4: "4",
    3: "3",
    2: "2",
    1: "1",
    0: "M",
};

// Colors for score display
export const SCORE_COLORS: Record<number, { bg: string; text: string }> = {
    11: { bg: "bg-yellow-400", text: "text-black" },  // X - Yellow/Gold
    10: { bg: "bg-yellow-400", text: "text-black" },  // 10 - Yellow/Gold
    9: { bg: "bg-yellow-300", text: "text-black" },   // 9 - Light Yellow
    8: { bg: "bg-red-500", text: "text-white" },      // 8 - Red
    7: { bg: "bg-red-400", text: "text-white" },      // 7 - Light Red
    6: { bg: "bg-blue-500", text: "text-white" },     // 6 - Blue
    5: { bg: "bg-blue-400", text: "text-white" },     // 5 - Light Blue
    4: { bg: "bg-gray-800", text: "text-white" },     // 4 - Black
    3: { bg: "bg-gray-700", text: "text-white" },     // 3 - Dark Gray
    2: { bg: "bg-gray-100", text: "text-black" },     // 2 - White
    1: { bg: "bg-gray-50", text: "text-black" },      // 1 - Light White
    0: { bg: "bg-green-600", text: "text-white" },    // M (Miss) - Green (grass)
};

// Set system (elimination rounds)
export const SET_SYSTEM = {
    POINTS_TO_WIN: 6,
    POINTS_FOR_SET_WIN: 2,
    POINTS_FOR_SET_TIE: 1,
    POINTS_FOR_SET_LOSS: 0,
    ARROWS_PER_SET: 3,
    MAX_SETS: 5,
} as const;

// Qualification round configurations
export const QUALIFICATION_CONFIGS = {
    outdoor_70m: {
        totalArrows: 72,
        arrowsPerEnd: 6,
        totalEnds: 12,
        timePerEnd: 240, // 4 minutes
    },
    indoor_18m: {
        totalArrows: 60,
        arrowsPerEnd: 3,
        totalEnds: 20,
        timePerEnd: 120, // 2 minutes
    },
} as const;

// Bracket sizes (power of 2)
export const BRACKET_SIZES = [8, 16, 32, 64, 128] as const;

// Seeding for brackets (matchups for each bracket size)
// World Archery format: #1 at top (B1), #2 at bottom (last match) - they only meet in finals
// 
// For 8-player bracket:
//   Top Half: B1(1v8), B2(4v5) -> Semi A
//   Bottom Half: B3(3v6), B4(2v7) -> Semi B
//
// For 16-player bracket (9 archers = 7 byes at positions 10-16):
//   B1: 1 vs 16 (bye)
//   B2: 8 vs 9
//   B3: 5 vs 12 (bye)
//   B4: 4 vs 13 (bye)
//   B5: 3 vs 14 (bye)
//   B6: 6 vs 11 (bye)
//   B7: 7 vs 10 (bye)
//   B8: 2 vs 15 (bye)
//
export const BRACKET_SEEDINGS: Record<number, [number, number][]> = {
    8: [
        [1, 8],   // B1 - Top
        [4, 5],   // B2 - Top
        [3, 6],   // B3 - Bottom
        [2, 7],   // B4 - Bottom (#2 at opposite end)
    ],
    16: [
        [1, 16],  // B1 - #1 at top
        [8, 9],   // B2
        [5, 12],  // B3
        [4, 13],  // B4
        [3, 14],  // B5
        [6, 11],  // B6
        [7, 10],  // B7
        [2, 15],  // B8 - #2 at bottom
    ],
    32: [
        // Top Half (B1-B8)
        [1, 32], [16, 17], [9, 24], [8, 25],
        [5, 28], [12, 21], [13, 20], [4, 29],
        // Bottom Half (B9-B16)
        [3, 30], [14, 19], [11, 22], [6, 27],
        [7, 26], [10, 23], [15, 18], [2, 31],
    ],
};
