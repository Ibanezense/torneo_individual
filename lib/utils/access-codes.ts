// Access code generation utilities

/**
 * Generates a short, human-readable access code
 * Format: 6 characters alphanumeric (uppercase)
 * Example: "A3X7K2"
 */
export function generateAccessCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed similar chars (0,O,1,I)
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Generates a target-based access code for qualification
 * Format: T{target_number}-{position}
 * Example: "T5A", "T12C"
 */
export function generateTargetCode(targetNumber: number, position: string): string {
    return `T${targetNumber}${position}`;
}

/**
 * Generates a match-based access code for elimination
 * Format: M{round}-{position}
 * Example: "M1-A3" (Round 1, Match 3, Archer A)
 */
export function generateMatchCode(
    roundNumber: number,
    matchPosition: number,
    archerPosition: "A" | "B"
): string {
    return `M${roundNumber}-${matchPosition}${archerPosition}`;
}

/**
 * Validates an access code format
 */
export function isValidAccessCode(code: string): boolean {
    // Target code: T followed by number and position letter
    if (/^T\d{1,2}[A-D]$/i.test(code)) {
        return true;
    }
    // Match code: M followed by round-matchPosition and A/B
    if (/^M\d+-\d+[AB]$/i.test(code)) {
        return true;
    }
    // Random code: 6 alphanumeric
    if (/^[A-Z0-9]{6}$/i.test(code)) {
        return true;
    }
    return false;
}

/**
 * Parses an access code to determine its type
 */
export function parseAccessCode(code: string): {
    type: "target" | "match" | "random";
    targetNumber?: number;
    position?: string;
    roundNumber?: number;
    matchPosition?: number;
    archerPosition?: "A" | "B";
} | null {
    const upperCode = code.toUpperCase().trim();

    // Target code: T{number}{position}
    const targetMatch = upperCode.match(/^T(\d{1,2})([A-D])$/);
    if (targetMatch) {
        return {
            type: "target",
            targetNumber: parseInt(targetMatch[1]),
            position: targetMatch[2],
        };
    }

    // Match code: M{round}-{match}{archer}
    const matchMatch = upperCode.match(/^M(\d+)-(\d+)([AB])$/);
    if (matchMatch) {
        return {
            type: "match",
            roundNumber: parseInt(matchMatch[1]),
            matchPosition: parseInt(matchMatch[2]),
            archerPosition: matchMatch[3] as "A" | "B",
        };
    }

    // Random 6-char code
    if (/^[A-Z0-9]{6}$/.test(upperCode)) {
        return { type: "random" };
    }

    return null;
}
