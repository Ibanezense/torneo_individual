"use client";

import { cn } from "@/lib/utils";
import { getScoreColors, scoreToLabel } from "@/lib/utils/scoring";

interface ArrowDisplayProps {
    scores: (number | null)[];
    currentIndex?: number;
    arrowsPerEnd: number;
    size?: "sm" | "md" | "lg";
    onArrowClick?: (index: number) => void;
}

const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
};

export function ArrowDisplay({
    scores,
    currentIndex,
    arrowsPerEnd,
    size = "md",
    onArrowClick,
}: ArrowDisplayProps) {
    // Ensure we have the right number of arrow slots
    const displayScores = [...scores];
    while (displayScores.length < arrowsPerEnd) {
        displayScores.push(null);
    }

    return (
        <div className="flex items-center justify-center gap-2">
            {displayScores.slice(0, arrowsPerEnd).map((score, index) => {
                const colors = getScoreColors(score);
                const isCurrent = index === currentIndex;
                const isClickable = onArrowClick !== undefined;

                return (
                    <button
                        key={index}
                        onClick={() => onArrowClick?.(index)}
                        disabled={!isClickable}
                        className={cn(
                            "flex items-center justify-center rounded-lg font-bold transition-all",
                            sizeClasses[size],
                            colors.bg,
                            colors.text,
                            isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                            isClickable && "cursor-pointer hover:brightness-110 active:scale-95",
                            !isClickable && "cursor-default"
                        )}
                    >
                        {scoreToLabel(score)}
                    </button>
                );
            })}
        </div>
    );
}

interface EndSummaryProps {
    scores: (number | null)[];
    endNumber: number;
    isConfirmed?: boolean;
}

export function EndSummary({ scores, endNumber, isConfirmed }: EndSummaryProps) {
    const total = scores.reduce<number>((sum, s) => {
        if (s === null) return sum;
        return sum + (s === 11 ? 10 : s);
    }, 0);

    const xCount = scores.filter((s) => s === 11).length;

    return (
        <div
            className={cn(
                "flex items-center justify-between rounded-lg border p-3",
                isConfirmed && "bg-green-500/10 border-green-500"
            )}
        >
            <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">
                    Ronda {endNumber}
                </span>
                <ArrowDisplay scores={scores} arrowsPerEnd={scores.length} size="sm" />
            </div>
            <div className="flex items-center gap-4">
                {xCount > 0 && (
                    <span className="text-xs text-yellow-500 font-medium">
                        {xCount}X
                    </span>
                )}
                <span className="text-lg font-bold">{total}</span>
            </div>
        </div>
    );
}
