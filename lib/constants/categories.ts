// Age categories and distances

import type { AgeCategory, Gender } from "@/types/database";

// Category labels for display
export const CATEGORY_LABELS: Record<AgeCategory, string> = {
    u10: "Sub 10",
    u13: "Sub 13",
    u15: "Sub 15",
    u18: "Sub 18",
    u21: "Sub 21",
    senior: "Mayores",
    master: "Senior",
    open: "Abierto",
};

// Gender labels
export const GENDER_LABELS: Record<Gender, string> = {
    male: "Masculino",
    female: "Femenino",
};

// Distances by category (in meters) for outdoor tournaments
export const OUTDOOR_DISTANCES: Record<AgeCategory, number> = {
    u10: 20,
    u13: 40,
    u15: 50,
    u18: 60,
    u21: 70,
    senior: 70,
    master: 70,
    open: 70,
};

// Distances for indoor tournaments
export const INDOOR_DISTANCES: Record<AgeCategory, number> = {
    u10: 18,
    u13: 18,
    u15: 18,
    u18: 18,
    u21: 18,
    senior: 18,
    master: 18,
    open: 18,
};

// Get distance based on tournament type
export function getDistance(
    category: AgeCategory,
    tournamentType: "indoor" | "outdoor"
): number {
    return tournamentType === "outdoor"
        ? OUTDOOR_DISTANCES[category]
        : INDOOR_DISTANCES[category];
}

// Get category key (for grouping in assignments)
export function getCategoryKey(
    category: AgeCategory,
    gender: Gender,
    distance: number
): string {
    return `${category}-${gender}-${distance}`;
}

// Parse category key
export function parseCategoryKey(key: string): {
    category: AgeCategory;
    gender: Gender;
    distance: number;
} {
    const [category, gender, distance] = key.split("-");
    return {
        category: category as AgeCategory,
        gender: gender as Gender,
        distance: parseInt(distance),
    };
}

// Category colors for visual distinction
export const CATEGORY_COLORS: Record<AgeCategory, string> = {
    u10: "bg-pink-100 text-pink-800 border-pink-300",
    u13: "bg-purple-100 text-purple-800 border-purple-300",
    u15: "bg-blue-100 text-blue-800 border-blue-300",
    u18: "bg-cyan-100 text-cyan-800 border-cyan-300",
    u21: "bg-green-100 text-green-800 border-green-300",
    senior: "bg-yellow-100 text-yellow-800 border-yellow-300",
    master: "bg-orange-100 text-orange-800 border-orange-300",
    open: "bg-gray-100 text-gray-800 border-gray-300",
};
